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
  accountScript,
  SCRIPTS,
  fullPath,
  extractUrl,
} from "./config";

type FormValues = {
  url: string;
  limit: string;
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
      setUrlError("没识别出主页链接");
      return;
    }
    setUrlError(undefined);

    const n = parseInt(values.limit, 10);
    const limit = isNaN(n) || n <= 0 ? 10 : n;

    setLoading(true);

    try {
      const taskId = await createTask("抓整个号", `${url} · 最新${limit}条`);
      // 用一段 bash 串行：list → 取前 N 条 id → download
      launchScrapePipeline({
        accountScriptPath: accountScript(cfg.mode),
        homepage: url,
        limit,
        taskId,
        accountDir: cfg.account_dir,
      });

      await showToast({
        style: Toast.Style.Success,
        title: "✅ 已启动",
        message: `任务 ${taskId} · 策略「最新 ${limit} 条」`,
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
          <Action.SubmitForm title="开始抓取" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="粘贴抖音主页链接 → 按「最新 N 条」策略批量下载转录。要交互选片？去 Claude Code 说「抓整个号 <URL>」" />
      <Form.TextField
        id="url"
        title="主页链接"
        placeholder="https://v.douyin.com/... 或 https://www.douyin.com/user/..."
        error={urlError}
        onChange={() => urlError && setUrlError(undefined)}
      />
      <Form.TextField
        id="limit"
        title="最新几条"
        placeholder="默认 10"
        info="建议 5-20 条，超过 50 会触发抖音风控"
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

function launchScrapePipeline(opts: {
  accountScriptPath: string;
  homepage: string;
  limit: number;
  taskId: string;
  accountDir: string;
}): void {
  const { accountScriptPath, homepage, limit, taskId, accountDir } = opts;
  const bashSnippet = `
    set -e
    LIST_JSON=/tmp/xgz_list_$$.json
    bash '${accountScriptPath}' list '${homepage}' "$LIST_JSON" 2>/dev/null
    IDS=$(python3 -c "import json; d=json.load(open('$LIST_JSON')); arr=(d.get('videos') or d.get('entries') or [])[:${limit}]; ids=[v.get('aweme_id') or v.get('id') for v in arr]; print(','.join([i for i in ids if i]))" 2>/dev/null)
    if [ -n "$IDS" ]; then
      bash '${accountScriptPath}' download "$LIST_JSON" '${taskId}' '${accountDir}' --ids "$IDS" --audio-only
    else
      bash '${SCRIPTS.TASK_LOG}' update '${taskId}' failed -
    fi
    rm -f "$LIST_JSON"
  `;

  const child = spawn("bash", ["-c", bashSnippet], {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PATH: fullPath() },
  });
  child.unref();
}
