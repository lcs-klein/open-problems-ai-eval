"""Pure-stdlib Terminology Lock checker for Open Problems in AI Evaluation."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


def load_terminology_rules(lock_path: Path) -> list[dict[str, Any]]:
    data = json.loads(lock_path.read_text(encoding="utf-8"))
    return list(data.get("rules", []))


def check_text_terminology(
    text: str,
    rules: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    """Scan text for disallowed substitutes of locked academic terms."""
    alerts: list[dict[str, Any]] = []
    if not text:
        return alerts

    for rule in rules:
        locked = rule["locked_term"]
        for sub in rule.get("disallowed_substitutes", []):
            pattern = re.compile(rf"\b{re.escape(sub)}\b", re.IGNORECASE)
            match = pattern.search(text)
            if match:
                alerts.append(
                    {
                        "rule_id": rule["id"],
                        "locked_term": locked,
                        "found_term": match.group(0),
                        "severity": rule.get("severity", "warning"),
                        "paper_context": rule.get("paper_context", ""),
                        "rationale": rule.get("rationale", ""),
                    }
                )
    return alerts
