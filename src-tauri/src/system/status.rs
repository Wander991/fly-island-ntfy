//! Live PC status for the island's System page, plus a whitelisted launcher for
//! built-in Windows tools. Every sampler is best-effort: an unsupported counter
//! reports 0 / null rather than failing the whole page.

use serde::Serialize;
use std::{
    mem::size_of,
    sync::Mutex,
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};
use windows::{
    core::{w, PCWSTR},
    Win32::{
        Foundation::{FILETIME, HWND},
        NetworkManagement::IpHelper::{FreeMibTable, GetIfTable2, MIB_IF_TABLE2},
        System::{
            Performance::{
                PdhAddEnglishCounterW, PdhCloseQuery, PdhCollectQueryData,
                PdhGetFormattedCounterArrayW, PdhOpenQueryW, PDH_FMT_COUNTERVALUE_ITEM_W,
                PDH_FMT_DOUBLE, PDH_HCOUNTER, PDH_HQUERY,
            },
            SystemInformation::{GetTickCount64, GlobalMemoryStatusEx, MEMORYSTATUSEX},
            Threading::GetSystemTimes,
        },
        UI::{
            Shell::ShellExecuteW,
            WindowsAndMessaging::SW_SHOWNORMAL,
        },
    },
};

#[derive(Clone, Debug, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemStatus {
    /// 0–100; 0 until the second sample has been taken.
    cpu_percent: f64,
    ram_percent: f64,
    /// null when the machine has no readable GPU engine counter.
    gpu_percent: Option<f64>,
    upload_bps: f64,
    download_bps: f64,
    uptime_seconds: u64,
    timestamp: u64,
}

#[derive(Clone, Copy)]
struct Sample {
    cpu_idle: u64,
    cpu_total: u64,
    net_in: u64,
    net_out: u64,
}

struct Sampler {
    previous: Option<(Sample, Instant)>,
}

impl Sampler {
    const fn new() -> Self {
        Self { previous: None }
    }
}

static SAMPLER: Mutex<Sampler> = Mutex::new(Sampler::new());

fn filetime(value: FILETIME) -> u64 {
    ((value.dwHighDateTime as u64) << 32) | value.dwLowDateTime as u64
}

fn cpu_times() -> (u64, u64) {
    let mut idle = FILETIME::default();
    let mut kernel = FILETIME::default();
    let mut user = FILETIME::default();
    // SAFETY: three valid locals are passed; GetSystemTimes only writes to them.
    if unsafe { GetSystemTimes(Some(&mut idle), Some(&mut kernel), Some(&mut user)) }.is_err() {
        return (0, 0);
    }
    // Kernel time already includes idle time; total = kernel + user.
    (filetime(idle), filetime(kernel) + filetime(user))
}

fn ram_percent() -> f64 {
    let mut memory = MEMORYSTATUSEX {
        dwLength: size_of::<MEMORYSTATUSEX>() as u32,
        ..Default::default()
    };
    // SAFETY: memory is a fully initialised, correctly sized MEMORYSTATUSEX.
    if unsafe { GlobalMemoryStatusEx(&mut memory) }.is_err() {
        return 0.0;
    }
    f64::from(memory.dwMemoryLoad)
}

fn network_totals() -> (u64, u64) {
    let mut table: *mut MIB_IF_TABLE2 = std::ptr::null_mut();
    // SAFETY: GetIfTable2 allocates the table and FreeMibTable releases it again.
    unsafe {
        if GetIfTable2(&mut table).0 != 0 || table.is_null() {
            return (0, 0);
        }
        let count = (*table).NumEntries as usize;
        let rows = (*table).Table.as_ptr();
        let mut received = 0u64;
        let mut sent = 0u64;
        for index in 0..count {
            let row = &*rows.add(index);
            received = received.saturating_add(row.InOctets);
            sent = sent.saturating_add(row.OutOctets);
        }
        FreeMibTable(table.cast());
        (received, sent)
    }
}

/// Peak utilisation across GPU engines, read from the language-independent
/// English PDH counter path (works on Chinese Windows too).
fn gpu_percent() -> Option<f64> {
    const MAX_ITEMS: usize = 512;
    let mut query = PDH_HQUERY::default();
    // SAFETY: query is a valid out-param; every early return closes it.
    if unsafe { PdhOpenQueryW(PCWSTR::null(), 0, &mut query) } != 0 {
        return None;
    }
    let mut counter = PDH_HCOUNTER::default();
    // SAFETY: the query was opened above and the path is a static UTF-16 literal.
    let added = unsafe {
        PdhAddEnglishCounterW(
            query,
            w!(r"\GPU Engine(*)\Utilization Percentage"),
            0,
            &mut counter,
        )
    };
    if added != 0 {
        // SAFETY: query is valid and opened in this call.
        unsafe { PdhCloseQuery(query) };
        return None;
    }
    // Two samples: the counter is a timer, so the first collect only primes it.
    // SAFETY: query is valid for both collects.
    unsafe {
        PdhCollectQueryData(query);
    }
    std::thread::sleep(Duration::from_millis(160));
    // SAFETY: query is valid for both collects.
    unsafe {
        PdhCollectQueryData(query);
    }
    let mut items = vec![PDH_FMT_COUNTERVALUE_ITEM_W::default(); MAX_ITEMS];
    let mut bytes = (MAX_ITEMS * size_of::<PDH_FMT_COUNTERVALUE_ITEM_W>()) as u32;
    let mut count = 0u32;
    // SAFETY: items is MAX_ITEMS long and bytes describes its size in bytes.
    let code = unsafe {
        PdhGetFormattedCounterArrayW(
            counter,
            PDH_FMT_DOUBLE,
            &mut bytes,
            &mut count,
            Some(items.as_mut_ptr()),
        )
    };
    // SAFETY: query is valid and no longer needed after the values are read.
    unsafe { PdhCloseQuery(query) };
    if code != 0 {
        return None;
    }
    let mut peak = 0.0f64;
    for item in items.iter().take(count.min(MAX_ITEMS as u32) as usize) {
        // SAFETY: PDH_FMT_DOUBLE was requested, so the double member is the one written.
        let value = unsafe { item.FmtValue.Anonymous.doubleValue };
        if value.is_finite() && value > peak {
            peak = value;
        }
    }
    Some(peak.clamp(0.0, 100.0))
}

fn read_status() -> SystemStatus {
    let (cpu_idle, cpu_total) = cpu_times();
    let (net_in, net_out) = network_totals();
    let now = Instant::now();
    let (cpu_percent, upload_bps, download_bps) = {
        let mut sampler = match SAMPLER.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        let current = Sample { cpu_idle, cpu_total, net_in, net_out };
        let values = match sampler.previous {
            Some((prev, at)) => {
                let seconds = now.duration_since(at).as_secs_f64();
                let cpu = if seconds > 0.0 && current.cpu_total > prev.cpu_total {
                    let idle_delta = current.cpu_idle.saturating_sub(prev.cpu_idle) as f64;
                    let total_delta = (current.cpu_total - prev.cpu_total) as f64;
                    ((1.0 - idle_delta / total_delta) * 100.0).clamp(0.0, 100.0)
                } else {
                    0.0
                };
                let scale = if seconds > 0.05 { 1.0 / seconds } else { 0.0 };
                let down = current.net_in.saturating_sub(prev.net_in) as f64 * scale;
                let up = current.net_out.saturating_sub(prev.net_out) as f64 * scale;
                (cpu, up, down)
            }
            None => (0.0, 0.0, 0.0),
        };
        sampler.previous = Some((current, now));
        values
    };
    SystemStatus {
        cpu_percent: round1(cpu_percent),
        ram_percent: round1(ram_percent()),
        gpu_percent: gpu_percent().map(round1),
        upload_bps,
        download_bps,
        // SAFETY: GetTickCount64 has no preconditions.
        uptime_seconds: unsafe { GetTickCount64() } / 1000,
        timestamp: SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_millis() as u64,
    }
}

fn round1(value: f64) -> f64 {
    (value * 10.0).round() / 10.0
}

/// The island's System page polls this. Sampling runs off the UI thread so the
/// short GPU settle never stalls a click.
#[tauri::command]
pub async fn get_system_status() -> SystemStatus {
    tauri::async_runtime::spawn_blocking(read_status)
        .await
        .unwrap_or_default()
}

/// Only these built-in tools can be launched; a string from the webview can
/// never turn into an arbitrary command line.
const TOOLS: &[(&str, &str, &str)] = &[
    ("taskManager", "taskmgr.exe", ""),
    ("resourceMonitor", "resmon.exe", ""),
    ("deviceManager", "mmc.exe", "devmgmt.msc"),
    ("diskManagement", "mmc.exe", "diskmgmt.msc"),
    ("controlPanel", "control.exe", ""),
    ("networkConnections", "control.exe", "ncpa.cpl"),
    ("systemProperties", "SystemPropertiesPerformance.exe", ""),
    ("systemInfo", "msinfo32.exe", ""),
    ("diskCleanup", "cleanmgr.exe", ""),
    ("settings", "ms-settings:", ""),
    ("calculator", "calc.exe", ""),
    ("notepad", "notepad.exe", ""),
    ("snippingTool", "snippingtool.exe", ""),
    ("terminal", "wt.exe", ""),
    ("eventViewer", "eventvwr.msc", ""),
    ("services", "services.msc", ""),
];

fn wide(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[tauri::command]
pub fn launch_system_tool(tool: String) -> Result<(), String> {
    let (_, program, parameters) = TOOLS
        .iter()
        .find(|(id, _, _)| *id == tool)
        .ok_or_else(|| "未知的系统工具。".to_string())?;
    let operation = wide("open");
    let file = wide(program);
    let arguments = wide(parameters);
    let directory = wide("");
    // SAFETY: all four buffers outlive the call and are NUL-terminated UTF-16.
    let result = unsafe {
        ShellExecuteW(
            Some(HWND::default()),
            PCWSTR(operation.as_ptr()),
            PCWSTR(file.as_ptr()),
            PCWSTR(arguments.as_ptr()),
            PCWSTR(directory.as_ptr()),
            SW_SHOWNORMAL,
        )
    };
    // ShellExecuteW returns an HINSTANCE-like value; <= 32 means failure.
    if result.0 as isize > 32 {
        Ok(())
    } else {
        Err(format!("无法打开 {program}。"))
    }
}

/// The tool ids the page may offer, in the order shown.
#[tauri::command]
pub fn system_tool_ids() -> Vec<String> {
    TOOLS.iter().map(|(id, _, _)| (*id).to_string()).collect()
}
