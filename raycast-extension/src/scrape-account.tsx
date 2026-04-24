import {
  Form,
  ActionPanel,
  Action,
  List,
  Icon,
  Detail,
  showToast,
  Toast,
  useNavigation,
  popToRoot,
  Clipboard,
} from "@raycast/api";
import { useEffect, useMemo, useState } from "react";
import { spawn } from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  loadConfig,
  accountScript,
  SCRIPTS,
  fullPath,
  extractUrl,
  UserConfig,
} from "./config";

// 统一的 Video 类型（mode_a 和 mode_b 字段差异在这里抹平）
type Video = {
  id: string;
  title: string;
  date: string;
  digg: number; // mode_b 没有时填 0
  duration: number; // 秒，mode_b 没有时填 0
};

type ListData = {
  nickname: string;
  count: number;
  videos: Video[];
};

export default function Command() {
  const cfg = loadConfig();
  if (!cfg) {
    return (
      <Detail
        markdown="# ❌ 工具包没装\n\n先按许公子的安装指令装工具包（粘给 Claude Code 的那段话），再用这个命令。"
      />
    );
  }
  return <UrlInputView cfg={cfg} />;
}

// ─── 第 1 页：输入主页 URL ─────────────────────────────────────────
function UrlInputView({ cfg }: { cfg: UserConfig }) {
  const { push } = useNavigation();

  function handleSubmit(values: { url: string; limit: string }) {
    const cleaned = extractUrl(values.url);
    if (!cleaned) {
      showToast({
        style: Toast.Style.Failure,
        title: "没识别出抖音主页链接",
        message: "支持纯 URL、带文案的分享串、裸链",
      });
      return;
    }
    const limit = parseInt(values.limit, 10);
    push(
      <LoadingListView
        cfg={cfg}
        url={cleaned}
        limit={isNaN(limit) || limit <= 0 ? undefined : limit}
      />,
    );
  }

  return (
    <Form
      actions={
        <ActionPanel>
          <Action.SubmitForm title="拉作品列表" onSubmit={handleSubmit} />
        </ActionPanel>
      }
    >
      <Form.Description text="粘贴抖音主页链接 → 列全部作品 → 勾选要抓的 → 批量下载转录" />
      <Form.TextField
        id="url"
        title="主页链接"
        placeholder="https://v.douyin.com/... 或 https://www.douyin.com/user/..."
      />
      <Form.TextField
        id="limit"
        title="最多拉多少条"
        placeholder="留空=全量；爆款账号建议填 50 或 100"
        info="拉太多会慢（约 1 分钟 / 50 条）"
      />
    </Form>
  );
}

// ─── 第 2 页：加载列表 ─────────────────────────────────────────────
function LoadingListView({
  cfg,
  url,
  limit,
}: {
  cfg: UserConfig;
  url: string;
  limit?: number;
}) {
  const [state, setState] = useState<
    | { kind: "loading" }
    | { kind: "ok"; data: ListData; listJsonPath: string }
    | { kind: "error"; message: string }
  >({ kind: "loading" });

  useEffect(() => {
    (async () => {
      const ts = Date.now();
      const listJsonPath = path.join(os.tmpdir(), `xgz_list_${ts}.json`);

      try {
        await runScriptSync(
          "bash",
          [accountScript(cfg.mode), "list", url, listJsonPath],
        );
        if (!fs.existsSync(listJsonPath)) {
          throw new Error("list 脚本没产出 JSON");
        }
        const raw = JSON.parse(fs.readFileSync(listJsonPath, "utf-8"));
        const data = normalizeListJson(raw, cfg.mode, limit);
        if (data.videos.length === 0) {
          throw new Error(
            `账号 @${data.nickname || "?"} 没有作品（可能被隐藏或主页链接不对）`,
          );
        }
        setState({ kind: "ok", data, listJsonPath });
      } catch (err) {
        setState({
          kind: "error",
          message: err instanceof Error ? err.message : String(err),
        });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state.kind === "loading") {
    return (
      <List isLoading navigationTitle="拉取作品中...">
        <List.EmptyView
          icon={Icon.Clock}
          title="抓取作品列表中，约 30 秒-1 分钟"
          description="抖音 API 限速中"
        />
      </List>
    );
  }
  if (state.kind === "error") {
    return (
      <Detail
        navigationTitle="拉取失败"
        markdown={`# ❌ 拉取失败\n\n\`\`\`\n${state.message}\n\`\`\``}
        actions={
          <ActionPanel>
            <Action
              title="复制错误"
              icon={Icon.Clipboard}
              onAction={() => Clipboard.copy(state.message)}
            />
            <Action title="返回" icon={Icon.ArrowLeft} onAction={() => popToRoot()} />
          </ActionPanel>
        }
      />
    );
  }
  return (
    <VideoListView
      cfg={cfg}
      listData={state.data}
      listJsonPath={state.listJsonPath}
    />
  );
}

// ─── 第 3 页：作品列表选择 ─────────────────────────────────────────
function VideoListView({
  cfg,
  listData,
  listJsonPath,
}: {
  cfg: UserConfig;
  listData: ListData;
  listJsonPath: string;
}) {
  const { push } = useNavigation();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<"digg" | "time">("digg");
  const [minDigg, setMinDigg] = useState(0);

  const hasDigg = cfg.mode === "a"; // 只有路线 A 有点赞数

  const sortedFiltered = useMemo(() => {
    let arr = listData.videos;
    if (hasDigg && minDigg > 0) arr = arr.filter((v) => v.digg >= minDigg);
    if (searchText.trim()) {
      const q = searchText.trim().toLowerCase();
      arr = arr.filter((v) => v.title.toLowerCase().includes(q));
    }
    const sorted = [...arr];
    if (hasDigg && sortBy === "digg")
      sorted.sort((a, b) => b.digg - a.digg);
    else sorted.sort((a, b) => b.date.localeCompare(a.date));
    return sorted;
  }, [listData.videos, sortBy, minDigg, searchText, hasDigg]);

  function toggle(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function selectAllVisible() {
    setSelected((prev) => {
      const n = new Set(prev);
      sortedFiltered.forEach((v) => n.add(v.id));
      return n;
    });
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function goNext() {
    if (selected.size === 0) {
      showToast({ style: Toast.Style.Failure, title: "还没勾选任何作品" });
      return;
    }
    const picked = listData.videos.filter((v) => selected.has(v.id));
    push(
      <ConfirmView
        cfg={cfg}
        selected={picked}
        listJsonPath={listJsonPath}
        nickname={listData.nickname}
      />,
    );
  }

  return (
    <List
      navigationTitle={`@${listData.nickname} · 共 ${listData.count} 条 · 已选 ${selected.size}`}
      searchBarPlaceholder="搜索标题..."
      onSearchTextChange={setSearchText}
      throttle
    >
      {sortedFiltered.length === 0 ? (
        <List.EmptyView
          title="没有匹配的作品"
          description="试试换个搜索词或降低门槛"
        />
      ) : (
        sortedFiltered.map((v) => {
          const isSelected = selected.has(v.id);
          const accessories = hasDigg
            ? [
                { text: `${fmtCount(v.digg)}赞` },
                { text: `${v.duration}s` },
              ]
            : [{ text: v.date }];
          return (
            <List.Item
              key={v.id}
              icon={isSelected ? Icon.CheckCircle : Icon.Circle}
              title={v.title.slice(0, 60) || v.id}
              subtitle={v.date}
              accessories={accessories}
              actions={
                <ActionPanel>
                  <Action
                    title={isSelected ? "取消选中" : "选中"}
                    icon={isSelected ? Icon.Circle : Icon.CheckCircle}
                    onAction={() => toggle(v.id)}
                  />
                  <Action
                    title={`下一步（已选 ${selected.size}）`}
                    icon={Icon.ArrowRight}
                    shortcut={{ modifiers: ["cmd"], key: "return" }}
                    onAction={goNext}
                  />
                  <ActionPanel.Section title="批量">
                    <Action
                      title="全选当前显示"
                      icon={Icon.CheckCircle}
                      shortcut={{ modifiers: ["cmd"], key: "a" }}
                      onAction={selectAllVisible}
                    />
                    <Action
                      title="清空选择"
                      icon={Icon.XMarkCircle}
                      shortcut={{ modifiers: ["cmd"], key: "d" }}
                      onAction={clearSelection}
                    />
                  </ActionPanel.Section>
                  {hasDigg && (
                    <ActionPanel.Section title="排序 / 筛选">
                      <Action
                        title={sortBy === "digg" ? "切换：按时间" : "切换：按赞数"}
                        icon={Icon.ArrowUp}
                        shortcut={{ modifiers: ["cmd"], key: "s" }}
                        onAction={() =>
                          setSortBy(sortBy === "digg" ? "time" : "digg")
                        }
                      />
                      <Action
                        title="只看 >1000 赞"
                        icon={Icon.Star}
                        shortcut={{ modifiers: ["cmd"], key: "1" }}
                        onAction={() => setMinDigg(1000)}
                      />
                      <Action
                        title="只看 >5000 赞"
                        icon={Icon.Star}
                        shortcut={{ modifiers: ["cmd"], key: "5" }}
                        onAction={() => setMinDigg(5000)}
                      />
                      <Action
                        title="只看 >1 万赞"
                        icon={Icon.Star}
                        shortcut={{ modifiers: ["cmd"], key: "2" }}
                        onAction={() => setMinDigg(10000)}
                      />
                      <Action
                        title="清除赞数筛选"
                        icon={Icon.XMarkCircle}
                        onAction={() => setMinDigg(0)}
                      />
                    </ActionPanel.Section>
                  )}
                </ActionPanel>
              }
            />
          );
        })
      )}
    </List>
  );
}

// ─── 第 4 页：确认 + 启动 ─────────────────────────────────────────
function ConfirmView({
  cfg,
  selected,
  listJsonPath,
  nickname,
}: {
  cfg: UserConfig;
  selected: Video[];
  listJsonPath: string;
  nickname: string;
}) {
  const [loading, setLoading] = useState(false);
  const [accountName, setAccountName] = useState<string>(nickname);

  async function handleSubmit(values: { accountName: string; keepVideo: boolean }) {
    if (!values.accountName.trim()) {
      showToast({ style: Toast.Style.Failure, title: "请填账号名" });
      return;
    }
    setLoading(true);

    try {
      const safeAccount = values.accountName.trim().replace(/[/\\:*?"<>|\n\r#^[\]]/g, "_");
      const ids = selected.map((v) => v.id).join(",");
      const targetDir = path.join(cfg.account_dir, safeAccount);

      const taskId = await createTask(
        "抓整个号",
        `${nickname} · ${selected.length} 条`,
      );

      const extraArgs: string[] = ["--ids", ids];
      if (values.keepVideo) {
        extraArgs.push("--keep-video");
      } else {
        extraArgs.push("--audio-only");
      }

      launchBackground("bash", [
        accountScript(cfg.mode),
        "download",
        listJsonPath,
        taskId,
        cfg.account_dir,
        ...extraArgs,
      ]);

      await showToast({
        style: Toast.Style.Success,
        title: "✅ 已交给后台处理",
        message: `${selected.length} 条 · 归档到 ${path.basename(targetDir)}/ · 用「任务状态」看进度`,
      });

      setTimeout(() => popToRoot(), 400);
    } catch (err) {
      showToast({
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
            title="开始下载 + 转录 + 归档"
            onSubmit={handleSubmit}
          />
        </ActionPanel>
      }
    >
      <Form.Description
        text={`@${nickname} · 已勾 ${selected.length} 条\n预计 ${Math.round(
          selected.length * 1.5,
        )}-${selected.length * 3} 分钟（Whisper 转录占大头）`}
      />
      <Form.TextField
        id="accountName"
        title="账号名"
        value={accountName}
        onChange={setAccountName}
        placeholder={nickname}
        info={`归档目录：${cfg.account_dir}/{这个名字}/`}
      />
      <Form.Separator />
      <Form.Checkbox
        id="keepVideo"
        label="保留视频到本地（默认只存音频转录，节省磁盘）"
        defaultValue={false}
      />
    </Form>
  );
}

// ─── 工具函数 ──────────────────────────────────────────────────────

function fmtCount(n: number): string {
  if (n >= 10000) return `${(n / 10000).toFixed(1)}万`;
  return String(n);
}

type RawListJson = {
  nickname?: string;
  uploader?: string;
  channel?: string;
  count?: number;
  videos?: Array<{
    aweme_id?: string;
    desc?: string;
    create_time?: string;
    digg_count?: number;
    duration_ms?: number;
  }>;
  entries?: Array<{
    id?: string;
    title?: string;
    upload_date?: string;
    duration?: number;
  }>;
};

function normalizeListJson(
  raw: RawListJson,
  mode: "a" | "b",
  limit?: number,
): ListData {
  let videos: Video[] = [];
  let nickname = "";

  if (mode === "a") {
    // mode_a: list_videos.py 的 JSON
    nickname = raw.nickname || "未知账号";
    videos = (raw.videos || []).map((v) => ({
      id: String(v.aweme_id || ""),
      title: v.desc || "",
      date: v.create_time || "",
      digg: v.digg_count || 0,
      duration: Math.round((v.duration_ms || 0) / 1000),
    }));
  } else {
    // mode_b: yt-dlp --flat-playlist --dump-single-json 的输出
    nickname = raw.uploader || raw.channel || "未知账号";
    videos = (raw.entries || []).map((e) => ({
      id: String(e.id || ""),
      title: e.title || "",
      date: e.upload_date || "",
      digg: 0,
      duration: e.duration || 0,
    }));
  }

  if (limit && videos.length > limit) {
    videos = videos.slice(0, limit);
  }

  return {
    nickname,
    count: raw.count || videos.length,
    videos,
  };
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

function launchBackground(cmd: string, args: string[]): void {
  const child = spawn(cmd, args, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, PATH: fullPath() },
  });
  child.unref();
}

function runScriptSync(cmd: string, args: string[]): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      env: { ...process.env, PATH: fullPath() },
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `退出码 ${code}`));
    });
  });
}
