#!/usr/bin/env python3
"""Lexical/AST guard for active copy. Internal/historical exceptions are exact and reviewed."""
from pathlib import Path
import re,json,subprocess,sys
from dart_literals import literals
root=Path(__file__).resolve().parents[2]
import os
os.chdir(root)
pattern=re.compile(r'\b(campus|hostels?|restaurants?|kitchens?|students?|runners?|dishes|dish|gate)\b|After you pay you get',re.I)
excluded={'backend/src/store.ts':'Unreferenced inherited compatibility fixture; not imported by API or the demo seed.', 'backend/src/config/campus.ts':'Historical coordinate lookup for already-stored legacy orders only. New demo orders use structured snapshots.'}
rows=[]
paths=list(Path('apps').glob('*/lib/**/*.dart'))+list(Path('packages/kraveo_ui/lib').rglob('*.dart'))+list(Path('apps').glob('*/test/ui_visual_capture_test.dart'))
for p in paths:
 s=p.read_text()
 for a,b,value in literals(s):
  if pattern.search(value):rows.append({'file':str(p),'line':s.count('\n',0,a)+1,'value':value})
paths=[str(p) for base in ['web/super_admin/src','backend/src'] for p in Path(base).rglob('*') if p.suffix in ['.ts','.tsx'] and '.test.' not in p.name and '/test/' not in str(p) and str(p) not in excluded]
r=subprocess.run(['node','scripts/qa/ts_ui_literals.cjs'],input=json.dumps(paths),text=True,capture_output=True,check=True)
rows += [x for line in r.stdout.splitlines() if pattern.search((x:=json.loads(line))['value'])]
allowfile=Path('scripts/qa/terminology-allowances.json');allowed=json.loads(allowfile.read_text()) if allowfile.exists() else []
keys={(x['file'],x['value']) for x in allowed if x.get('reason')}
fail=[x for x in rows if (x['file'],x['value']) not in keys]
# Scanning the scenarios also prevents legacy fixture labels from reappearing in a seed.
for p in [Path('demo/scenario.json')]:
 for m in pattern.finditer(p.read_text()):fail.append({'file':str(p),'line':1,'value':m.group()})
if '--candidates' in sys.argv:print(json.dumps(fail,indent=2));sys.exit(0)
if fail:print(json.dumps(fail,indent=2));print(f'FAIL: {len(fail)} unapproved legacy copy occurrences');sys.exit(1)
print(f'PASS: active Flutter, admin, backend and demo copy; {len(rows)} allowed occurrences covered by {len(keys)} exact internal/historical exceptions. Historical regression fixtures are excluded; screenshot fixtures are scanned.')
