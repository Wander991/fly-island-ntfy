//! Reads the latest WeChat conversation (sender + message body) through UI
//! Automation when a new-message flash is caught. This is best-effort: any
//! failure returns `None` and the reminder falls back to a generic "新消息"
//! preview, so a WeChat version whose accessibility tree differs never breaks
//! the reminder.

use std::{
    collections::VecDeque,
    time::{Duration, Instant},
};
use windows::{
    core::Interface,
    Win32::{
        Foundation::HWND,
        System::Com::{
            CoCreateInstance, CoInitializeEx, CoUninitialize, CLSCTX_INPROC_SERVER,
            COINIT_MULTITHREADED,
        },
        UI::Accessibility::{
            CUIAutomation8, IUIAutomation, IUIAutomation2, IUIAutomationElement,
            UIA_ListItemControlTypeId, UIA_TextControlTypeId,
        },
    },
};

/// Where to stop walking; WeChat lists can be deep, and a single bad node must
/// never hang the reminder thread.
const MAX_NODES: usize = 512;
const WALK_TIMEOUT: Duration = Duration::from_secs(3);

/// The sender and the last message of the most recent conversation, or `None`.
pub type WeChatContent = Option<(String, String)>;

/// Inspects the WeChat window at `handle` and returns the top conversation's
/// sender and latest message text. Returns `None` when automation is
/// unavailable, the tree is unexpected, or anything times out.
pub fn read_latest_message(handle: HWND) -> WeChatContent {
    // SAFETY: CoInitializeEx on this thread; paired with CoUninitialize below.
    // A separate thread calls this once per flash, so the apartment is scoped to
    // the call.
    if unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) }.is_err() {
        return None;
    }
    let result = inspect(handle);
    // SAFETY: ends the apartment opened above, on the same thread.
    unsafe { CoUninitialize() };
    result
}

fn inspect(window: HWND) -> WeChatContent {
    // SAFETY: COM is initialized for the whole call by read_latest_message.
    let automation: IUIAutomation = unsafe {
        CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER).ok()?
    };
    // Short timeouts so a stuck WeChat window cannot block the reminder thread.
    if let Ok(automation2) = automation.cast::<IUIAutomation2>() {
        let _ = unsafe { automation2.SetConnectionTimeout(1000) };
        let _ = unsafe { automation2.SetTransactionTimeout(1000) };
    }
    let root = unsafe { automation.ElementFromHandle(window).ok()? };

    let walker = unsafe { automation.ControlViewWalker().ok()? };
    let mut queue: VecDeque<(IUIAutomationElement, usize)> = VecDeque::from([(root, 0)]);
    let mut found: Option<(String, String, usize)> = None;
    let started = Instant::now();

    while let Some((element, depth)) = queue.pop_front() {
        if queue.len() + 1 > MAX_NODES || started.elapsed() > WALK_TIMEOUT {
            break;
        }
        let control = unsafe { element.CurrentControlType().unwrap_or_default() };
        // Conversation rows are ListItems (each a contact); the message text is a
        // Text control inside. The conversation list sits high in the tree, so
        // prefer the shallowest item that has both a name and a message child.
        if control == UIA_ListItemControlTypeId {
            if let Some((sender, message)) = read_item(&element) {
                let rank = depth;
                if found.as_ref().map(|f| rank < f.2).unwrap_or(true) {
                    found = Some((sender, message, rank));
                }
            }
        }
        if depth >= 10 {
            continue;
        }
        let mut next = unsafe { walker.GetFirstChildElement(&element).ok() };
        while let Some(child) = next {
            next = unsafe { walker.GetNextSiblingElement(&child).ok() };
            queue.push_back((child, depth + 1));
        }
    }

    found.map(|(sender, message, _)| (sender, message))
}

/// Reads a conversation ListItem's contact name and the first message text
/// inside it. Returns `None` when either is missing.
fn read_item(item: &IUIAutomationElement) -> Option<(String, String)> {
    let sender = name_of(item)?;
    let message = first_text_child(item)?;
    let sender = sender.trim().to_string();
    let message = message.trim().to_string();
    if sender.is_empty() || message.is_empty() {
        return None;
    }
    Some((sender, message))
}

fn name_of(element: &IUIAutomationElement) -> Option<String> {
    let name = unsafe { element.CurrentName().ok()? };
    let text = name.to_string();
    if text.is_empty() {
        None
    } else {
        Some(text)
    }
}

/// Walks the item's children for the first Text control and returns its name.
fn first_text_child(item: &IUIAutomationElement) -> Option<String> {
    let automation: IUIAutomation = unsafe {
        CoCreateInstance(&CUIAutomation8, None, CLSCTX_INPROC_SERVER).ok()?
    };
    let walker = unsafe { automation.ControlViewWalker().ok()? };
    let mut next = unsafe { walker.GetFirstChildElement(item).ok() };
    while let Some(child) = next {
        next = unsafe { walker.GetNextSiblingElement(&child).ok() };
        let control = unsafe { child.CurrentControlType().unwrap_or_default() };
        if control == UIA_TextControlTypeId {
            if let Some(text) = name_of(&child) {
                return Some(text);
            }
        }
    }
    None
}
