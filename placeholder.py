#!/usr/bin/env python3
"""
placeholder.py - A simple all-purpose placeholder script.
Replace the dummy logic with your own implementation.
"""

import logging
import sys

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
APP_NAME = "PlaceholderApp"
VERSION = "0.1.0"
DEBUG = True

logging.basicConfig(
    level=logging.DEBUG if DEBUG else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
log = logging.getLogger(APP_NAME)

# ---------------------------------------------------------------------------
# Dummy data
# ---------------------------------------------------------------------------
SAMPLE_ITEMS = [
    {"id": 1, "name": "Widget A", "price": 9.99},
    {"id": 2, "name": "Widget B", "price": 14.99},
    {"id": 3, "name": "Widget C", "price": 4.99},
]

# ---------------------------------------------------------------------------
# Helper functions
# ---------------------------------------------------------------------------

def fetch_data(source: str = "default") -> list[dict]:
    """Simulate fetching data from an external source."""
    log.info("Fetching data from source=%s ...", source)
    # TODO: Replace with real data-fetching logic
    return SAMPLE_ITEMS


def process_item(item: dict) -> dict:
    """Apply some dummy transformation to a single item."""
    processed = {
        **item,
        "name": item["name"].upper(),
        "price": round(item["price"] * 1.1, 2),  # 10% markup
    }
    log.debug("Processed item: %s -> %s", item, processed)
    return processed


def save_results(results: list[dict], destination: str = "stdout") -> None:
    """Persist results somewhere (placeholder just prints them)."""
    log.info("Saving %d result(s) to %s", len(results), destination)
    for r in results:
        print(f"  -> {r}")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def main() -> int:
    """Run the placeholder pipeline."""
    log.info("%s v%s starting up", APP_NAME, VERSION)

    # Step 1 - Fetch
    data = fetch_data(source="demo")

    # Step 2 - Process
    results = [process_item(item) for item in data]

    # Step 3 - Save
    save_results(results)

    log.info("Done! Processed %d item(s).", len(results))
    return 0


if __name__ == "__main__":
    sys.exit(main())
