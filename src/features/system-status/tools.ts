import {
  Activity, Calculator, ClipboardList, Cpu, FileText, Gauge, HardDrive, Info, Layers,
  Network, Scissors, Settings, SlidersHorizontal, Terminal, Trash2, Wrench,
  type LucideIcon,
} from "lucide-react";

/** A built-in Windows tool. `id` must be whitelisted in system/status.rs TOOLS. */
export type SystemTool = { id: string; label: string; icon: LucideIcon; hint: string };

export const SYSTEM_TOOLS: readonly SystemTool[] = [
  { id: "taskManager", label: "任务管理器", icon: Activity, hint: "进程、性能与启动项" },
  { id: "resourceMonitor", label: "资源监视器", icon: Gauge, hint: "实时 CPU / 内存 / 磁盘 / 网络" },
  { id: "deviceManager", label: "设备管理器", icon: Cpu, hint: "硬件与驱动" },
  { id: "diskManagement", label: "磁盘管理", icon: HardDrive, hint: "分区与卷" },
  { id: "controlPanel", label: "控制面板", icon: SlidersHorizontal, hint: "经典系统设置" },
  { id: "networkConnections", label: "网络连接", icon: Network, hint: "适配器与网络状态" },
  { id: "systemProperties", label: "系统属性", icon: Wrench, hint: "性能选项与环境变量" },
  { id: "systemInfo", label: "系统信息", icon: Info, hint: "硬件与系统摘要" },
  { id: "diskCleanup", label: "磁盘清理", icon: Trash2, hint: "释放磁盘空间" },
  { id: "settings", label: "系统设置", icon: Settings, hint: "Windows 设置" },
  { id: "calculator", label: "计算器", icon: Calculator, hint: "计算器" },
  { id: "notepad", label: "记事本", icon: FileText, hint: "记事本" },
  { id: "snippingTool", label: "截图工具", icon: Scissors, hint: "屏幕截图" },
  { id: "terminal", label: "终端", icon: Terminal, hint: "Windows 终端" },
  { id: "eventViewer", label: "事件查看器", icon: ClipboardList, hint: "系统日志" },
  { id: "services", label: "服务", icon: Layers, hint: "Windows 服务" },
];

export function systemTool(id: string): SystemTool | undefined {
  return SYSTEM_TOOLS.find((tool) => tool.id === id);
}

/** "12 KB/s", "1.4 MB/s" — the reference widget uses one decimal only above 10. */
export function formatSpeed(bytesPerSecond: number): string {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) return "0 KB/s";
  if (bytesPerSecond < 1024) return `${Math.round(bytesPerSecond)} B/s`;
  if (bytesPerSecond < 1024 * 1024) {
    const value = bytesPerSecond / 1024;
    return `${value < 10 ? value.toFixed(1) : Math.round(value)} KB/s`;
  }
  const value = bytesPerSecond / (1024 * 1024);
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} MB/s`;
}
