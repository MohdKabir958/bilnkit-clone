#!/usr/bin/env python3
"""Expose bounded Jest diagnostics in ordinary GitHub check annotations, keeping full artifacts."""
import json
from pathlib import Path
import re
import sys


def escaped(text):
    return str(text).replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')


def annotations(report):
    total = report.get('numTotalTests', 0)
    passed = report.get('numPassedTests', 0)
    failed = report.get('numFailedTests', 0)
    skipped = report.get('numPendingTests', 0)
    yield '::notice::' + escaped(f'Jest complete invocation: total={total}, passed={passed}, failed={failed}, skipped={skipped}, success={report.get("success", False)}. Full log and JSON remain in the CI artifact.')
    for suite in report.get('testResults', []):
        if suite.get('status') != 'failed':
            continue
        failures = [' / '.join(test.get('ancestorTitles', []) + [test.get('title', '')]) + '\n' + '\n'.join(test.get('failureMessages', []))
                    for test in suite.get('assertionResults', []) if test.get('status') == 'failed']
        message = '\n\n'.join(failures) or suite.get('message', '') or 'Suite failed before test execution.'
        message = re.sub(r'\x1b\[[0-9;]*m', '', str(message))
        # Runner-controlled test names/paths must not inject workflow command delimiters.
        label = Path(suite.get('name', 'unknown-suite')).name
        yield '::error::' + escaped((label + '\n' + message)[:24000])


if __name__ == '__main__':
    source = Path(sys.argv[1])
    if not source.is_file():
        print('::notice::Jest JSON was not produced; inspect the preserved prerequisite log. No passing test result is claimed.')
    else:
        for line in annotations(json.loads(source.read_text())):
            print(line)
