import {
  Form,
  ActionPanel,
  Action,
  showToast,
  Toast,
  popToRoot,
  Clipboard,
} from "@raycast/api";
import { useState } from "react";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import {
  loadConfig,
  inspirationScript,
  SCRIPTS,
  fullPath,
  extractUrl,
} from "./config";

type FormValues = {
  url: string;
  account: string;
  language: string;
  note: string;
  keepMedia: boolean;
};

export default function Command() {
  const [loading, setLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | undefined>();
  const [accountError, setAccountError] = useState<string | undefined>();

  async function handleSubmit(values: FormValues) {
    const cfg = loadConfig();
    if (!cfg) {
      await showToast({
        style: Toast.Style.Failure,
        title: "工具包没装",
        message: "先按许公子的安装指令装工具包",
      });
      return;
    }

    let hasError = false;
    const url = extractUrl(values.url);
    if (!url) {
      setUrlError("没识别出视频链接");
      hasError = true;
    }
    if (!values.account.trim()) {
      setAccountError("请输入对标账号名");
      hasError = true;
    }
    if (hasError) return;

    setUrlError(undefined);
    setAccountError(undefined);
    setLoading(true);

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "建立任务...",
    });

    try {
      // 按账号名建子目录
      const accountName = values.account.trim();
      const safeAccount = sanitizeAccountName(accountName);
      const accountDir = path.join(cfg.review_dir, safeAccount);
      fs.mkdirSync(accountDir, { recursive: true });

      const taskId = await createTask("对标拆解-抽文案", url!);

      let whisperStartAt: number | null = null;
      const timerId = setInterval(() => {
        if (whisperStartAt) {
          const elapsed = Math.floor((Date.now() - whisperStartAt) / 1000);
          const m = Math.floor(elapsed / 60);
          const s = elapsed % 60;
          toast.message = `已耗时 ${m}:${String(s).padStart(2, "0")}`;
        }
      }, 1000);

      const args: string[] = [taskId, url!, `--target-dir=${accountDir}`];
      if (values.language) args.push(`--language=${values.language}`);
      if (values.note && values.note.trim())
        args.push(`--note=${values.note.trim()}`);
      if (values.keepMedia) args.push("--keep-media");

      const { stdout } = await runScript(
        inspirationScript(cfg.mode),
        args,
        (line) => {
          toast.title = line;
          if (/Whisper|whisper|语音识别|转写/i.test(line)) {
            whisperStartAt = Date.now();
          }
        },
      );
      clearInterval(timerId);

      const parsed = parseOutput(stdout);
      const outFile = parsed.OUT_FILE;
      const title = parsed.TITLE || "未命名";
      const method = parsed.METHOD || "whisper";

      if (!outFile || !fs.existsSync(outFile)) {
        throw new Error("脚本声称成功但产出的 md 找不到");
      }

      toast.style = Toast.Style.Success;
      toast.title = "✅ 已入库拆解池";
      toast.message = `${accountName} / ${title} (${method})`;

      // 主 action: 复制「对标拆解」指令到剪贴板（Claude Code 里粘就触发 skill）
      toast.primaryAction = {
        title: "复制「对标拆解」指令到剪贴板",
        onAction: async () => {
          await Clipboard.copy(`对标拆解 ${outFile}`);
          await showToast({
            style: Toast.Style.Success,
            title: "已复制",
            message: "去 Claude Code 对话框粘贴即可触发分析",
          });
        },
      };
      // 副 action: 在 Finder 打开
      toast.secondaryAction = {
        title: "在 Finder 打开",
        onAction: () => {
          spawn("open", ["-R", outFile], { detached: true, stdio: "ignore" }).unref();
        },
      };

      notifyDone("🎯 对标拆解完成", `${accountName} · ${path.basename(outFile)}`);

      setTimeout(() => popToRoot(), 600);
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "失败";
      toast.message = err instanceof Error ? err.message : String(err);
      notifyDone("❌ 对标拆解失败", toast.message || "未知错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="开始拆解" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="对标账号的视频 → 深度拆解池。文案抽取在 Raycast 完成，钩子/结构/金句分析去 Claude Code 粘「对标拆解 <md>」" />
      <Form.TextField
        id="url"
        title="视频链接"
        placeholder="https://v.douyin.com/..."
        error={urlError}
        onChange={() => urlError && setUrlError(undefined)}
      />
      <Form.TextField
        id="account"
        title="对标账号"
        placeholder="例：清华白也"
        info="会建立 拆解池/{这个名字}/ 目录存放此账号的所有拆解"
        error={accountError}
        onChange={() => accountError && setAccountError(undefined)}
      />
      <Form.Dropdown id="language" title="转录语言" defaultValue="zh">
        <Form.Dropdown.Item value="zh" title="中文" />
        <Form.Dropdown.Item value="en" title="英文" />
        <Form.Dropdown.Item value="auto" title="自动检测" />
      </Form.Dropdown>
      <Form.TextArea
        id="note"
        title="备注（可选）"
        placeholder="为什么拆这条？学什么点？"
      />
      <Form.Separator />
      <Form.Checkbox
        id="keepMedia"
        label="保留视频文件到本地"
        defaultValue={false}
        info="默认关：转录完自动删视频，只留文案"
      />
    </Form>
  );
}

// ─── 工具函数 ────────────────────────────────────────────────────

function sanitizeAccountName(s: string): string {
  return s.replace(/[/\\:*?"<>|\n\r#^[\]]/g, "_").trim();
}

function createTask(type: string, args: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [SCRIPTS.TASK_LOG, "create", type, args], {
      env: { ...process.env, PATH: fullPath() },
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve(out.trim());
      else reject(new Error(`task_log.sh 退出码 ${code}`));
    });
  });
}

function runScript(
  cmd: string,
  args: string[],
  onProgress?: (line: string) => void,
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn("bash", [cmd, ...args], {
      env: { ...process.env, PATH: fullPath() },
    });
    let stdout = "";
    let stderr = "";
    let stderrBuf = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => {
      const chunk = d.toString();
      stderr += chunk;
      stderrBuf += chunk;
      let idx;
      while ((idx = stderrBuf.indexOf("\n")) !== -1) {
        const line = stderrBuf.slice(0, idx).trim();
        stderrBuf = stderrBuf.slice(idx + 1);
        if (onProgress && line.startsWith("INFO:")) {
          onProgress(line.replace(/^INFO:\s*/, ""));
        }
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `脚本退出码 ${code}`));
    });
  });
}

function parseOutput(stdout: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const line of stdout.split("\n")) {
    const m = line.match(/^([A-Z_]+):(.+)$/);
    if (m) result[m[1]] = m[2].trim();
  }
  return result;
}

function notifyDone(title: string, msg: string): void {
  const safeTitle = title.replace(/"/g, "'");
  const safeMsg = msg.replace(/"/g, "'");
  try {
    spawn(
      "osascript",
      ["-e", `display notification "${safeMsg}" with title "${safeTitle}"`],
      { detached: true, stdio: "ignore" },
    ).unref();
  } catch {
    // ignore
  }
}
