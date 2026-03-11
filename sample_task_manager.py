"""
Sample Task Manager Script
A placeholder demo simulating a simple task management system.
"""

import random
import datetime


# --- Data Models ---
class Task:
    """Represents a single task."""

    PRIORITIES = ("low", "medium", "high", "critical")
    STATUSES = ("todo", "in_progress", "done", "cancelled")

    def __init__(self, title, description="", priority="medium", assignee=None):
        self.id = random.randint(1000, 9999)
        self.title = title
        self.description = description
        self.priority = priority
        self.status = "todo"
        self.assignee = assignee
        self.created_at = datetime.datetime.now()
        self.completed_at = None
        self.tags = []

    def complete(self):
        self.status = "done"
        self.completed_at = datetime.datetime.now()

    def assign(self, person):
        self.assignee = person
        self.status = "in_progress"

    def __repr__(self):
        return f"<Task #{self.id} [{self.priority.upper()}] '{self.title}' — {self.status}>"


class TaskBoard:
    """A collection of tasks with filtering and reporting."""

    def __init__(self, name):
        self.name = name
        self.tasks = []

    def add_task(self, task):
        self.tasks.append(task)
        print(f"  + Added: {task}")

    def get_by_status(self, status):
        return [t for t in self.tasks if t.status == status]

    def get_by_priority(self, priority):
        return [t for t in self.tasks if t.priority == priority]

    def get_by_assignee(self, assignee):
        return [t for t in self.tasks if t.assignee == assignee]

    def summary(self):
        print(f"\n{'=' * 50}")
        print(f"  Board: {self.name}")
        print(f"{'=' * 50}")
        for status in Task.STATUSES:
            group = self.get_by_status(status)
            print(f"\n  [{status.upper()}] ({len(group)} tasks)")
            for task in group:
                assignee = task.assignee or "Unassigned"
                print(f"    #{task.id}  {task.title:<25} [{task.priority}]  -> {assignee}")
        print(f"\n{'=' * 50}")
        total = len(self.tasks)
        done = len(self.get_by_status("done"))
        pct = (done / total * 100) if total else 0
        print(f"  Progress: {done}/{total} tasks complete ({pct:.0f}%)")
        print(f"{'=' * 50}\n")


# --- Dummy Data Generator ---
def seed_dummy_tasks(board):
    """Populate the board with placeholder tasks."""
    team = ["Alice", "Bob", "Charlie", "Diana"]
    dummy_tasks = [
        ("Set up project repo", "Initialize git and add README", "high"),
        ("Design database schema", "Draft ERD for core models", "critical"),
        ("Create login page", "Build form with validation", "high"),
        ("Write unit tests", "Cover auth module with tests", "medium"),
        ("Add dark mode toggle", "User preference for theme", "low"),
        ("Implement search API", "Full-text search endpoint", "medium"),
        ("Fix navbar alignment", "CSS bug on mobile", "low"),
        ("Deploy to staging", "Set up CI/CD pipeline", "critical"),
        ("Write API docs", "OpenAPI spec for all endpoints", "medium"),
        ("Code review sprint 1", "Review all open PRs", "high"),
    ]

    for title, desc, priority in dummy_tasks:
        task = Task(title, desc, priority, assignee=random.choice(team))
        board.add_task(task)

    return board


def simulate_progress(board):
    """Randomly advance some tasks to mimic real work."""
    print("\n--- Simulating work progress ---")
    for task in board.tasks:
        roll = random.random()
        if roll < 0.3:
            task.complete()
            print(f"  [DONE] {task.title}")
        elif roll < 0.6:
            task.status = "in_progress"
            print(f"  [WIP]  {task.title}")
        else:
            print(f"  [TODO] {task.title}")


# --- Main ---
def main():
    print("Starting Task Manager Demo...\n")

    board = TaskBoard("Sprint 1 - Q1 2025")
    seed_dummy_tasks(board)
    simulate_progress(board)
    board.summary()

    # Quick filter demo
    critical = board.get_by_priority("critical")
    print(f"Critical tasks ({len(critical)}):")
    for t in critical:
        print(f"  - {t}")

    alice_tasks = board.get_by_assignee("Alice")
    print(f"\nAlice's tasks ({len(alice_tasks)}):")
    for t in alice_tasks:
        print(f"  - {t}")

    print("\nDone! This was a placeholder demo.")


if __name__ == "__main__":
    main()
