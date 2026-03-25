import fs from "fs";
import path from "path";
import { ScheduledTask, TaskRun, ScheduledTaskFile } from "./types.js";

const DATA_DIR = path.join(process.cwd(), "data", "schedules");
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ensureDir() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function filePath(id: string): string {
  if (!UUID_RE.test(id)) throw new Error("Invalid schedule ID format");
  return path.join(DATA_DIR, `${id}.json`);
}

function readFile(id: string): ScheduledTaskFile | null {
  const fp = filePath(id);
  if (!fs.existsSync(fp)) return null;
  return JSON.parse(fs.readFileSync(fp, "utf-8"));
}

function writeFile(id: string, data: ScheduledTaskFile): void {
  ensureDir();
  fs.writeFileSync(filePath(id), JSON.stringify(data, null, 2));
}

export function listTasks(): ScheduledTask[] {
  ensureDir();
  const files = fs.readdirSync(DATA_DIR).filter((f) => f.endsWith(".json"));
  return files.map((f) => {
    const data: ScheduledTaskFile = JSON.parse(
      fs.readFileSync(path.join(DATA_DIR, f), "utf-8"),
    );
    return data.task;
  });
}

export function getTask(id: string): ScheduledTaskFile | null {
  return readFile(id);
}

export function createTask(task: ScheduledTask): ScheduledTaskFile {
  const file: ScheduledTaskFile = { task, runs: [] };
  writeFile(task.id, file);
  return file;
}

export function updateTask(id: string, updates: Partial<ScheduledTask>): ScheduledTask | null {
  const file = readFile(id);
  if (!file) return null;
  Object.assign(file.task, updates);
  writeFile(id, file);
  return file.task;
}

export function deleteTask(id: string): boolean {
  const fp = filePath(id);
  if (!fs.existsSync(fp)) return false;
  fs.unlinkSync(fp);
  return true;
}

export function addRun(taskId: string, run: TaskRun): void {
  const file = readFile(taskId);
  if (!file) return;
  file.runs.push(run);
  if (file.runs.length > 50) {
    file.runs = file.runs.slice(-50);
  }
  writeFile(taskId, file);
}

export function updateRun(taskId: string, runId: string, updates: Partial<TaskRun>): void {
  const file = readFile(taskId);
  if (!file) return;
  const run = file.runs.find((r) => r.id === runId);
  if (run) {
    Object.assign(run, updates);
    writeFile(taskId, file);
  }
}

export function getTaskRuns(taskId: string, limit = 20): TaskRun[] {
  const file = readFile(taskId);
  if (!file) return [];
  return file.runs.slice(-limit).reverse();
}
