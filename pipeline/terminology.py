"""Pure-stdlib Terminology Lock checker for Open Problems in AI Evaluation."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any


LOCKED_TERM_REPLACEMENTS: tuple[tuple[str, str], ...] = (
    ("abilities", "capabilities"),
    ("ability", "capability"),
    ("tendencies", "propensities"),
    ("tendency", "propensity"),
)


def _match_case(template: str, replacement: str) -> str:
    if template.isupper():
        return replacement.upper()
    if template and template[0].isupper():
        return replacement[0].upper() + replacement[1:]
    return replacement


def restore_locked_terminology(text: str) -> str:
    """Restore manuscript-locked academic terms while preserving grammatical number and casing."""
    if not text:
        return text
    updated = text
    for old_term, new_term in LOCKED_TERM_REPLACEMENTS:
        pattern = re.compile(rf"\b{re.escape(old_term)}\b", re.IGNORECASE)
        updated = pattern.sub(lambda m, rep=new_term: _match_case(m.group(0), rep), updated)
    return updated


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
