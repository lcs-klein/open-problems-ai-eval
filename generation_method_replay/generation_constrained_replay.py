"""Verify exact editorial-constraint tests on the source-safe expanded model.

Place this file next to optimize.py and the expanded replay JSON files.
Run: python generation_constrained_replay.py
"""

import argparse
import hashlib
import json
import types
from pathlib import Path


HASHES = {
    "optimize.py": "7d00b2c422611c0c83a236fe68645831d75beea47a6dad71b922e683e4c79d9c",
    "expanded_pool.json": "eb110b4bf02e083dc9a5fdeba7ab35ebad9003fb085483e8b21c45827ee6a230",
    "expanded_coverage.json": "95e8b7378660e0ef7d2977bf9f5a001a5c0f1d473c11f4aed5e7aac07a70431a",
    "expanded_frontier.json": "846891eda64c893740933de347c129481d12ce5f17484e0dff1012f6a3f59494",
}
SCENARIOS = {
    "required-validity": {
        "size": 35, "required": "V023", "added": ("V023",), "removed": ("V034",),
        "units": 7158117, "scale": 1585780,
    },
    "formal-overlap": {
        "size": 48, "exclusive": ("V025", "V026"), "added": ("V075",), "removed": ("V025",),
        "units": 50378710, "scale": 10873920,
    },
    "method-overlap": {
        "size": 48, "exclusive": ("V027", "V033"), "added": ("V003", "V073", "V076"),
        "removed": ("V004", "V005", "V027"), "units": 50378710, "scale": 10873920,
    },
}
START = "    root = node(available, 0, 0, ALL_CATEGORIES, 0, 0, 0, 0, 0)"
REQUIRED_START = """    i = p.lookup[required_alias]
    if not (available & (1 << i)):
        raise ValueError("The required version is unavailable")
    root = node(
        available & ~p.incompatible[i], 1 << i, 1,
        ALL_CATEGORIES & ~(1 << p.categories[i]), needs[i], research[i],
        objective.evaluate((i,)), q1[i], churn[i],
    )"""


def check(condition, message):
    if not condition:
        raise ValueError(message)


def read_inputs(directory):
    files = {name: (directory / name).read_bytes() for name in HASHES}
    for name, content in files.items():
        check(hashlib.sha256(content).hexdigest() == HASHES[name], f"Frozen input hash differs: {name}")
    return files


def load_solver(content, required):
    source = content.decode("utf-8")
    if required:
        check(source.count(START) == 1, "Pinned solver root initialization differs")
        source = source.replace(START, REQUIRED_START)
    module = types.ModuleType("generation_constrained_optimizer")
    module.required_alias = required
    exec(compile(source, "optimize.py", "exec"), module.__dict__)
    return module


def run(name, files, saved):
    scenario = SCENARIOS[name]
    required = scenario.get("required")
    exclusive = scenario.get("exclusive")
    opt = load_solver(files["optimize.py"], required)
    pool = json.loads(files["expanded_pool.json"])
    if exclusive:
        a, b = exclusive
        next(row for row in pool if row["id"] == a)["conflicts"].append(b)
    model = opt.Portfolio(pool, json.loads(files["expanded_coverage.json"]))
    size = scenario["size"]
    objective = opt.Objective(model, size, opt.SCENARIOS["baseline"])
    chosen, proof = opt.solve_branch_bound(objective, 0)
    row = opt.describe_result(objective, chosen, proof, 0)
    expected = sorted(set(saved[size]["selected"]) - set(scenario["removed"]) | set(scenario["added"]))
    check(row["status"] == "optimal" and row["tie_break_certified"], f"Exact proof failed: {name}")
    check(row["selected"] == expected, f"Ordered aliases differ: {name}")
    check(row["score_units"] == row["upper_units"] == scenario["units"]
          and row["score_scale"] == scenario["scale"], f"Score or bound differs: {name}")
    check(not required or required in row["selected"], f"Required version is absent: {name}")
    check(not exclusive or not set(exclusive).issubset(row["selected"]), f"Conflict is violated: {name}")
    return {
        "scenario": name, "status": "PASS", "size": size,
        "constraint": {"required": required} if required else {"mutuallyExclusive": list(exclusive)},
        "score": row["score"], "upper_bound": row["upper_bound"], "score_units": row["score_units"],
        "upper_units": row["upper_units"], "score_scale": row["score_scale"], "selected": row["selected"],
    }


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--scenario", choices=("all", *SCENARIOS), default="all")
    parser.add_argument("--directory", type=Path, default=Path(__file__).resolve().parent)
    args = parser.parse_args()
    files = read_inputs(args.directory)
    saved = {row["size"]: row for row in json.loads(files["expanded_frontier.json"])["runs"]}
    scenarios = SCENARIOS if args.scenario == "all" else (args.scenario,)
    print(json.dumps([run(name, files, saved) for name in scenarios], indent=2))


if __name__ == "__main__":
    main()
