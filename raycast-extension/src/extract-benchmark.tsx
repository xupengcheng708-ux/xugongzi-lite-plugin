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

    try {
      // 按账号名建子目录：review_dir/{账号}/
      const accountDir = path.join(
        cfg.review_dir,
        sanitizeAccountName(values.account.trim()),
      );
      fs.mkdirSync(accountDir, { recursive: true });

      const taskId = await createTask("对标拆解-抽文案", url!);
      const args: string[] = [taskId, url!, `--target-dir=${accountDir}`];
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
        message: `${values.account} · 任务 ${taskId}`,
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
          <Action.SubmitForm title="开始拆解" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="对标账号的视频 → 深度拆解池。文案抽取在 Raycast 完成，钩子/结构/金句分析去 Claude Code 说「对标拆解 <md>」" />
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

function launchBackground(script: string, args: string[]): void {
  const child = spawn("bash", [script, ...args], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PATH: fullPath() },
  });
  child.unref();
}
