import {
  List,
  ActionPanel,
  Action,
  Icon,
  showToast,
  Toast,
} from "@raycast/api";
import { useEffect, useState } from "react";
import { spawn } from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { SCRIPTS, fullPath } from "./config";

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

export default function Command() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const tasksFile = path.join(os.homedir(), ".xugongzi-toolkit/tasks.log");
      if (!fs.existsSync(tasksFile)) {
        setTasks([]);
        return;
      }
      const lines = fs
        .readFileSync(tasksFile, "utf-8")
        .split("\n")
        .filter((l) => l.trim());
      const parsed: Task[] = [];
      for (const line of lines) {
        try {
          parsed.push(JSON.parse(line));
        } catch {
          // 跳过坏行
        }
      }
      // 最新的在上
      parsed.reverse();
      setTasks(parsed.slice(0, 50));
    } catch (err) {
      await showToast({
        style: Toast.Style.Failure,
        title: "读取任务失败",
        message: err instanceof Error ? err.message : String(err),
      });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  function statusIcon(status: string): Icon {
    switch (status) {
      case "running":
        return Icon.Clock;
      case "done":
        return Icon.CheckCircle;
      case "failed":
        return Icon.XMarkCircle;
      default:
        return Icon.Circle;
    }
  }

  function statusText(status: string): string {
    switch (status) {
      case "running":
        return "🟢 跑中";
      case "done":
        return "✅ 完成";
      case "failed":
        return "❌ 失败";
      default:
        return status;
    }
  }

  async function cleanOld() {
    await new Promise<void>((resolve) => {
      const child = spawn("bash", [SCRIPTS.TASK_LOG, "clean"], {
        env: { ...process.env, PATH: fullPath() },
      });
      child.on("close", () => resolve());
    });
    await refresh();
    await showToast({
      style: Toast.Style.Success,
      title: "已清理 24h 前的完成任务",
    });
  }

  return (
    <List
      isLoading={loading}
      navigationTitle={`后台任务 · 共 ${tasks.length} 条`}
    >
      {tasks.length === 0 ? (
        <List.EmptyView
          icon={Icon.Hourglass}
          title="当前没有任务"
          description="通过「灵感提取 / 对标拆解 / 抓整个号」启动任务后会出现在这里"
        />
      ) : (
        tasks.map((t) => (
          <List.Item
            key={t.id}
            icon={statusIcon(t.status)}
            title={`${statusText(t.status)}  ${t.type}`}
            subtitle={t.args.slice(0, 60)}
            accessories={[
              { text: t.progress },
              { text: t.started.slice(11, 19) },
            ]}
            actions={
              <ActionPanel>
                <Action
                  title="刷新"
                  icon={Icon.RotateClockwise}
                  onAction={refresh}
                />
                <Action.CopyToClipboard title="复制任务 ID" content={t.id} />
                <Action.CopyToClipboard title="复制日志路径" content={t.log} />
                {t.status === "failed" && (
                  <Action.ShowInFinder
                    title="在 Finder 打开日志"
                    path={t.log}
                  />
                )}
                <ActionPanel.Section>
                  <Action
                    title="清理 24H 前的完成任务"
                    icon={Icon.Trash}
                    onAction={cleanOld}
                  />
                </ActionPanel.Section>
              </ActionPanel>
            }
          />
        ))
      )}
    </List>
  );
}
