"""Strict privacy sanitizer and leakage gate for public releases."""
from __future__ import annotations

import json
import re
from typing import Any


class SanitizationError(RuntimeError):
    """Raised when forbidden internal data leaks into a public build."""


FORBIDDEN_LITERALS = [
    "General_Problems_Explorer_INTERNAL",
    "Direct expert feedback, internal",
]

FORBIDDEN_REGEXES = [
    re.compile(r"[\u4e00-\u9fff]+"),
    re.compile(r"[A-Za-z]:\\{1,2}Users\\{1,2}[^\s\"']+"),
    re.compile(r"/Users/[^\s\"']+/"),
    re.compile(r"/home/[^\s\"']+/"),
]


def assert_public_safe(payload: Any) -> dict[str, Any]:
    """Serialize payload and assert zero forbidden internal leaks."""
    serialized = json.dumps(payload, ensure_ascii=False)
    violations: list[str] = []

    for token in FORBIDDEN_LITERALS:
        if token in serialized:
            violations.append(f"Forbidden literal found in public bundle: {token}")

    for rx in FORBIDDEN_REGEXES:
        m = rx.search(serialized)
        if m:
            violations.append(f"Forbidden private content matched in public bundle: {m.group(0)}")

    if violations:
        raise SanitizationError("\n".join(violations))

    return {
        "passed": True,
        "checked_literals": len(FORBIDDEN_LITERALS),
        "checked_patterns": len(FORBIDDEN_REGEXES),
        "payload_bytes": len(serialized.encode("utf-8")),
    }
