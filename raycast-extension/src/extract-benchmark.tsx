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
import {
  loadConfig,
  inspirationScript,
  SCRIPTS,
  fullPath,
  extractUrl,
} from "./config";

type FormValues = {
  url: string;
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

    try {
      const taskId = await createTask("对标拆解-抽文案", url);
      // 对标拆解：--target-dir 指向 review_dir
      launchBackground(inspirationScript(cfg.mode), [
        taskId,
        url,
        `--target-dir=${cfg.review_dir}`,
      ]);

      await showToast({
        style: Toast.Style.Success,
        title: "✅ 已启动",
        message: `任务 ${taskId} · 文案完后去 Claude Code 说「对标拆解 <md路径>」跑分析`,
      });
      setTimeout(() => popToRoot(), 400);
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "启动失败",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }

  return (
    <Form
      isLoading={loading}
      actions={
        <ActionPanel>
          <Action.SubmitForm
            title="开始拆解（抽文案）"
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Description text="对标视频 → 下载转录 → 存拆解池。要跑钩子/结构/金句分析：去 Claude Code 说「对标拆解 <生成的 md 路径>」" />
      <Form.TextField
        id="url"
        title="视频链接"
        placeholder="https://v.douyin.com/..."
        error={urlError}
        onChange={() => urlError && setUrlError(undefined)}
      />
    </Form>
  );
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

function launchBackground(script: string, args: string[]): void {
  const child = spawn("bash", [script, ...args], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PATH: fullPath() },
  });
  child.unref();
}
