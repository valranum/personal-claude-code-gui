#!/usr/bin/env python3
"""
Sample Script - A simple placeholder/demo script.
"""

import random
import time


# --- Constants ---
APP_NAME = "PlaceholderApp"
VERSION = "1.0.0"
MAX_RETRIES = 3

# --- Sample Data ---
USERS = [
    {"id": 1, "name": "Alice", "role": "admin"},
    {"id": 2, "name": "Bob", "role": "editor"},
    {"id": 3, "name": "Charlie", "role": "viewer"},
    {"id": 4, "name": "Diana", "role": "editor"},
]

GREETINGS = ["Hello", "Hi there", "Welcome", "Hey", "Greetings"]


# --- Helper Functions ---
def get_greeting(name):
    """Return a random greeting for the given name."""
    greeting = random.choice(GREETINGS)
    return f"{greeting}, {name}!"


def format_user(user):
    """Format a user dict into a readable string."""
    return f"[{user['id']}] {user['name']} ({user['role']})"


def fetch_data(source="database"):
    """Simulate fetching data from an external source."""
    print(f"  Fetching data from {source}...")
    time.sleep(0.3)  # Simulate network/IO delay
    return {"status": "ok", "records": len(USERS)}


def process_items(items):
    """Process a list of items and return a summary."""
    results = []
    for item in items:
        processed = {
            "original": item,
            "upper": item.upper() if isinstance(item, str) else item,
            "length": len(str(item)),
        }
        results.append(processed)
    return results


# --- Main Logic ---
def run():
    """Main entry point for the script."""
    print(f"{'=' * 40}")
    print(f"  {APP_NAME} v{VERSION}")
    print(f"{'=' * 40}\n")

    # Step 1: Greet users
    print("Step 1: Greeting users")
    print("-" * 30)
    for user in USERS:
        print(f"  {get_greeting(user['name'])}")
    print()

    # Step 2: Fetch some data
    print("Step 2: Fetching data")
    print("-" * 30)
    result = fetch_data("api_server")
    print(f"  Result: {result}\n")

    # Step 3: List users
    print("Step 3: User directory")
    print("-" * 30)
    for user in USERS:
        print(f"  {format_user(user)}")
    print()

    # Step 4: Process some dummy items
    print("Step 4: Processing items")
    print("-" * 30)
    sample_items = ["foo", "bar", "baz", "qux"]
    processed = process_items(sample_items)
    for p in processed:
        print(f"  {p['original']:>5} -> {p['upper']:<5} (len: {p['length']})")
    print()

    # Done
    print(f"{'=' * 40}")
    print("  Done! All tasks completed successfully.")
    print(f"{'=' * 40}")


if __name__ == "__main__":
    run()
