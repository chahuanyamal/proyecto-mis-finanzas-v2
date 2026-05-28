from __future__ import annotations

import sys
import subprocess


def bootstrap():
    """Run migrations and seed from entrypoint."""
    print("→ Bootstrap: running migrations...")
    result = subprocess.run(
        [sys.executable, "-m", "alembic", "upgrade", "head"],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        print(f"Migration failed: {result.stderr}")
        sys.exit(1)
    print(result.stdout.strip())

    print("→ Bootstrap: seeding data...")
    result = subprocess.run(
        [sys.executable, "-m", "app.scripts.seed"],
        capture_output=True,
        text=True,
    )
    print(result.stdout.strip())


if __name__ == "__main__":
    bootstrap()
