"""Unit tests for the pure-stdlib data, terminology, sanitizer, and replay pipeline."""
from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from sanitizer import SanitizationError, assert_public_safe
from terminology import (
    check_text_terminology,
    load_terminology_rules,
    restore_locked_terminology,
)


class PipelineTests(unittest.TestCase):
    def test_terminology_lock_detects_jose_examples(self) -> None:
        rules = load_terminology_rules(ROOT / "data" / "terminology_lock.json")
        alerts = check_text_terminology(
            "Unclear definitions of abilities and tendencies in AI systems.",
            rules,
        )
        locked_terms = {a["locked_term"] for a in alerts}
        self.assertIn("capabilities", locked_terms)
        self.assertIn("propensities", locked_terms)

    def test_restore_locked_terminology_clears_alerts(self) -> None:
        rules = load_terminology_rules(ROOT / "data" / "terminology_lock.json")
        fixed = restore_locked_terminology(
            "Abilities, ability, tendencies, and tendency should be aligned."
        )
        self.assertEqual(
            fixed,
            "Capabilities, capability, propensities, and propensity should be aligned.",
        )
        self.assertEqual(check_text_terminology(fixed, rules), [])

    def test_sanitizer_blocks_private_leaks(self) -> None:
        with self.assertRaises(SanitizationError):
            assert_public_safe({"note": "Unredacted internal expert feedback: 内部专家意见"})

        with self.assertRaises(SanitizationError):
            assert_public_safe({"path": r"C:\Users\alice\Desktop\secret.json"})

        with self.assertRaises(SanitizationError):
            assert_public_safe({"source": "Direct expert feedback, internal"})

        report = assert_public_safe({"title": "Open Problems in AI Evaluation"})
        self.assertTrue(report["passed"])

    def test_generated_bundles_and_reproduce_zips(self) -> None:
        pub_path = ROOT / "data" / "public" / "public_bundle.json"
        int_path = ROOT / "data" / "internal" / "internal_bundle.json"
        self.assertTrue(pub_path.exists(), "public_bundle.json must exist")

        pub = json.loads(pub_path.read_text(encoding="utf-8"))
        self.assertEqual(pub["schema_version"], 2)
        self.assertEqual(len(pub["categories"]), 7)
        self.assertEqual(len(pub["open_problems"]), 48)
        self.assertEqual(len(pub["specific_challenges"]), 60)

        # Ensure public bundle passes sanitization gate itself
        self.assertTrue(assert_public_safe(pub)["passed"])

        # Verify C.F2a and all public open problems have restored locked terminology (0 alerts)
        cf2a = next(p for p in pub["open_problems"] if p["id"] == "C.F2a")
        self.assertIn("capabilities", cf2a["title"].lower())
        self.assertIn("propensities", cf2a["title"].lower())
        self.assertEqual(len(cf2a["terminology_alerts"]), 0)
        self.assertEqual(
            sum(len(p["terminology_alerts"]) for p in pub["open_problems"]),
            0,
            "All public open problems should have zero remaining terminology alerts",
        )
        self.assertIn("why_changed", cf2a["lineage"])
        self.assertIn("what_changed", cf2a["lineage"])
        self.assertIn("governance", cf2a)
        self.assertIn("provenance", cf2a)

        # Verify public human-authored retain items and numeric frontier
        human_count = sum(
            1 for p in pub["open_problems"] if p["provenance"]["author_type"] == "human"
        )
        self.assertGreater(
            human_count, 0, "Retained manuscript problems should be classified as human authored"
        )
        self.assertGreater(
            len(pub.get("screening_frontier", [])), 30, "Public bundle should expose numeric frontier"
        )

        # Internal bundle assertions run in full local environments where data/internal exists
        if int_path.exists():
            intl = json.loads(int_path.read_text(encoding="utf-8"))
            intl_with_preds = sum(
                1 for p in intl["open_problems"] if p["lineage"].get("predecessors")
            )
            intl_aligned = sum(
                1 for p in intl["open_problems"] if p["paper_section_id"] != "UNALIGNED_PROPOSAL"
            )
            self.assertGreater(
                intl_with_preds, 30, "Internal problems must retain primary lineage predecessors"
            )
            self.assertGreater(
                intl_aligned, 30, "Internal problems must map to manuscript section IDs"
            )
            self.assertEqual(
                sum(len(p["terminology_alerts"]) for p in intl["open_problems"]),
                0,
                "All internal open problems should have zero remaining terminology alerts",
            )
            self.assertEqual(
                sum(len(c["terminology_alerts"]) for c in intl.get("candidates", [])),
                0,
                "All internal candidates should have zero remaining terminology alerts",
            )

        # Verify reproduce zips exist
        self.assertTrue((ROOT / "reproduce" / "generation_upstream_replay.zip").exists())
        self.assertTrue((ROOT / "reproduce" / "generation_method_replay.zip").exists())


if __name__ == "__main__":
    unittest.main()
