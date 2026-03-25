import { useState, useEffect, useRef, useCallback } from "react";
import { apiFetch } from "../utils/api";
import { ScheduledTask, TaskRun, TaskFrequency } from "../types";

interface ScheduleModalProps {
  open: boolean;
  onClose: () => void;
  onToast?: (msg: string) => void;
}

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const FREQ_LABELS: Record<TaskFrequency, string> = {
  hourly: "Every hour",
  daily: "Every day",
  weekdays: "Weekdays (M-F)",
  weekly: "Weekly",
};

interface TaskFormState {
  name: string;
  prompt: string;
  frequency: TaskFrequency;
  timeOfDay: string;
  dayOfWeek: number;
}

const defaultForm: TaskFormState = {
  name: "",
  prompt: "",
  frequency: "daily",
  timeOfDay: "09:00",
  dayOfWeek: 1,
};

export function ScheduleModal({ open, onClose, onToast }: ScheduleModalProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [tasks, setTasks] = useState<ScheduledTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState<"list" | "form" | "runs">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<TaskFormState>(defaultForm);
  const [runs, setRuns] = useState<TaskRun[]>([]);
  const [runsTaskName, setRunsTaskName] = useState("");

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch("/api/schedules");
      if (res.ok) setTasks(await res.json());
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => {
    if (open) {
      fetchTasks();
      setView("list");
    }
  }, [open, fetchTasks]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (view !== "list") {
          setView("list");
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, view, onClose]);

  if (!open) return null;

  const openCreate = () => {
    setEditingId(null);
    setForm(defaultForm);
    setView("form");
  };

  const openEdit = (task: ScheduledTask) => {
    setEditingId(task.id);
    setForm({
      name: task.name,
      prompt: task.prompt,
      frequency: task.frequency,
      timeOfDay: task.timeOfDay || "09:00",
      dayOfWeek: task.dayOfWeek ?? 1,
    });
    setView("form");
  };

  const openRuns = async (task: ScheduledTask) => {
    setRunsTaskName(task.name);
    try {
      const res = await apiFetch(`/api/schedules/${task.id}/runs`);
      if (res.ok) setRuns(await res.json());
    } catch { /* ignore */ }
    setView("runs");
  };

  const saveTask = async () => {
    if (!form.name.trim() || !form.prompt.trim()) return;
    try {
      if (editingId) {
        await apiFetch(`/api/schedules/${editingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        onToast?.("Task updated");
      } else {
        await apiFetch("/api/schedules", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        });
        onToast?.("Task created");
      }
      await fetchTasks();
      setView("list");
    } catch {
      onToast?.("Failed to save task");
    }
  };

  const toggleEnabled = async (task: ScheduledTask) => {
    try {
      await apiFetch(`/api/schedules/${task.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: !task.enabled }),
      });
      await fetchTasks();
    } catch { /* ignore */ }
  };

  const deleteTask = async (taskId: string) => {
    try {
      await apiFetch(`/api/schedules/${taskId}`, { method: "DELETE" });
      onToast?.("Task deleted");
      await fetchTasks();
    } catch { /* ignore */ }
  };

  const formatNextRun = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = d.getTime() - now.getTime();
    if (diffMs < 0) return "overdue";
    if (diffMs < 3600_000) return `in ${Math.round(diffMs / 60_000)}m`;
    if (diffMs < 86400_000) return `in ${Math.round(diffMs / 3600_000)}h`;
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  };

  return (
    <div
      className="schedule-overlay"
      ref={overlayRef}
      onClick={(e) => { if (e.target === overlayRef.current) onClose(); }}
    >
      <div className="schedule-modal">
        <div className="schedule-header">
          <div className="schedule-header-left">
            {view !== "list" && (
              <button className="schedule-back-btn" onClick={() => setView("list")}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                  <path d="M10 4L6 8L10 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>
            )}
            <h2>
              {view === "list" && "Scheduled Tasks"}
              {view === "form" && (editingId ? "Edit Task" : "New Task")}
              {view === "runs" && `Runs: ${runsTaskName}`}
            </h2>
          </div>
          <button className="schedule-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div className="schedule-body">
          {view === "list" && (
            <>
              {loading && tasks.length === 0 && (
                <div className="schedule-empty">Loading...</div>
              )}
              {!loading && tasks.length === 0 && (
                <div className="schedule-empty">
                  <p>No scheduled tasks yet.</p>
                  <p className="schedule-empty-sub">Create recurring tasks that Claude runs automatically on a schedule.</p>
                </div>
              )}
              {tasks.length > 0 && (
                <div className="schedule-task-list">
                  {tasks.map((task) => (
                    <div key={task.id} className={`schedule-task-item ${!task.enabled ? "schedule-task-disabled" : ""}`}>
                      <div className="schedule-task-main" onClick={() => openEdit(task)}>
                        <div className="schedule-task-name">{task.name}</div>
                        <div className="schedule-task-meta">
                          <span>{FREQ_LABELS[task.frequency]}</span>
                          {task.frequency !== "hourly" && <span>at {task.timeOfDay}</span>}
                          <span className="schedule-task-next">Next: {formatNextRun(task.nextRunAt)}</span>
                        </div>
                      </div>
                      <div className="schedule-task-actions">
                        <button
                          className="schedule-icon-btn"
                          title="Run history"
                          onClick={(e) => { e.stopPropagation(); openRuns(task); }}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.2"/>
                            <path d="M8 5V8L10 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          </svg>
                        </button>
                        <button
                          className={`schedule-icon-btn ${task.enabled ? "schedule-enabled" : "schedule-disabled-icon"}`}
                          title={task.enabled ? "Disable" : "Enable"}
                          onClick={(e) => { e.stopPropagation(); toggleEnabled(task); }}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            {task.enabled ? (
                              <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                            ) : (
                              <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                            )}
                          </svg>
                        </button>
                        <button
                          className="schedule-icon-btn schedule-delete-btn"
                          title="Delete"
                          onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                        >
                          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                            <path d="M5 3V2.5C5 1.67 5.67 1 6.5 1H9.5C10.33 1 11 1.67 11 2.5V3M2 4H14M4 4V13.5C4 14.33 4.67 15 5.5 15H10.5C11.33 15 12 14.33 12 13.5V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                          </svg>
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <div className="schedule-footer">
                <button className="schedule-create-btn" onClick={openCreate}>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                    <path d="M8 3V13M3 8H13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  New Scheduled Task
                </button>
              </div>
            </>
          )}

          {view === "form" && (
            <div className="schedule-form">
              <label className="schedule-label">
                Name
                <input
                  className="schedule-input"
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Daily standup summary"
                  autoFocus
                />
              </label>

              <label className="schedule-label">
                Prompt
                <textarea
                  className="schedule-textarea"
                  value={form.prompt}
                  onChange={(e) => setForm({ ...form, prompt: e.target.value })}
                  placeholder="What should Claude do each time this runs?"
                  rows={4}
                />
              </label>

              <label className="schedule-label">
                Frequency
                <select
                  className="schedule-select"
                  value={form.frequency}
                  onChange={(e) => setForm({ ...form, frequency: e.target.value as TaskFrequency })}
                >
                  {Object.entries(FREQ_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>

              {form.frequency !== "hourly" && (
                <label className="schedule-label">
                  Time of day
                  <input
                    className="schedule-input"
                    type="time"
                    value={form.timeOfDay}
                    onChange={(e) => setForm({ ...form, timeOfDay: e.target.value })}
                  />
                </label>
              )}

              {form.frequency === "weekly" && (
                <label className="schedule-label">
                  Day of week
                  <select
                    className="schedule-select"
                    value={form.dayOfWeek}
                    onChange={(e) => setForm({ ...form, dayOfWeek: parseInt(e.target.value, 10) })}
                  >
                    {DAYS.map((d, i) => (
                      <option key={i} value={i}>{d}</option>
                    ))}
                  </select>
                </label>
              )}

              <div className="schedule-form-actions">
                <button className="schedule-cancel-btn" onClick={() => setView("list")}>
                  Cancel
                </button>
                <button
                  className="schedule-save-btn"
                  onClick={saveTask}
                  disabled={!form.name.trim() || !form.prompt.trim()}
                >
                  {editingId ? "Save Changes" : "Create Task"}
                </button>
              </div>
            </div>
          )}

          {view === "runs" && (
            <div className="schedule-runs">
              {runs.length === 0 && (
                <div className="schedule-empty">No runs yet.</div>
              )}
              {runs.map((run) => (
                <div key={run.id} className={`schedule-run-item schedule-run-${run.status}`}>
                  <div className="schedule-run-status">
                    {run.status === "completed" && (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M3 8L6.5 11.5L13 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                    {run.status === "failed" && (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
                        <path d="M4 4L12 12M12 4L4 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                      </svg>
                    )}
                    {run.status === "running" && (
                      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" className="schedule-run-spinner">
                        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="24" strokeDashoffset="8"/>
                      </svg>
                    )}
                  </div>
                  <div className="schedule-run-info">
                    <div className="schedule-run-time">
                      {new Date(run.startedAt).toLocaleString()}
                      {run.completedAt && (
                        <span className="schedule-run-duration">
                          {" "}({Math.round((new Date(run.completedAt).getTime() - new Date(run.startedAt).getTime()) / 1000)}s)
                        </span>
                      )}
                    </div>
                    {run.summary && (
                      <div className="schedule-run-summary">{run.summary}</div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
