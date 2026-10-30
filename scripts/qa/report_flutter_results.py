#!/usr/bin/env python3
"""Expose bounded failures from actual Flutter machine results; keep raw artifact."""
from collections import Counter, defaultdict
import json
from pathlib import Path
import sys


def escaped(text):
    return str(text).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')


path = Path(sys.argv[1])
if not path.exists():
    print('::notice::Flutter results absent; inspect dependency/analysis prerequisites. No passing test count is claimed.')
    raise SystemExit(0)
raw = path.read_text(errors='replace')
names, failures = {}, set()
details = defaultdict(list)
types = Counter()
for line in raw.splitlines():
    try:
        event = json.loads(line)
    except ValueError:
        continue
    if not isinstance(event, dict):
        continue
    kind = event.get('type', 'unknown')
    types[str(kind)] += 1
    identity = str(event.get('testID', 'loading'))
    if kind == 'testStart':
        test = event.get('test', {})
        names[str(test.get('id'))] = test.get('name', 'Unnamed test')
    elif kind == 'error':
        failures.add(identity)
        details[identity].append(str(event.get('error', '')) + '\n' + str(event.get('stackTrace', '')))
    elif kind == 'print':
        details[identity].append(str(event.get('message', '')))
    elif kind == 'testDone' and event.get('result') in ('failure', 'error'):
        failures.add(identity)
print('::notice::' + escaped('Flutter machine events: ' + json.dumps(dict(types), sort_keys=True)))
for identity in sorted(failures):
    message = names.get(identity, 'Flutter test loading') + '\n' + '\n'.join(details[identity])
    print('::error::' + escaped(message[:6000]))
if not failures:
    print('::error::' + escaped('Flutter command failed without parsed test errors. Last output:\n' + raw[-18000:]))
