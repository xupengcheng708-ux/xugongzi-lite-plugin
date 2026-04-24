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

    try {
      const taskId = await createTask("灵感提取", url);
      const args: string[] = [taskId, url];
      if (values.language) {
        args.push(`--language=${values.language}`);
      }
      if (values.note && values.note.trim()) {
        args.push(`--note=${values.note.trim()}`);
      }
      if (values.keepMedia) {
        args.push("--keep-media");
      }
      launchBackground(inspirationScript(cfg.mode), args);

      await showToast({
        style: Toast.Style.Success,
        title: "✅ 已启动",
        message: `任务 ${taskId} · 完成后在灵感池 md 查看`,
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
