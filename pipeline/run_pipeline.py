"""Master entry point for data extraction, terminology audit, sanitization, and replay packaging."""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from extract_legacy import build_datasets
from pack_reproduce import verify_and_pack_reproduce


def main() -> None:
    print("[pipeline] Building v2 internal and sanitized public datasets...")
    data_report = build_datasets(ROOT)
    print(json.dumps(data_report, indent=2, ensure_ascii=False))

    print("[pipeline] Verifying SHA-256 checksums, running upstream replay, and packing reproduce/*.zip...")
    replay_report = verify_and_pack_reproduce(ROOT, run_scripts=True)
    print(json.dumps(replay_report, indent=2, ensure_ascii=False))

    print("[pipeline] Completed successfully.")


if __name__ == "__main__":
    main()
