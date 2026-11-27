import collections
import json
from pathlib import Path

BASE = Path(__file__).resolve().parent

def read(name):
    return json.loads((BASE / name).read_text(encoding='utf-8'))

def main():
    forms = read('Formulation_inputs.json')
    rank = read('Expected_results.json')
    data = read('Handoff_inputs.json')
    parent = {row['formulation_id']: row['formulation_id'] for row in forms}

    def find(key):
        while parent[key] != key:
            key = parent[key]
        return key

    for a, b in data['familyRelations']:
        parent[find(a)] = find(b)
    actual, frozen = collections.defaultdict(set), collections.defaultdict(set)
    for row in forms:
        key = row['formulation_id']
        actual[find(key)].add(key)
        frozen[row['family_id']].add(key)
    assert {frozenset(x) for x in actual.values()} == {frozenset(x) for x in frozen.values()}
    assert {row['id'] for row in data['core']} == set(rank['active_ids_in_rank_order'])

    result = []
    for problem in data['generalProblems']:
        pid, seeds = problem['id'], problem['seeds']
        choices = [row for row in data['core'] if row['primary'] == pid and row['status'] == 'direct']
        choices.sort(key=lambda row: (seeds.index(row['id']) if row['id'] in seeds else 99,
                                      not row['table2'], -row['total'], row['id']))
        selected, sources = [], set()
        for row in choices:
            if not selected or set(row['sources']) - sources:
                selected.append(row)
                sources.update(row['sources'])
            if len(selected) == 2:
                break
        for row in choices:
            if len(selected) == 2:
                break
            if row not in selected:
                selected.append(row)
        rows = [[f'{pid}.Q{i}', row['id']] for i, row in enumerate(selected, 1)]
        rows.extend([s['id'], None] for s in data['editorialSyntheses'] if s['problem'] == pid)
        result.extend(sorted(rows))
    assert result == data['expected'], 'Example selection or order differs'
    print(json.dumps({
        'status': 'PASS', 'targetFamilies': len(actual), 'activeHandoff': len(data['core']),
        'generalProblems': len(data['generalProblems']), 'sourceGroundedExamples': sum(id is not None for _, id in result),
        'editorialSyntheses': sum(id is None for _, id in result), 'totalExamples': len(result),
    }))

if __name__ == '__main__':
    main()
