#!/usr/bin/env python3
"""Recalculate an Aminodata v1 snapshot with Python 3 (standard library only).
Usage: python3 reproduce.py aminodata-diary.json > recalculated.json
No network requests. The JSON contains personal diary entries.
"""
import json
import math
import sys


def calculate(day, ref):
    totals = {}
    for entry in day['entries']:
        qty = entry['portion']['quantity']
        if qty <= 0:
            continue
        for n in entry['inputs']:
            t = totals.setdefault(n['key'], dict(unit=n['unit'], value=None, known=0, unknown=0, trace=0, derived=0))
            if n['per100'] is not None:
                t['value'] = (t['value'] or 0) + n['per100'] * qty / 100
                t['known'] += 1
            elif not n['trace']:
                t['unknown'] += 1
            t['trace'] += int(n['trace'])
            t['derived'] += int(n['status'] == 'derived_partial')
    profile_protein = sum(next((n['per100'] or 0 for n in e['inputs'] if n['key'] == 'protein'), 0) * e['portion']['quantity'] / 100
                          for e in day['entries'] if e['aminoProfileAvailable'] and e['portion']['quantity'] > 0)
    aa = {}
    for key, components in ref['aminoGroups'].items():
        ts = [totals.get('aa:' + k, {}) for k in components]
        mg = sum((t.get('value') or 0) * 1000 for t in ts) if any(t.get('value') is not None for t in ts) else None
        target = ref['aminoMgPerKg'][key] * day['weightKg'] * (day['proteinGoalG'] / (day['weightKg'] * ref['proteinBaselineGPerKg']))
        aa[key] = dict(mg=mg, targetMg=target, percent=mg / target * 100 if mg is not None else None,
                       partial=any(t.get('unknown') or t.get('trace') for t in ts),
                       compositionMgPerG=mg / profile_protein if profile_protein > 0 else None,
                       patternMgPerG=ref['aminoPatternMgPerG'][key])
    omega = [totals.get(k, {}) for k in ['epa', 'dha']]
    epa_dha = dict(valueMg=sum((t.get('value') or 0) * 1000 for t in omega) if any(t.get('value') is not None for t in omega) else None,
                   targetMg=day['epaDhaGoalMg'], partial=any(not t or t['unknown'] or t['trace'] for t in omega))
    return dict(totals=totals, amino=aa, epaDha=epa_dha)


def verify(actual, expected, path='results'):
    for key, value in actual.items():
        other = expected[key]
        if isinstance(value, dict):
            verify(value, other, path + '.' + key)
        elif isinstance(value, (float, int)) and not isinstance(value, bool):
            if other is None or not math.isclose(value, other, rel_tol=1e-10, abs_tol=1e-10):
                raise ValueError('Result mismatch at ' + path + '.' + key)
        elif value != other:
            raise ValueError('Result mismatch at ' + path + '.' + key)


if __name__ == '__main__':
    with open(sys.argv[1], encoding='utf-8') as handle:
        snapshot = json.load(handle)
    if snapshot['schema'] != 'aminodata-calculation/v1':
        raise ValueError('Unsupported snapshot schema')
    output = []
    for day in snapshot['days']:
        result = calculate(day, snapshot['references'])
        verify(result, day['results'])
        output.append(dict(date=day['date'], **result))
    print(json.dumps(dict(verified=True, versions=snapshot['versions'], days=output), indent=2, allow_nan=False))
