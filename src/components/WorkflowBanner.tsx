import { WorkflowState, WorkflowPhase } from "../types";

interface WorkflowBannerProps {
  workflow: WorkflowState;
  onExecute: () => void;
  isStreaming: boolean;
}

const PHASES: { key: WorkflowPhase; label: string; icon: string }[] = [
  { key: "brainstorming", label: "Brainstorm", icon: "💡" },
  { key: "spec-review", label: "Spec", icon: "📋" },
  { key: "planning", label: "Plan", icon: "🗺️" },
  { key: "executing", label: "Build", icon: "⚡" },
  { key: "completed", label: "Done", icon: "✅" },
];

function getPhaseIndex(phase: WorkflowPhase): number {
  if (phase === "ready") return 2;
  return PHASES.findIndex((p) => p.key === phase);
}

function getPhaseStatus(phase: WorkflowPhase): string {
  switch (phase) {
    case "brainstorming":
      return "Asking questions & exploring approaches";
    case "spec-review":
      return "Review the design spec";
    case "ready":
      return "Spec written — run /execute to create plan or start building";
    case "planning":
      return "Creating implementation plan with dispatchable tasks";
    case "executing":
      return "Sub-agents are building from the plan";
    case "completed":
      return "All tasks completed";
  }
}

export function WorkflowBanner({ workflow, onExecute, isStreaming }: WorkflowBannerProps) {
  const currentIdx = getPhaseIndex(workflow.phase);
  const showExecuteButton = (workflow.phase === "ready") && !isStreaming;

  return (
    <div className="workflow-banner">
      <div className="workflow-banner-top">
        <div className="workflow-phases">
          {PHASES.map((phase, i) => {
            let status: "done" | "active" | "upcoming" = "upcoming";
            if (i < currentIdx) status = "done";
            else if (i === currentIdx) status = "active";

            return (
              <div key={phase.key} className={`workflow-phase workflow-phase-${status}`}>
                <div className="workflow-phase-indicator">
                  {status === "done" ? (
                    <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                      <path d="M3 8.5L6.5 12L13 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <span className="workflow-phase-icon">{phase.icon}</span>
                  )}
                </div>
                <span className="workflow-phase-label">{phase.label}</span>
                {i < PHASES.length - 1 && (
                  <div className={`workflow-phase-connector ${status === "done" ? "done" : ""}`} />
                )}
              </div>
            );
          })}
        </div>
        {showExecuteButton && (
          <button className="workflow-execute-btn" onClick={onExecute}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <path d="M4 2L13 8L4 14V2Z" fill="currentColor"/>
            </svg>
            Execute
          </button>
        )}
      </div>
      <div className="workflow-banner-status">
        <span className="workflow-description" title={workflow.description}>
          {workflow.description}
        </span>
        <span className="workflow-status-text">{getPhaseStatus(workflow.phase)}</span>
      </div>
    </div>
  );
}
