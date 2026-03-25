import { randomUUID } from "crypto";
import path from "path";
import os from "os";
import { ScheduledTask, TaskRun } from "./types.js";
import * as scheduleStore from "./schedule-store.js";
import * as store from "./conversation-store.js";
import * as sessionManager from "./session-manager.js";

const DEFAULT_MODEL = "claude-opus-4-6";
const HOME_DIR = os.homedir();

type SchedulerEventHandler = (event: { type: string; data: unknown }) => void;
const listeners: SchedulerEventHandler[] = [];

export function onSchedulerEvent(handler: SchedulerEventHandler) {
  listeners.push(handler);
}

export function offSchedulerEvent(handler: SchedulerEventHandler) {
  const idx = listeners.indexOf(handler);
  if (idx !== -1) listeners.splice(idx, 1);
}

function emit(event: { type: string; data: unknown }) {
  for (const fn of listeners) {
    try { fn(event); } catch { /* ignore */ }
  }
}

export function computeNextRun(task: Pick<ScheduledTask, "frequency" | "timeOfDay" | "dayOfWeek">): string {
  const now = new Date();
  const [hours, minutes] = (task.timeOfDay || "09:00").split(":").map(Number);
  const next = new Date(now);
  next.setSeconds(0, 0);
  next.setHours(hours, minutes);

  switch (task.frequency) {
    case "hourly":
      next.setMinutes(0);
      if (next <= now) next.setHours(next.getHours() + 1);
      break;
    case "daily":
      if (next <= now) next.setDate(next.getDate() + 1);
      break;
    case "weekdays": {
      if (next <= now) next.setDate(next.getDate() + 1);
      while (next.getDay() === 0 || next.getDay() === 6) {
        next.setDate(next.getDate() + 1);
      }
      break;
    }
    case "weekly": {
      const target = task.dayOfWeek ?? 1;
      if (next <= now) next.setDate(next.getDate() + 1);
      while (next.getDay() !== target) {
        next.setDate(next.getDate() + 1);
      }
      break;
    }
  }
  return next.toISOString();
}

async function executeTask(task: ScheduledTask): Promise<void> {
  const convId = randomUUID();
  const cwd = task.cwd || HOME_DIR;
  const model = task.model || DEFAULT_MODEL;

  store.createConversation(convId, `[Scheduled] ${task.name}`, cwd, model);
  if (!task.cwd) {
    store.updateConversation(convId, { chatOnly: true });
  }

  const run: TaskRun = {
    id: randomUUID(),
    taskId: task.id,
    conversationId: convId,
    status: "running",
    startedAt: new Date().toISOString(),
  };
  scheduleStore.addRun(task.id, run);
  emit({ type: "task_run_started", data: { taskId: task.id, run } });

  try {
    const session = sessionManager.getOrCreateSession(convId, cwd, model);
    const { text } = await session.sendMessage(task.prompt);

    const assistantMsg = {
      id: randomUUID(),
      role: "assistant" as const,
      content: text || "(no response)",
      timestamp: new Date().toISOString(),
    };
    store.addMessage(convId, assistantMsg);

    const summary = (text || "").slice(0, 200);
    scheduleStore.updateRun(task.id, run.id, {
      status: "completed",
      summary,
      completedAt: new Date().toISOString(),
    });
    scheduleStore.updateTask(task.id, {
      lastRunAt: new Date().toISOString(),
      nextRunAt: computeNextRun(task),
    });

    emit({ type: "task_run_completed", data: { taskId: task.id, runId: run.id, summary, conversationId: convId } });
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : "Unknown error";
    scheduleStore.updateRun(task.id, run.id, {
      status: "failed",
      summary: errMsg,
      completedAt: new Date().toISOString(),
    });
    scheduleStore.updateTask(task.id, {
      lastRunAt: new Date().toISOString(),
      nextRunAt: computeNextRun(task),
    });

    emit({ type: "task_run_failed", data: { taskId: task.id, runId: run.id, error: errMsg } });
    console.error(`Scheduled task "${task.name}" failed:`, errMsg);
  }
}

let intervalId: ReturnType<typeof setInterval> | null = null;

function tick() {
  const now = new Date();
  const tasks = scheduleStore.listTasks();
  for (const task of tasks) {
    if (!task.enabled) continue;
    const nextRun = new Date(task.nextRunAt);
    if (nextRun <= now) {
      executeTask(task).catch((err) => {
        console.error("Scheduler tick error:", err);
      });
    }
  }
}

export function startScheduler() {
  if (intervalId) return;
  console.log("Scheduler started (60s interval)");
  intervalId = setInterval(tick, 60_000);
  tick();
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
}
