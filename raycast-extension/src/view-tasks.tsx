import {
  List,
  Icon,
  Color,
  ActionPanel,
  Action,
  open,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { spawn, execSync } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { loadConfig, SCRIPTS, fullPath } from "./config";

type Task = {
  id: string;
  type: string;
  args: string;
  status: "running" | "done" | "failed" | string;
  progress: string;
  started: string;
  updated: string;
  log: string;
};

type Snapshot = {
  whisperPids: string[];
  downloaderPids: string[];
  tasks: Task[];
  archived: {
    account: string;
    kind: "灵感池" | "拆解池" | "抓账号";
    dir: string;
    count: number;
    latestFile: string;
    latestAt: number;
  }[];
  lastUpdated: number;
};

export default function Command() {
  const [snap, setSnap] = useState<Snapshot | null>(null);

  useEffect(() => {
    const tick = () => setSnap(collect());
    tick();
    const id = setInterval(tick, 3000);
    return () => clearInterval(id);
  }, []);

  if (!snap) {
    return <List isLoading navigationTitle="任务状态" />;
  }

  const hasActive = snap.whisperPids.length > 0 || snap.downloaderPids.length > 0;
  const runningTasks = snap.tasks.filter((t) => t.status === "running");
  const recentTasks = snap.tasks.filter((t) => t.status !== "running").slice(0, 10);

  return (
    <List
      navigationTitle={`任务状态 · ${new Date(snap.lastUpdated).toLocaleTimeString()}`}
    >
      <List.Section title={hasActive ? "🟢 正在运行" : "⚪ 无活跃任务"}>
        <List.Item
          icon={{
            source: Icon.ComputerChip,
            tintColor:
              snap.whisperPids.length > 0 ? Color.Green : Color.SecondaryText,
          }}
          title="Whisper 转录"
          accessories={[
            {
              text:
                snap.whisperPids.length > 0
                  ? `${snap.whisperPids.length} 个在跑`
                  : "空闲",
              icon:
                snap.whisperPids.length > 0 ? Icon.CircleProgress50 : undefined,
            },
          ]}
        />
        <List.Item
          icon={{
            source: Icon.Download,
            tintColor:
              snap.downloaderPids.length > 0 ? Color.Blue : Color.SecondaryText,
          }}
          title="下载 / 归档脚本"
          accessories={[
            {
              text:
                snap.downloaderPids.length > 0
                  ? `${snap.downloaderPids.length} 个在跑`
                  : "空闲",
            },
          ]}
        />
      </List.Section>

      {runningTasks.length > 0 && (
        <List.Section title={`🔄 跑中的任务 · ${runningTasks.length}`}>
          {runningTasks.map((t) => (
            <TaskItem key={t.id} task={t} />
          ))}
        </List.Section>
      )}

      {snap.archived.length > 0 && (
        <List.Section title="📝 归档产出（最近 24 小时）">
          {snap.archived.map((a) => (
            <List.Item
              key={`${a.kind}-${a.account}`}
              icon={
                a.kind === "灵感池"
                  ? Icon.LightBulb
                  : a.kind === "拆解池"
                    ? Icon.Dot
                    : Icon.Box
              }
              title={a.account || a.kind}
              subtitle={`${a.kind} · ${a.count} 个 md`}
              accessories={[{ text: a.latestFile }, { text: timeAgo(a.latestAt) }]}
              actions={
                <ActionPanel>
                  <Action
                    title="在 Finder 打开"
                    icon={Icon.Finder}
                    onAction={() => open(a.dir)}
                  />
                </ActionPanel>
              }
            />
          ))}
        </List.Section>
      )}

      {recentTasks.length > 0 && (
        <List.Section title={`📋 最近完成/失败 · ${recentTasks.length}`}>
          {recentTasks.map((t) => (
            <TaskItem key={t.id} task={t} />
          ))}
        </List.Section>
      )}

      {!hasActive && snap.tasks.length === 0 && snap.archived.length === 0 && (
        <List.EmptyView
          icon={Icon.CheckCircle}
          title="当前没有后台任务"
          description="通过「灵感提取 / 对标拆解 / 抓整个号」启动任务后会出现在这里"
        />
      )}
    </List>
  );
}

function TaskItem({ task }: { task: Task }) {
  const statusText =
    task.status === "running"
      ? "🟢 跑中"
      : task.status === "done"
        ? "✅ 完成"
        : task.status === "failed"
          ? "❌ 失败"
          : task.status;
  const statusIcon =
    task.status === "running"
      ? Icon.Clock
      : task.status === "done"
        ? Icon.CheckCircle
        : task.status === "failed"
          ? Icon.XMarkCircle
          : Icon.Circle;

  return (
    <List.Item
      icon={statusIcon}
      title={`${statusText}  ${task.type}`}
      subtitle={task.args.slice(0, 60)}
      accessories={[{ text: task.progress }, { text: task.started.slice(11, 19) }]}
      actions={
        <ActionPanel>
          <Action.CopyToClipboard title="复制任务 ID" content={task.id} />
          <Action.CopyToClipboard title="复制日志路径" content={task.log} />
          {fs.existsSync(task.log) && (
            <Action.ShowInFinder title="在 Finder 打开日志" path={task.log} />
          )}
          <ActionPanel.Section>
            <Action
              title="清理 24H 前完成任务"
              icon={Icon.Trash}
              onAction={async () => {
                await cleanTasks();
                await showToast({
                  style: Toast.Style.Success,
                  title: "已清理",
                });
              }}
            />
          </ActionPanel.Section>
        </ActionPanel>
      }
    />
  );
}

// ─── 采集 ────────────────────────────────────────────────────────
function collect(): Snapshot {
  const now = Date.now();
  const cfg = loadConfig();

  // 1. 进程快照
  const whisperPids: string[] = [];
  const downloaderPids: string[] = [];
  try {
    const ps = execSync("ps ax -o pid,args 2>/dev/null", {
      encoding: "utf-8",
    });
    for (const line of ps.split("\n")) {
      if (/mlx_whisper|python.*whisper/.test(line)) {
        const m = line.trim().match(/^(\d+)/);
        if (m) whisperPids.push(m[1]);
      } else if (
        /python.*(download_by_ids|archive_|list_videos)|yt-dlp/.test(line)
      ) {
        const m = line.trim().match(/^(\d+)/);
        if (m) downloaderPids.push(m[1]);
      }
    }
  } catch {
    // ignore
  }

  // 2. 从 tasks.log 读任务
  const tasks: Task[] = [];
  const tasksFile = path.join(os.homedir(), ".xugongzi-toolkit/tasks.log");
  if (fs.existsSync(tasksFile)) {
    const lines = fs.readFileSync(tasksFile, "utf-8").split("\n");
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        tasks.push(JSON.parse(line));
      } catch {
        // skip bad line
      }
    }
    tasks.reverse();
  }

  // 3. 归档产出：扫 inspiration_dir / review_dir / account_dir
  const archived: Snapshot["archived"] = [];
  const cutoff = now - 24 * 3600 * 1000;
  if (cfg) {
    const dirs: [Snapshot["archived"][number]["kind"], string][] = [
      ["灵感池", cfg.inspiration_dir],
      ["拆解池", cfg.review_dir],
      ["抓账号", cfg.account_dir],
    ];
    for (const [kind, rootDir] of dirs) {
      if (!rootDir || !fs.existsSync(rootDir)) continue;
      scanArchived(kind, rootDir, cutoff, archived);
    }
    archived.sort((a, b) => b.latestAt - a.latestAt);
  }

  return {
    whisperPids,
    downloaderPids,
    tasks: tasks.slice(0, 50),
    archived: archived.slice(0, 20),
    lastUpdated: now,
  };
}

function scanArchived(
  kind: Snapshot["archived"][number]["kind"],
  rootDir: string,
  cutoff: number,
  out: Snapshot["archived"],
) {
  // 灵感池 / 拆解池 / 抓账号 可能是「根目录下直接是 md」或「下一层是账号子目录」
  try {
    const items = fs.readdirSync(rootDir);
    // 先扫根下直接的 md
    const rootMds: { name: string; mt: number }[] = [];
    for (const item of items) {
      const full = path.join(rootDir, item);
      try {
        const st = fs.statSync(full);
        if (st.isFile() && item.endsWith(".md")) {
          rootMds.push({ name: item, mt: st.mtimeMs });
        } else if (st.isDirectory()) {
          // 账号子目录
          const mds: { name: string; mt: number }[] = [];
          for (const f of fs.readdirSync(full)) {
            if (!f.endsWith(".md")) continue;
            const mt = fs.statSync(path.join(full, f)).mtimeMs;
            mds.push({ name: f, mt });
          }
          if (mds.length === 0) continue;
          mds.sort((a, b) => b.mt - a.mt);
          if (mds[0].mt < cutoff) continue;
          out.push({
            account: item,
            kind,
            dir: full,
            count: mds.length,
            latestFile: mds[0].name,
            latestAt: mds[0].mt,
          });
        }
      } catch {
        // skip
      }
    }
    if (rootMds.length > 0) {
      rootMds.sort((a, b) => b.mt - a.mt);
      if (rootMds[0].mt >= cutoff) {
        out.push({
          account: "",
          kind,
          dir: rootDir,
          count: rootMds.length,
          latestFile: rootMds[0].name,
          latestAt: rootMds[0].mt,
        });
      }
    }
  } catch {
    // skip
  }
}

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return "刚才";
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  return `${Math.floor(h / 24)} 天前`;
}

function cleanTasks(): Promise<void> {
  return new Promise((resolve) => {
    const child = spawn("bash", [SCRIPTS.TASK_LOG, "clean"], {
      env: { ...process.env, PATH: fullPath() },
    });
    child.on("close", () => resolve());
  });
}
