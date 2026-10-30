#!/usr/bin/env python3
"""Expose bounded failures from actual Flutter machine results; keep raw artifact."""
import json
from pathlib import Path
import sys
from report_jest_results import escaped

path = Path(sys.argv[1])
if not path.exists():
    print('::notice::Flutter results absent; inspect dependency/analysis prerequisites. No passing test count is claimed.')
    raise SystemExit(0)
names = {}
for line in path.read_text(errors='replace').splitlines():
    try:
        event = json.loads(line)
    except ValueError:
        continue
    if event.get('type') == 'testStart':
        test = event['test']
        names[test['id']] = test['name']
    if event.get('type') == 'error':
        name = names.get(event.get('testID'), 'Flutter test loading')
        detail = str(event.get('error', '')) + '\n' + str(event.get('stackTrace', ''))
        print('::error::' + escaped((name + '\n' + detail)[:3500]))
