Source-safe upstream replay for AI evaluation question ranking

Use Python 3.10 or later. Extract this archive into a local folder and run:

    python reproduce_selection.py
    python reproduce_handoff.py

The first command reproduces the historical source ranking and the choice of
one representative per eligible manuscript formulation family. Expected result:
801 eligible source records, 438 formulations and 327 active representatives.
It writes the ranked CSVs in reproduced/.

The second command checks that the recorded interchangeable relations produce
the 351 frozen target families and that all 327 active representatives match
the input to the next stage. It reproduces the ordered selection of 57
source-grounded examples from the recorded topic map and seed order. It also
checks the position of three supplied editorial examples, for 60 examples
under 30 general-problem headings.

Source, formulation, family and proposal identifiers are opaque aliases.
The original question text and source locations are absent. Blank Question
columns are intentional. Stable-order integers were replaced by relative ranks
to retain all historical ties. Source aliases preserve equivalence for the
illustrative-question diversity check.

The replay starts after extraction, evidence checks, scoring, formulation,
semantic decisions and topic construction. It checks the consequences of
those frozen judgments. It does not validate current openness, construct the
30 general problems or author the later 67 candidate versions.
