"""Reproduce editorial ranking from the frozen, public input tables.

Usage: python reproduce_selection.py
Only Python's standard library is required. No network or external services.
Semantic grouping, source checks and criterion judgments are supplied inputs.
"""
import csv,json,collections
from pathlib import Path
BASE=Path(__file__).resolve().parent
def load(name):return json.loads((BASE/name).read_text(encoding='utf-8'))
def gate(r):
    v=[r[k] for k in 'giutd']
    if any(type(x)!=int or not 0<=x<=3 for x in v):return 'HOLD'
    if min(v[:4])==0:return 'EXCLUDE AS WRITTEN'
    if v[4]<2:return 'MERGE / CONSOLIDATE'
    if min(v)>=2:return 'KEEP (PROVISIONAL)'
    if min(r[k] for k in 'iut')<2:return 'DEVELOP'
    return 'REVISE'
def eligible(r):return gate(r)=='KEEP (PROVISIONAL)' and r['scope'] in ('direct','indirect') and r['evidence_eligible'] is True
def key(r):return(-sum(r[k] for k in 'giutd'),-r['i'],-r['t'],-r['g'],-r['d'],r['stable_order'])
f=load('Formulation_inputs.json');s=load('Source_score_inputs.json');expected=load('Expected_results.json')
families=collections.defaultdict(list)
for r in f:
    assert gate(r)==r['rubric_decision'],r['formulation_id']
    assert eligible(r)==r['eligible'],r['formulation_id']
    families[r['family_id']].append(r)
winners=[]
for fid,rows in families.items():
    passing=sorted([r for r in rows if eligible(r) and r['manuscript_ready']],key=key)
    if passing:winners.append(passing[0])
winners.sort(key=key)
assert [r['formulation_id'] for r in winners]==expected['active_ids_in_rank_order'],'Family selection or rank mismatch'
source_order=sorted([r for r in s if eligible(r)],key=key)
assert [r['qid'] for r in source_order]==expected['source_ids_in_rank_order'],'Source rank mismatch'
category_counts=collections.Counter();rows=[]
for rank,r in enumerate(winners,1):
    category_counts[r['primary_category']]+=1
    rows.append([rank,category_counts[r['primary_category']],r['formulation_id'],r['family_id'],r['primary_category'],sum(r[k] for k in 'giutd'),*[r[k]for k in'giutd'],r['question_en']])
out=BASE/'reproduced';out.mkdir(exist_ok=True)
with(out/'Manuscript_rankings.csv').open('w',encoding='utf-8-sig',newline='')as h:
    w=csv.writer(h);w.writerow(['Overall rank','Category rank','Formulation ID','Family ID','Category','Total','G','I','U','T','D','Question']);w.writerows(rows)
with(out/'Source_rankings.csv').open('w',encoding='utf-8-sig',newline='')as h:
    w=csv.writer(h);w.writerow(['Rank','Question ID','Total','G','I','U','T','D','Question']);w.writerows([[i,r['qid'],sum(r[k]for k in'giutd'),*[r[k]for k in'giutd'],r['question_en']]for i,r in enumerate(source_order,1)])
print(json.dumps(dict(status='PASS',source_eligible=len(source_order),manuscript_formulations=len(f),active_families=len(winners),by_category=dict(category_counts),output=str(out)),ensure_ascii=False,indent=2))
