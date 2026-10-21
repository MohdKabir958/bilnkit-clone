import unittest
from dart_literals import literals

class ActiveCopyLexerTests(unittest.TestCase):
    def test_apostrophes_inside_comments_do_not_hide_active_copy(self):
        source="// The customer's old migration isn't UI.\nText('At the gate');"
        self.assertEqual([v for _,_,v in literals(source)],['At the gate'])
    def test_interpolation_expressions_are_separate_from_visible_copy(self):
        values=[v for _,_,v in literals('Text("Delivery ${order[\'restaurants\']} is ready");')]
        self.assertIn('restaurants',values)
        self.assertIn('Delivery ',values)
        self.assertIn(' is ready',values)
    def test_multiline_and_raw_literals_are_audited(self):
        values=[v for _,_,v in literals("Text('''Pickup\\nlocation'''); RegExp(r'^hostel$');")]
        self.assertEqual(values,['Pickup\\nlocation','^hostel$'])

if __name__=='__main__':unittest.main()
