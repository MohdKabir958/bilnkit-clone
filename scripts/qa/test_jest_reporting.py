import unittest
from report_jest_results import annotations

class ResultAnnotations(unittest.TestCase):
    def test_counts_are_reported_without_claiming_a_partial_run_is_full(self):
        lines=list(annotations({'numTotalTests':2,'numPassedTests':1,'numFailedTests':1,'numPendingTests':0,'success':False}))
        self.assertIn('passed=1, failed=1',lines[0]);self.assertIn('success=False',lines[0])
    def test_test_failure_is_bounded_and_cannot_inject_runner_commands(self):
        report={'testResults':[{'status':'failed','name':'suite.test.ts','assertionResults':[{'status':'failed','title':'example','failureMessages':['Expected: 200\n::stop-commands::private\r\nReceived: 500%']}]}]}
        failure=list(annotations(report))[1]
        self.assertNotIn('\n',failure);self.assertIn('Expected: 200%0A::stop-commands::private%0D%0AReceived: 500%25',failure)
        self.assertIn('suite.test.ts',failure)
    def test_compile_failure_is_not_hidden(self):
        failure=list(annotations({'testResults':[{'status':'failed','name':'compile.test.ts','message':'TypeScript fixture mismatch'}]}))[1]
        self.assertIn('TypeScript fixture mismatch',failure)

if __name__=='__main__':unittest.main()
