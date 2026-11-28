"""Extract legacy embedded JSON datasets and upgrade them to v2 3-layer governance schema."""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from terminology import (
    check_text_terminology,
    load_terminology_rules,
    restore_locked_terminology,
)
from sanitizer import assert_public_safe


def extract_embedded_json(html_path: Path, script_id: str) -> dict[str, Any]:
    text = html_path.read_text(encoding="utf-8")
    pattern = re.compile(
        rf'<script[^>]*id="{re.escape(script_id)}"[^>]*>(.*?)</script>',
        re.DOTALL,
    )
    match = pattern.search(text)
    if not match:
        raise ValueError(f"Could not locate <script id=\"{script_id}\"> in {html_path}")
    return json.loads(match.group(1))


def infer_author_type(item: dict[str, Any]) -> str:
    op = str(item.get("operation", "")).lower()
    lineage_type = str((item.get("lineage") or {}).get("type", "")).lower()
    ai_role = str(item.get("known_ai_role", "")).lower()

    if op in ("keep", "keep_human", "retain") or lineage_type in ("keep", "retain"):
        return "human"
    if op in ("add", "new", "split", "merge", "rewrite") or lineage_type in ("new", "split", "merge", "rewrite"):
        return "ai_assisted"
    if "machine" in ai_role or "ai" in ai_role or "screening" in ai_role:
        return "ai_assisted"
    return "ai_assisted"


def build_what_and_why_changed(
    item: dict[str, Any],
    internal_match: dict[str, Any] | None = None,
) -> tuple[str, str, str]:
    """Return (what_changed, why_changed, justification_status)."""
    lineage = item.get("lineage") or {}
    ltype = lineage.get("type") or item.get("operation") or "screening"
    preds = lineage.get("predecessors") or lineage.get("main") or []
    related = lineage.get("related") or []

    retained_text = str(lineage.get("retained") or "").strip()
    changed_text = str(lineage.get("changed") or "").strip()

    if retained_text or changed_text:
        parts = [p for p in (retained_text, changed_text) if p]
        what = " ".join(parts)
    elif ltype == "merge" and preds:
        what = f"Merged earlier manuscript items {', '.join(preds)} into {item['id']}."
    elif ltype == "split" and preds:
        what = f"Split earlier manuscript item(s) {', '.join(preds)} to form {item['id']}."
    elif ltype in ("rewrite", "revise", "reframe") and preds:
        what = f"Rephrased earlier manuscript item(s) {', '.join(preds)} into {item['id']}."
    elif ltype == "retain" and preds:
        what = f"Retained manuscript item {', '.join(preds)} as {item['id']}."
    elif ltype == "new":
        what = f"Proposed new open problem {item['id']} not directly present as a standalone item in the Nov 6 draft."
    else:
        what = f"Retained or adapted from {', '.join(preds) if preds else 'screening pool'} as {item['id']}."

    if related and not (retained_text or changed_text):
        what += f" Thematically related to: {', '.join(related)}."

    # Build why_changed from internal rationales / notes if present, otherwise explicitly mark as needing human justification
    why_parts: list[str] = []
    src = internal_match or item
    rationales = src.get("rationales") or []
    if len(rationales) >= 3 and rationales[2]:
        why_parts.append(f"Clarity & scope rationale: {rationales[2]}")
    if src.get("notes"):
        why_parts.append(str(src["notes"]))

    if ltype in ("merge", "split", "rewrite") and preds:
        if why_parts:
            why = (
                " ".join(why_parts)
                + " [Action required: Human co-author must confirm what specific defect or overlap in "
                + ", ".join(preds)
                + " justifies this restructuring.]"
            )
            status = "needs_human_justification"
        else:
            why = (
                f"Pending normative justification: explain what was inadequate or overlapping in "
                f"{', '.join(preds)} to justify creating {item['id']}."
            )
            status = "needs_human_justification"
    elif why_parts:
        why = " ".join(why_parts)
        status = "documented"
    else:
        why = "Pending human author rationale for inclusion in the canonical manuscript taxonomy."
        status = "needs_human_justification"

    return what, why, status


def enrich_open_problem(
    item: dict[str, Any],
    rules: list[dict[str, Any]],
    internal_match: dict[str, Any] | None = None,
) -> dict[str, Any]:
    enriched = dict(item)
    lineage = dict(enriched.get("lineage") or {})
    preds = lineage.get("predecessors") or lineage.get("main") or []
    lineage["predecessors"] = list(preds)

    what_changed, why_changed, justification_status = build_what_and_why_changed(
        enriched, internal_match=internal_match
    )
    lineage["what_changed"] = what_changed
    lineage["why_changed"] = why_changed
    lineage["justification_status"] = justification_status
    enriched["lineage"] = lineage

    # Paper section alignment (Tier 2 strict 1:1 binding)
    enriched["paper_section_id"] = preds[0] if preds else "UNALIGNED_PROPOSAL"
    enriched["manuscript_alignment"] = "aligned" if len(preds) == 1 else ("restructured" if len(preds) > 1 else "new_proposal")

    # Author & provenance traceability
    author_type = infer_author_type(enriched)
    enriched["provenance"] = {
        "author_type": author_type,
        "proposer_name": "AI-assisted screening (Astra / editorial draft)" if author_type != "human" else "Manuscript co-authors",
        "known_ai_role": enriched.get(
            "known_ai_role",
            "AI-assisted synthesis and combinatorial screening recommendation; subject to human moderator approval.",
        ),
    }

    # Wikipedia-style human moderator governance
    enriched["governance"] = {
        "status": "screening_recommendation",
        "moderator_signoff": {
            "moderator_name": None,
            "decision_date": None,
            "notes": None,
        },
    }

    # Restore locked manuscript terminology before scanning for remaining alerts
    if isinstance(enriched.get("title"), str):
        enriched["title"] = restore_locked_terminology(enriched["title"])
    if isinstance(enriched.get("description"), str):
        enriched["description"] = restore_locked_terminology(enriched["description"])

    # Terminology lock scan
    combined_text = f"{enriched.get('title', '')} {enriched.get('description', '')}"
    enriched["terminology_alerts"] = check_text_terminology(combined_text, rules)
    return enriched


def build_datasets(root: Path) -> dict[str, Any]:
    legacy_pub = root / "legacy" / "index.html"
    legacy_int = root / "legacy" / "General_Problems_Explorer_INTERNAL.html"
    lock_path = root / "data" / "terminology_lock.json"

    rules = load_terminology_rules(lock_path)
    pub_raw = extract_embedded_json(legacy_pub, "public-data")
    int_raw = extract_embedded_json(legacy_int, "explorer-data")

    int_by_id = {q["id"]: q for q in int_raw.get("questions", [])}
    for c in int_raw.get("candidates", []):
        int_by_id[c["id"]] = c

    # Upgrade internal open_problems (selected 48) and candidates (28)
    int_open_problems = [
        enrich_open_problem(q, rules, internal_match=q)
        for q in int_raw.get("questions", [])
    ]
    int_candidates = [
        enrich_open_problem(c, rules, internal_match=c)
        for c in int_raw.get("candidates", [])
    ]

    # Upgrade public open_problems (48) — using safe rationale summaries without internal leaks
    pub_open_problems = []
    for q in pub_raw.get("questions", []):
        # Do NOT pass internal_match notes if they might contain private info; pass only sanitized fields
        safe_match = None
        if q["id"] in int_by_id:
            im = int_by_id[q["id"]]
            safe_match = {"rationales": im.get("rationales", [])}
        pub_open_problems.append(enrich_open_problem(q, rules, internal_match=safe_match))

    # Build v2 internal bundle
    internal_bundle = {
        "schema_version": 2,
        "taxonomy": {
            "tier1_label": "Categories",
            "tier2_label": "Open Problems",
            "tier3_label": "Specific Challenges",
        },
        "meta": int_raw.get("meta", {}),
        "categories": int_raw.get("categories", {}),
        "rubric": int_raw.get("rubric", []),
        "terminology_rules": rules,
        "open_problems": int_open_problems,
        "candidates": int_candidates,
        "originals": int_raw.get("originals", []),
        "programme": int_raw.get("programme", []),
        "literature": int_raw.get("literature", []),
        "experts": int_raw.get("experts", []),
        "method": int_raw.get("method", {}),
    }

    # Extract strictly numeric, sanitized frontier points (K=7..48) for public Audit & Replay chart
    raw_frontier = (int_raw.get("method") or {}).get("frontier") or []
    public_frontier = [
        {
            "k": int(pt.get("size", 0)),
            "objective": round(float(pt.get("expanded_score", 0.0)), 4),
            "bridge_score": round(float(pt.get("bridge_score", 0.0)), 4),
            "avg_q1": round(float((pt.get("components") or {}).get("avg_q1", 0.0)), 3),
            "avg_q2": round(float((pt.get("components") or {}).get("avg_q2", 0.0)), 3),
            "avg_q3": round(float((pt.get("components") or {}).get("avg_q3", 0.0)), 3),
            "needs_coverage": round(float((pt.get("components") or {}).get("needs_weighted_union", 0.0)), 4),
            "research_coverage": round(float((pt.get("components") or {}).get("research_weighted_union", 0.0)), 4),
        }
        for pt in raw_frontier
        if int(pt.get("size", 0)) > 0 and float(pt.get("expanded_score", 0.0)) > 0
    ]

    # Build v2 public bundle (strictly sanitized)
    public_bundle = {
        "schema_version": 2,
        "taxonomy": {
            "tier1_label": "Categories",
            "tier2_label": "Open Problems",
            "tier3_label": "Specific Challenges",
        },
        "project": pub_raw.get("project", {}),
        "categories": pub_raw.get("categories", {}),
        "rubric": pub_raw.get("rubric", []),
        "terminology_rules": rules,
        "open_problems": pub_open_problems,
        "specific_challenges": pub_raw.get("challenge_seeds", []),
        "references": pub_raw.get("references", []),
        "source_audit": pub_raw.get("source_audit", {}),
        "participation": pub_raw.get("participation", {}),
        "version_snapshots": pub_raw.get("version_snapshots", {}),
        "generation_method": pub_raw.get("generation_method", {}),
        "provenance_audit": pub_raw.get("provenance_audit", {}),
        "editorial_audit": pub_raw.get("editorial_audit", {}),
        "screening_alternatives": pub_raw.get("screening_alternatives", {}),
        "screening_candidates": pub_raw.get("screening_candidates", {}),
        "screening_frontier": public_frontier,
        "manuscript_review": pub_raw.get("manuscript_review", {}),
        "generation_upstream": pub_raw.get("generation_upstream", {}),
        "openness_review": pub_raw.get("openness_review", {}),
        "reproduce_packages": [
            {
                "id": "upstream",
                "title": "Upstream Selection & Handoff Replay Package",
                "href": "reproduce/generation_upstream_replay.zip",
                "command": "python reproduce_selection.py && python reproduce_handoff.py",
                "description": "Pure Python 3.10+ stdlib replay of 801 literature records -> 438 formulations -> 327 active families -> 60 specific challenge seeds.",
            },
            {
                "id": "method",
                "title": "Downstream Combinatorial Optimization Replay Package",
                "href": "reproduce/generation_method_replay.zip",
                "command": "python optimize.py --verify && python generation_constrained_replay.py",
                "description": "Exact integer branch-and-bound solver reproducing K=7..48 optimal sets, coverage comparison, and constrained editorial stress tests.",
            },
        ],
    }

    # Run Sanitization Gate before writing public bundle
    sanitization_report = assert_public_safe(public_bundle)

    # Write internal and public bundles + human-editable slices
    int_dir = root / "data" / "internal"
    pub_dir = root / "data" / "public"
    int_dir.mkdir(parents=True, exist_ok=True)
    pub_dir.mkdir(parents=True, exist_ok=True)

    (int_dir / "internal_bundle.json").write_text(
        json.dumps(internal_bundle, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (int_dir / "open_problems.json").write_text(
        json.dumps(int_open_problems, ensure_ascii=False, indent=2), encoding="utf-8"
    )
    (pub_dir / "public_bundle.json").write_text(
        json.dumps(public_bundle, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    alert_count = sum(len(p["terminology_alerts"]) for p in pub_open_problems)
    return {
        "internal_open_problems": len(int_open_problems),
        "internal_candidates": len(int_candidates),
        "public_open_problems": len(pub_open_problems),
        "public_specific_challenges": len(public_bundle["specific_challenges"]),
        "terminology_alerts_detected": alert_count,
        "sanitization": sanitization_report,
    }
