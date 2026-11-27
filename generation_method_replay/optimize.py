"""Optimize and independently verify a fixed-size general-problem portfolio.

The primary objective uses integer coefficients, so the branch-and-bound
backend can certify a solution without floating-point comparisons.
"""

import argparse
import hashlib
import heapq
import itertools
import json
import math
import time
from collections import Counter, defaultdict
from pathlib import Path


CATEGORIES = {
    "F": "Foundations", "T": "Techniques", "V": "Validity",
    "D": "Deployment", "L": "Lifecycle", "I": "Institutions", "P": "Purpose",
}
ALL_CATEGORIES = (1 << len(CATEGORIES)) - 1
SCENARIOS = {
    "baseline": (1, 1, 1, 1, 1),
    "stronger_relevance": (2, 1, 1, 1, 1),
    "stronger_coverage": (1, 1, 1, 2, 2),
}
BLOCKS = {"needs": "impact", "research": "value"}
CHURN = {
    "original": 0, "retain": 0, "keep": 0, "unchanged": 0,
    "rewrite": 1, "reword": 1, "reframe": 1, "revise": 1, "light_edit": 1,
    "expert-informed rewrite": 1,
    "split": 2, "partial split": 2, "merge": 2, "new": 2, "add": 2,
    "addition": 2, "gap": 2, "expert gap": 2,
}


def read_json(path):
    return json.loads(Path(path).read_text(encoding="utf-8-sig"))


def indices(mask):
    while mask:
        bit = mask & -mask
        yield bit.bit_length() - 1
        mask ^= bit


def eligibility(candidate):
    relevance, openness, classification, impact, _ = candidate["scores"]
    failures = []
    if relevance < 3:
        failures.append("q1 below 3")
    exception = candidate.get("exception")
    if openness < 2 and not (
        openness == 1 and impact >= 3 and isinstance(exception, str) and exception.strip()
    ):
        failures.append("q2 below 2 without documented q2=1 exception and q4>=3")
    if classification < 2:
        failures.append("q3 below 2")
    return failures


def category_code(value):
    code = str(value).strip().casefold()
    for short, long in CATEGORIES.items():
        if code in {short.casefold(), long.casefold()}:
            return short
    raise ValueError(f"Unknown primary category: {value!r}")


def positive_weight(value, label):
    if type(value) is not int or not 1 <= value <= 4:
        raise ValueError(f"{label} must have an integer weight in 1..4, got {value!r}")
    return value


def coverage_dictionary(candidates, external):
    domains = {}
    adjustments = []
    for block, weight_key in BLOCKS.items():
        if external is None:
            dictionary = {}
        else:
            if block not in external or not isinstance(external[block], dict):
                raise ValueError(f"Coverage dictionary needs an object for {block}")
            dictionary = {}
            for key, item in external[block].items():
                item = {weight_key: item} if isinstance(item, int) else dict(item)
                item[weight_key] = positive_weight(
                    item.get(weight_key, item.get("weight")), f"{block}.{key}"
                )
                dictionary[key] = item
        for candidate in candidates:
            seen = set()
            for tag in candidate.get(block, []):
                key = tag["key"]
                if not isinstance(key, str) or not key.strip() or key in seen:
                    raise ValueError(f"{candidate['id']} has invalid/duplicate {block} key {key!r}")
                seen.add(key)
                coverage = tag["coverage"]
                if isinstance(coverage, bool) or coverage not in (0.5, 1):
                    raise ValueError(f"{candidate['id']} {block}.{key} needs coverage 0.5 or 1")
                if external is not None and key not in dictionary:
                    raise ValueError(f"{candidate['id']} uses unknown dictionary key {block}.{key}")
                if external is None and weight_key not in tag:
                    raise ValueError(f"{candidate['id']} is missing {block}.{key}.{weight_key}")
                if weight_key in tag:
                    weight = positive_weight(tag[weight_key], f"{candidate['id']} {block}.{key}")
                    if key not in dictionary:
                        dictionary[key] = {field: value for field, value in tag.items()
                                           if field not in {"coverage", "key"}}
                    elif dictionary[key][weight_key] != weight:
                        if external is None:
                            raise ValueError(f"Conflicting weights on {block}.{key}: "
                                             f"{dictionary[key][weight_key]} vs {weight} in {candidate['id']}")
                        adjustments.append({
                            "candidate": candidate["id"], "block": block, "key": key,
                            "candidate_weight": weight, "canonical_weight": dictionary[key][weight_key],
                        })
        if not dictionary:
            raise ValueError(f"Coverage dictionary for {block} is empty")
        domains[block] = dict(sorted(dictionary.items()))
    return domains, adjustments


class Portfolio:
    def __init__(self, raw_candidates, external):
        if not isinstance(raw_candidates, list) or not raw_candidates:
            raise ValueError("Candidate input must be a nonempty JSON array")
        candidates = sorted(raw_candidates, key=lambda c: c["id"])
        all_ids = [c["id"] for c in candidates]
        if len(set(all_ids)) != len(all_ids) or not all(
            isinstance(value, str) and value.strip() for value in all_ids
        ):
            raise ValueError("Candidate IDs must be unique nonempty strings")
        self.excluded = {}
        for candidate in candidates:
            candidate["category"] = category_code(candidate["category"])
            scores = candidate["scores"]
            if len(scores) != 5 or any(type(score) is not int or not 0 <= score <= 4
                                       for score in scores):
                raise ValueError(f"{candidate['id']} requires five integer scores in 0..4")
            for field in ("parents", "conflicts"):
                values = candidate.get(field, [])
                if not isinstance(values, list) or any(
                    not isinstance(value, str) or not value.strip() for value in values
                ):
                    raise ValueError(f"{candidate['id']} {field} requires a list of nonempty IDs")
            unknown = set(candidate.get("conflicts", [])) - set(all_ids)
            if unknown or candidate["id"] in candidate.get("conflicts", []):
                raise ValueError(f"{candidate['id']} lists invalid conflict IDs: {sorted(unknown)}")
            failures = eligibility(candidate)
            if failures:
                self.excluded[candidate["id"]] = failures
        self.domains, self.weight_adjustments = coverage_dictionary(candidates, external)
        self.candidates = [c for c in candidates if c["id"] not in self.excluded]
        self.ids = [c["id"] for c in self.candidates]
        self.lookup = {candidate_id: i for i, candidate_id in enumerate(self.ids)}
        self.category_masks = [0] * len(CATEGORIES)
        self.categories = []
        self.parent_masks = defaultdict(int)
        for i, candidate in enumerate(self.candidates):
            category_idx = list(CATEGORIES).index(candidate["category"])
            self.categories.append(category_idx)
            self.category_masks[category_idx] |= 1 << i
            for parent in candidate.get("parents", []):
                self.parent_masks[parent] |= 1 << i
        self.incompatible = [1 << i for i in range(len(self.ids))]
        self.groups = []
        for i, candidate in enumerate(self.candidates):
            for parent in candidate.get("parents", []):
                self.incompatible[i] |= self.parent_masks[parent]
            for other in candidate.get("conflicts", []):
                if other in self.lookup:
                    j = self.lookup[other]
                    self.incompatible[i] |= 1 << j
                    self.incompatible[j] |= 1 << i
            parents = candidate.get("parents", [])
            if parents:
                parent = min(parents, key=lambda p: (-self.parent_masks[p].bit_count(), p))
                self.groups.append(("parent", parent))
            else:
                self.groups.append(("candidate", i))
        self.weight_totals = {
            block: sum(item[weight_key] for item in self.domains[block].values())
            for block, weight_key in BLOCKS.items()
        }
        self.coverage_masks = {}
        for block, weight_key in BLOCKS.items():
            offset = 0
            patterns = {}
            for key, entry in self.domains[block].items():
                weight = entry[weight_key]
                patterns[key] = {
                    0.5: ((1 << weight) - 1) << offset,
                    1: ((1 << (2 * weight)) - 1) << offset,
                }
                offset += 2 * weight
            self.coverage_masks[block] = [
                sum(patterns[tag["key"]][tag["coverage"]] for tag in c.get(block, []))
                for c in self.candidates
            ]
        self.q1 = [candidate["scores"][0] for candidate in self.candidates]
        self.churn = [CHURN.get(str(candidate.get("operation", "")).casefold(), 1)
                      for candidate in self.candidates]

    def coverage(self, chosen, block):
        results = {}
        for i in chosen:
            for tag in self.candidates[i].get(block, []):
                results[tag["key"]] = max(results.get(tag["key"], 0), tag["coverage"])
        return dict(sorted(results.items()))

    def verify_selection(self, chosen, size):
        if len(chosen) != size or len(set(chosen)) != size:
            raise ValueError(f"Expected {size} distinct selected candidates")
        if {self.categories[i] for i in chosen} != set(range(len(CATEGORIES))):
            raise ValueError("Selected candidates do not cover all seven primary categories")
        mask = 0
        for i in chosen:
            if self.incompatible[i] & mask:
                raise ValueError(f"Incompatible versions in selection: {self.ids[i]}")
            mask |= 1 << i


class Objective:
    def __init__(self, portfolio, size, weights):
        self.portfolio = portfolio
        self.size = size
        self.weights = weights
        denominators = [4 * size] * 3 + [2 * portfolio.weight_totals[k] for k in BLOCKS]
        self.scale = math.lcm(*denominators)
        multipliers = [weight * (self.scale // denominator)
                       for weight, denominator in zip(weights, denominators)]
        self.quality = [sum(score * multiplier for score, multiplier
                            in zip(candidate["scores"][:3], multipliers[:3]))
                        for candidate in portfolio.candidates]
        self.need_coef, self.research_coef = multipliers[3:]

    def to_score(self, units):
        return 100 * units / (self.scale * sum(self.weights))

    def evaluate(self, chosen):
        p = self.portfolio
        need = research = 0
        for i in chosen:
            need |= p.coverage_masks["needs"][i]
            research |= p.coverage_masks["research"][i]
        units = (sum(self.quality[i] for i in chosen)
                 + need.bit_count() * self.need_coef
                 + research.bit_count() * self.research_coef)
        return units

    def components(self, chosen):
        p = self.portfolio
        scores = [p.candidates[i]["scores"] for i in chosen]
        components = {f"avg_q{j + 1}": sum(row[j] for row in scores) / len(scores)
                      for j in range(5)}
        for block, weight_key in BLOCKS.items():
            coverage = p.coverage(chosen, block)
            components[block + "_weighted_union"] = sum(
                amount * p.domains[block][key][weight_key] for key, amount in coverage.items()
            ) / p.weight_totals[block]
        return components

    def signature(self, chosen, units=None):
        p = self.portfolio
        return (
            self.evaluate(chosen) if units is None else units,
            sum(p.q1[i] for i in chosen),
            -sum(p.churn[i] for i in chosen),
        )


def top_sum(values, count):
    return sum(heapq.nlargest(count, values))


def replaceable_candidates(objective):
    """A conflicting alternative with a safer footprint can replace a dominated variant."""
    p = objective.portfolio
    removed = 0
    rank = [(objective.quality[i], p.q1[i], -p.churn[i], -i) for i in range(len(p.ids))]
    needs, research = (p.coverage_masks[k] for k in BLOCKS)
    for i in range(len(p.ids)):
        for j in indices(p.incompatible[i] & p.category_masks[p.categories[i]] & ~(1 << i)):
            if (rank[j] > rank[i] and not (needs[i] & ~needs[j])
                    and not (research[i] & ~research[j])
                    and not (p.incompatible[j] & ~p.incompatible[i])):
                removed |= 1 << i
                break
    return removed


def solve_branch_bound(objective, time_limit, start=None):
    p = objective.portfolio
    size = objective.size
    q, q1, churn = objective.quality, p.q1, p.churn
    needs, research = (p.coverage_masks[k] for k in BLOCKS)
    nc, rc = objective.need_coef, objective.research_coef
    dominated = replaceable_candidates(objective)
    available = ((1 << len(p.ids)) - 1) & ~dominated
    deadline = time.monotonic() + time_limit if time_limit else math.inf
    winner, best = None, None
    if start is not None:
        p.verify_selection(start, size)
        winner = tuple(sorted(start))
        best = objective.signature(winner)

    def visit_leaf(selected, units):
        nonlocal winner, best
        selection = tuple(indices(selected))
        signature = objective.signature(selection, units)
        if best is None or signature > best or (signature == best and selection < winner):
            winner, best = selection, signature

    def node(available, selected, count, missing, seen_n, seen_r, units, r1, churn_cost):
        left = size - count
        if left == 0:
            if not missing:
                visit_leaf(selected, units)
            return None
        if (available.bit_count() < left or missing.bit_count() > left
                or any(not (p.category_masks[c] & available) for c in indices(missing))):
            return None
        if left == missing.bit_count():
            available &= sum(p.category_masks[c] for c in indices(missing))
        remaining = tuple(indices(available))
        if len(remaining) < left:
            return None

        # Admissible bounds relax different constraints on the remaining slots.
        gains = {}
        group_max = {}
        category_max = {}
        cover_n = cover_r = duplicate_n = duplicate_r = 0
        for i in remaining:
            new_n, new_r = needs[i] & ~seen_n, research[i] & ~seen_r
            duplicate_n |= cover_n & new_n
            duplicate_r |= cover_r & new_r
            cover_n |= new_n
            cover_r |= new_r
            gain = q[i] + new_n.bit_count() * nc + new_r.bit_count() * rc
            gains[i] = gain
            group = p.groups[i]
            group_max[group] = max(gain, group_max.get(group, 0))
            category = p.categories[i]
            if category not in category_max or gains[category_max[category]] < gain:
                category_max[category] = i
        if len(group_max) < left:
            return None
        mandatory = {category_max[c] for c in indices(missing)}
        coverage_bound = cover_n.bit_count() * nc + cover_r.bit_count() * rc
        primary_bound = units + min(
            top_sum(group_max.values(), left),
            coverage_bound + top_sum((q[i] for i in remaining), left),
            sum(gains[i] for i in mandatory) + top_sum(
                (gain for i, gain in gains.items() if i not in mandatory),
                left - len(mandatory),
            ),
        )
        if best is not None and primary_bound < best[0]:
            return None
        if duplicate_n or duplicate_r:
            # Shared coverage can contribute at most once, whereas each
            # uniquely supported tier must use a slot for its only supporter.
            unique_n, unique_r = cover_n ^ duplicate_n, cover_r ^ duplicate_r
            unique_max = {}
            for i in remaining:
                singleton_gain = (q[i] + (needs[i] & unique_n).bit_count() * nc
                                  + (research[i] & unique_r).bit_count() * rc)
                group = p.groups[i]
                unique_max[group] = max(singleton_gain, unique_max.get(group, 0))
            shared_coverage = duplicate_n.bit_count() * nc + duplicate_r.bit_count() * rc
            primary_bound = min(
                primary_bound, units + shared_coverage + top_sum(unique_max.values(), left)
            )
        bound = (primary_bound, r1 + top_sum((q1[i] for i in remaining), left),
                 -churn_cost + top_sum((-churn[i] for i in remaining), left))
        if best is not None:
            if bound < best:
                return None
            if bound == best:
                earliest = tuple(sorted((*indices(selected), *remaining[:left])))
                if earliest >= winner:
                    return None
        branch = max(remaining, key=lambda i: (
            gains[i], bool(missing & (1 << p.categories[i])),
            (p.incompatible[i] & available).bit_count(), q1[i], -churn[i], -i,
        ))
        return (bound, branch, available, selected, count, missing,
                seen_n, seen_r, units, r1, churn_cost, gains[branch])

    root = node(available, 0, 0, ALL_CATEGORIES, 0, 0, 0, 0, 0)
    stack = [root] if root is not None else []
    nodes = 0
    while stack and time.monotonic() < deadline:
        (bound, i, available, selected, count, missing, seen_n, seen_r,
         units, r1, churn_cost, gain) = stack.pop()
        if best is not None and bound < best:
            continue
        nodes += 1
        skip = node(available & ~(1 << i), selected, count, missing,
                    seen_n, seen_r, units, r1, churn_cost)
        if skip is not None:
            stack.append(skip)
        take = node(available & ~p.incompatible[i], selected | (1 << i), count + 1,
                    missing & ~(1 << p.categories[i]), seen_n | needs[i], seen_r | research[i],
                    units + gain, r1 + q1[i], churn_cost + churn[i])
        if take is not None:
            stack.append(take)
    if winner is not None:
        p.verify_selection(winner, size)
        if objective.evaluate(winner) != best[0]:
            raise AssertionError("Incremental objective does not match exact recomputation")
    pending = max((entry[0] for entry in stack), default=None)
    upper = max(filter(lambda v: v is not None, [best, pending]), default=None)
    exact = pending is None or (best is not None and pending[0] <= best[0])
    if winner is None:
        status = "infeasible" if pending is None else "time_limit_no_incumbent"
    else:
        status = "optimal" if exact else "time_limit_with_incumbent"
    return winner, {
        "backend": "integer_branch_and_bound",
        "status": status, "nodes": nodes,
        "dominated_candidate_ids": [p.ids[i] for i in indices(dominated)],
        "upper_units": upper[0] if upper is not None else None,
        "tie_break_certified": (winner is not None and
                                (pending is None or pending < best)),
    }


def describe_result(objective, selection, solve_info, elapsed):
    p = objective.portfolio
    data = {
        "size": objective.size, "block_weights": list(objective.weights),
        "elapsed_seconds": round(elapsed, 3), "score_scale": objective.scale,
        **solve_info,
    }
    upper = data["upper_units"]
    data["upper_bound"] = None if upper is None else objective.to_score(upper)
    if selection is None:
        data["selected"] = []
        return data
    score = objective.evaluate(selection)
    data.update(
        selected=[p.ids[i] for i in selection],
        score_units=score, score=objective.to_score(score),
        optimality_gap_points=objective.to_score(upper - score),
        category_counts=dict(sorted(Counter(p.candidates[i]["category"] for i in selection).items())),
        components=objective.components(selection),
        needs_coverage=p.coverage(selection, "needs"),
        research_coverage=p.coverage(selection, "research"),
        provisional_exceptions=[p.ids[i] for i in selection if p.candidates[i]["scores"][1] == 1],
    )
    return data


def digest(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def validate_results(results, portfolio):
    """Recompute feasibility and all score units without the optimizer."""
    checked = 0
    for result in results["runs"]:
        if not result["selected"]:
            continue
        chosen = [portfolio.lookup[candidate_id] for candidate_id in result["selected"]]
        portfolio.verify_selection(chosen, result["size"])
        scenario = result["scenario"]
        if scenario in SCENARIOS and tuple(result["block_weights"]) != SCENARIOS[scenario]:
            raise ValueError(f"Incorrect block weights for {scenario}")
        objective = Objective(portfolio, result["size"], result["block_weights"])
        expected = objective.evaluate(chosen)
        components = objective.components(chosen)
        independent = (
            sum(components[f"avg_q{i + 1}"] / 4 * objective.weights[i] for i in range(3))
            + components["needs_weighted_union"] * objective.weights[3]
            + components["research_weighted_union"] * objective.weights[4]
        ) * 100 / sum(objective.weights)
        if (result["score_scale"] != objective.scale or result["score_units"] != expected
                or not math.isclose(result["score"], independent, abs_tol=1e-10)
                or result["upper_units"] < expected or result["components"] != components):
            raise ValueError(f"Incorrect score or bound for {result['scenario']} K={result['size']}")
        for block in BLOCKS:
            if result[block + "_coverage"] != portfolio.coverage(chosen, block):
                raise ValueError(f"Incorrect {block} coverage for {scenario} K={result['size']}")
        if result["status"] == "optimal" and result["upper_units"] != expected:
            raise ValueError("An optimal run must close the primary optimality bound")
        checked += 1
    return checked


def comparisons(runs):
    baseline = [row for row in runs if row["scenario"] == "baseline" and row["selected"]]
    results = []
    for earlier, later in itertools.pairwise(baseline):
        added_needs = {key: amount for key, amount in later["needs_coverage"].items()
                       if amount > earlier["needs_coverage"].get(key, 0)}
        lost_needs = {key: amount for key, amount in earlier["needs_coverage"].items()
                      if amount > later["needs_coverage"].get(key, 0)}
        added_research = {key: amount for key, amount in later["research_coverage"].items()
                          if amount > earlier["research_coverage"].get(key, 0)}
        lost_research = {key: amount for key, amount in earlier["research_coverage"].items()
                         if amount > later["research_coverage"].get(key, 0)}
        results.append({
            "from_size": earlier["size"], "to_size": later["size"],
            "score_delta": later["score"] - earlier["score"],
            "added_ids": sorted(set(later["selected"]) - set(earlier["selected"])),
            "removed_ids": sorted(set(earlier["selected"]) - set(later["selected"])),
            "needs_coverage_increased": added_needs, "needs_coverage_decreased": lost_needs,
            "research_coverage_increased": added_research,
            "research_coverage_decreased": lost_research,
        })
    return results


def sensitivity_comparisons(runs, portfolio):
    baseline = {run["size"]: run for run in runs
                if run["scenario"] == "baseline" and run["selected"]}
    comparisons = []
    for run in runs:
        if run["scenario"] == "baseline" or not run["selected"] or run["size"] not in baseline:
            continue
        reference = baseline[run["size"]]
        reference_ids, chosen_ids = set(reference["selected"]), set(run["selected"])
        baseline_objective = Objective(portfolio, run["size"], SCENARIOS["baseline"])
        selection = [portfolio.lookup[candidate_id] for candidate_id in chosen_ids]
        baseline_score = baseline_objective.to_score(baseline_objective.evaluate(selection))
        comparisons.append({
            "size": run["size"], "scenario": run["scenario"],
            "jaccard_with_baseline": len(reference_ids & chosen_ids) / len(reference_ids | chosen_ids),
            "added_ids": sorted(chosen_ids - reference_ids),
            "removed_ids": sorted(reference_ids - chosen_ids),
            "score_under_baseline_weights": baseline_score,
            "baseline_objective_difference": baseline_score - reference["score"],
        })
    return comparisons


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", required=True)
    parser.add_argument("--coverage")
    parser.add_argument("--output")
    parser.add_argument("--verify")
    parser.add_argument("--sizes", type=int, nargs="+", default=[24, 30, 36])
    parser.add_argument("--time-limit", type=float, default=25, help="Seconds per run; 0 means unlimited")
    parser.add_argument("--scenarios", choices=SCENARIOS, nargs="+", default=list(SCENARIOS))
    args = parser.parse_args()
    if any(size <= 0 for size in args.sizes) or not math.isfinite(args.time_limit) or args.time_limit < 0:
        parser.error("Sizes must be positive and time limit nonnegative")
    if not args.verify and not args.output:
        parser.error("--output is required when solving")
    external = read_json(args.coverage) if args.coverage else None
    portfolio = Portfolio(read_json(args.input), external)
    hashes = {"candidates": digest(args.input), "coverage": digest(args.coverage) if args.coverage else None}
    if args.verify:
        results = read_json(args.verify)
        if results["input_sha256"] != hashes:
            parser.error("Verification inputs do not match the result manifest")
        print(f"Verified selection feasibility and scores for {validate_results(results, portfolio)} portfolios")
        return
    runs = []
    incumbents = {}
    for scenario in args.scenarios:
        for size in sorted(set(args.sizes)):
            objective = Objective(portfolio, size, SCENARIOS[scenario])
            started = time.monotonic()
            selection, info = solve_branch_bound(objective, args.time_limit, incumbents.get(size))
            if selection is not None:
                incumbents.setdefault(size, selection)
            result = describe_result(objective, selection, info, time.monotonic() - started)
            result["scenario"] = scenario
            runs.append(result)
            print(f"{scenario} K={size}: {info['status']}; score={result.get('score')}; "
                  f"upper={result.get('upper_bound')}", flush=True)
    results = {
        "input_sha256": hashes, "eligible": len(portfolio.candidates),
        "ineligible": portfolio.excluded, "coverage_dictionary": portfolio.domains,
        "dictionary_weight_adjustments": portfolio.weight_adjustments,
        "weight_totals": portfolio.weight_totals, "runs": runs,
        "size_comparisons": comparisons(runs),
        "sensitivity_comparisons": sensitivity_comparisons(runs, portfolio),
        "churn_cost_by_operation": CHURN, "unlisted_operation_churn_cost": 1,
    }
    results["verified_selected_runs"] = validate_results(results, portfolio)
    Path(args.output).write_text(json.dumps(results, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
