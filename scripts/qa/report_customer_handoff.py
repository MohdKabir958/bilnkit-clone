#!/usr/bin/env python3
"""Expose bounded synthetic Flutter diagnostics; keep the complete artifact unchanged."""
import os
from pathlib import Path
import re
from report_jest_results import escaped

source = Path('Docs/customer-handoff/evidence/clerk-tests.log')
if source.exists():
    output = re.sub(r'\x1b\[[0-9;]*m', '', source.read_text(errors='replace'))
    level = 'notice' if os.environ.get('HANDOFF_OUTCOME') == 'success' else 'error'
    print(f'::{level}::' + escaped(output[-24000:]))
else:
    print('::notice::Clerk handoff log not produced; inspect the prerequisite job. No test pass is claimed.')
