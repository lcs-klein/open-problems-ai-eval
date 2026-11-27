Source-safe numerical replay of the mixed-source generation experiment

Use Python 3.10 or later. Unzip this archive and run the commands in this directory.

python optimize.py --input expanded_pool.json --coverage expanded_coverage.json --verify expanded_frontier.json
python optimize.py --input expanded_pool.json --coverage expanded_coverage.json --output expanded_replay.json --sizes 35 36 48 50 --scenarios baseline --time-limit 0
python optimize.py --input bridge_pool.json --coverage bridge_coverage.json --verify bridge_frontier.json
python optimize.py --input bridge_pool.json --coverage bridge_coverage.json --output bridge_replay.json --sizes 35 36 48 50 --scenarios baseline --time-limit 0

Both models have the same 76 candidate versions and constraints. The bridge model
uses the older coverage dictionary. The expanded model adds 17 coverage units.
Compare both selected sets on the same coverage dictionary. The comparison file
includes this rescoring for K=35, 36 and 48.

Candidate, parent and coverage identifiers are opaque aliases. Candidate aliases
preserve the original sort order for tie-breaking, and operation aliases preserve
the structural-change costs. The package contains no question wording, source
records, original IDs, reviewer names or private source paths.

The archived exact solver reproduced all 43 feasible sizes and proved K=50
infeasible in both anonymized models. The K=48 expanded score and upper bound
are 92.76386988317, with exact integer units 50435345 at scale 10873920.

The replay starts with frozen editorial scores and coverage assignments. It
provides a check of the numerical optimization. Independently reproducing the
editorial judgments requires access to the source records and a new review.
