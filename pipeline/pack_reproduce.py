"""Verify Python stdlib replay packages and pack them into reproduce/*.zip."""
from __future__ import annotations

import hashlib
import subprocess
import sys
import zipfile
from pathlib import Path
from typing import Any


def verify_sha256sums(folder: Path) -> int:
    sums_file = folder / "SHA256SUMS.txt"
    if not sums_file.exists():
        return 0
    checked = 0
    for line in sums_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        expected_hash, rel_name = line.split(None, 1)
        target = folder / rel_name.strip().lstrip("*")
        actual_hash = hashlib.sha256(target.read_bytes()).hexdigest()
        if actual_hash.lower() != expected_hash.lower():
            raise RuntimeError(
                f"SHA-256 mismatch for {target}: expected {expected_hash}, got {actual_hash}"
            )
        checked += 1
    return checked


def pack_directory(src_dir: Path, zip_path: Path) -> int:
    zip_path.parent.mkdir(parents=True, exist_ok=True)
    files = sorted(p for p in src_dir.rglob("*") if p.is_file() and "__pycache__" not in p.parts)
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for file_path in files:
            arcname = file_path.relative_to(src_dir).as_posix()
            zf.write(file_path, arcname)
    return len(files)


def verify_and_pack_reproduce(root: Path, run_scripts: bool = True) -> dict[str, Any]:
    upstream_dir = root / "generation_upstream_replay"
    method_dir = root / "generation_method_replay"
    out_dir = root / "reproduce"
    out_dir.mkdir(parents=True, exist_ok=True)

    checked_hashes = verify_sha256sums(upstream_dir)

    if run_scripts:
        for script_name in ("reproduce_selection.py", "reproduce_handoff.py"):
            res = subprocess.run(
                [sys.executable, script_name],
                cwd=upstream_dir,
                capture_output=True,
                text=True,
                check=False,
            )
            if res.returncode != 0:
                raise RuntimeError(
                    f"Replay script {script_name} failed:\nSTDOUT: {res.stdout}\nSTDERR: {res.stderr}"
                )

    upstream_count = pack_directory(upstream_dir, out_dir / "generation_upstream_replay.zip")
    method_count = pack_directory(method_dir, out_dir / "generation_method_replay.zip")

    return {
        "upstream_sha256_verified": checked_hashes,
        "upstream_zip_files": upstream_count,
        "method_zip_files": method_count,
        "output_dir": str(out_dir),
    }
