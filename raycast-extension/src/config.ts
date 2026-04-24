/**
 * 许公子工具包 Extension 配置（通用版）
 * 不含任何用户个人路径，所有路径从 ~/.xugongzi-toolkit/config.json 读取。
 */
import * as os from "os";
import * as path from "path";
import * as fs from "fs";

const HOME = os.homedir();

// plugin 安装位置（约定）
export const PLUGIN_ROOT = path.join(HOME, ".claude/plugins/xugongzi-lite");

// plugin 脚本路径
export const SCRIPTS = {
  CONFIG_LIB: path.join(PLUGIN_ROOT, "scripts/lib/config.sh"),
  TASK_LOG: path.join(PLUGIN_ROOT, "scripts/lib/task_log.sh"),
  INSPIRATION_A: path.join(PLUGIN_ROOT, "scripts/mode_a/inspiration.sh"),
  INSPIRATION_B: path.join(PLUGIN_ROOT, "scripts/mode_b/inspiration.sh"),
  ACCOUNT_A: path.join(PLUGIN_ROOT, "scripts/mode_a/account.sh"),
  ACCOUNT_B: path.join(PLUGIN_ROOT, "scripts/mode_b/account.sh"),
};

// 用户配置位置
export const CONFIG_FILE = path.join(HOME, ".xugongzi-toolkit/config.json");

export type UserConfig = {
  mode: "a" | "b";
  inspiration_dir: string;
  review_dir: string;
  account_dir: string;
};

/** 读用户配置。未装工具包或 plugin 目录缺失时返回 null。 */
export function loadConfig(): UserConfig | null {
  try {
    if (!fs.existsSync(CONFIG_FILE)) return null;
    if (!fs.existsSync(PLUGIN_ROOT)) return null;
    return JSON.parse(fs.readFileSync(CONFIG_FILE, "utf-8"));
  } catch {
    return null;
  }
}

export function inspirationScript(mode: "a" | "b"): string {
  return mode === "a" ? SCRIPTS.INSPIRATION_A : SCRIPTS.INSPIRATION_B;
}

export function accountScript(mode: "a" | "b"): string {
  return mode === "a" ? SCRIPTS.ACCOUNT_A : SCRIPTS.ACCOUNT_B;
}

/** shell PATH —— 确保 git/brew/python3/ffmpeg 等都能找到 */
export function fullPath(): string {
  return [
    `${HOME}/bin`,
    `${HOME}/.local/bin`,
    "/opt/homebrew/bin",
    "/opt/homebrew/sbin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
  ].join(":");
}

/** 从用户输入抽取真实 URL（抖音分享文案中含文字 + 短链） */
export function extractUrl(input: string): string | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  const match = raw.match(/https?:\/\/[A-Za-z0-9._/?=&%#+*~@!-]+/i);
  if (match) return match[0];
  const bare = raw.match(
    /((?:v\.|www\.)?douyin\.com|iesdouyin\.com)\/[A-Za-z0-9._/?=&%#+*~@!-]+/i,
  );
  if (bare) return `https://${bare[0]}`;
  if (/^MS4wLj[A-Za-z0-9_-]+$/.test(raw)) return raw;
  return null;
}
