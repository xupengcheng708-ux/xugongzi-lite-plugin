import {
  Form,
  ActionPanel,
  Action,
  showToast,
  Toast,
  popToRoot,
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
  language: string;
  note: string;
  keepMedia: boolean;
};

export default function Command() {
  const [loading, setLoading] = useState(false);
  const [urlError, setUrlError] = useState<string | undefined>();

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

    const url = extractUrl(values.url);
    if (!url) {
      setUrlError("没识别出视频链接");
      return;
    }
    setUrlError(undefined);
    setLoading(true);

    const toast = await showToast({
      style: Toast.Style.Animated,
      title: "建立任务...",
    });

    try {
      const taskId = await createTask("灵感提取", url);

      // Whisper 阶段计时
      let whisperStartAt: number | null = null;
      const timerId = setInterval(() => {
        if (whisperStartAt) {
          const elapsed = Math.floor((Date.now() - whisperStartAt) / 1000);
          const m = Math.floor(elapsed / 60);
          const s = elapsed % 60;
          toast.message = `已耗时 ${m}:${String(s).padStart(2, "0")}`;
        }
      }, 1000);

      // 组装参数
      const args: string[] = [taskId, url];
      if (values.language) args.push(`--language=${values.language}`);
      if (values.note && values.note.trim())
        args.push(`--note=${values.note.trim()}`);
      if (values.keepMedia) args.push("--keep-media");

      // 阻塞执行脚本，实时读 stderr 更新 toast
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

      // 解析产出
      const parsed = parseOutput(stdout);
      const outFile = parsed.OUT_FILE;
      const title = parsed.TITLE || "未命名";
      const method = parsed.METHOD || "whisper";

      if (!outFile || !fs.existsSync(outFile)) {
        throw new Error("脚本声称成功但产出的 md 找不到");
      }

      toast.style = Toast.Style.Success;
      toast.title = "✅ 已入库灵感池";
      toast.message = `${title} (${method})`;
      toast.primaryAction = {
        title: "在 Finder 打开",
        onAction: () => {
          spawn("open", ["-R", outFile], { detached: true, stdio: "ignore" }).unref();
        },
      };
      toast.secondaryAction = {
        title: "复制 md 路径",
        onAction: () => {
          spawn("pbcopy", [], { stdio: ["pipe", "ignore", "ignore"] }).stdin.end(outFile);
        },
      };

      // macOS 系统通知（除了 toast，学员离开 Raycast 也能看到）
      notifyDone("💡 灵感提取完成", `${title} · ${path.basename(outFile)}`);

      setTimeout(() => popToRoot(), 600);
    } catch (err) {
      toast.style = Toast.Style.Failure;
      toast.title = "失败";
      toast.message = err instanceof Error ? err.message : String(err);
      notifyDone("❌ 灵感提取失败", toast.message || "未知错误");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action.SubmitForm title="开始提取" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="粘贴单条视频链接（抖音 / 小红书 / B 站 / YouTube / 视频号 / 新片场）" />
      <Form.TextField
        id="url"
        title="视频链接"
        placeholder="https://v.douyin.com/..."
        error={urlError}
        onChange={() => urlError && setUrlError(undefined)}
      />
      <Form.Dropdown id="language" title="转录语言" defaultValue="zh">
        <Form.Dropdown.Item value="zh" title="中文" />
        <Form.Dropdown.Item value="en" title="英文" />
        <Form.Dropdown.Item value="auto" title="自动检测" />
      </Form.Dropdown>
      <Form.TextArea
        id="note"
        title="备注（可选）"
        placeholder="为什么收藏这条？关注什么点？"
      />
      <Form.Separator />
      <Form.Checkbox
        id="keepMedia"
        label="保留视频文件到本地"
        defaultValue={false}
        info="默认关：转录完自动删除下载的视频，只留文案。勾上：视频保留在 /tmp/xgz_insp_*/"
      />
    </Form>
  );
}

// ─── 工具函数 ────────────────────────────────────────────────────

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
  // 用 osascript 发 macOS 系统通知（Raycast 关闭后也能看到）
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
