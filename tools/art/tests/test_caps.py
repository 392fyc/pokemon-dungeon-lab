"""Offline tests for the spending caps in gen_image.py. No network, no .env, no API call."""
import importlib.util, json, sys, tempfile, unittest
from pathlib import Path
from unittest import mock

ART = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ART))  # gen_image does `from common import ...`
_spec = importlib.util.spec_from_file_location('gen_image', ART / 'gen_image.py')
gen = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(gen)

GUESS = 0.014


def e(usd, stage='stage7', batch='other'):
    return {'usd': usd, 'stage': stage, 'batch': batch}


class CheckCaps(unittest.TestCase):
    def test_caps_values(self):
        self.assertEqual(gen.CAPS, {'project': 50.0, 'batch': 2.0, 'stages': {'stage6': 15.0, 'stage7': 20.0}})

    def test_g3_stage7_uses_its_own_cap(self):
        self.assertIsNone(gen.check_caps([e(15.5)], 'stage7', 'b', GUESS))

    def test_g4_stage7_over_cap(self):
        msg = gen.check_caps([e(19.99)], 'stage7', 'b', GUESS)
        self.assertIn('stage7', msg)
        self.assertIn('20', msg)

    def test_g5_batch_over_cap(self):
        self.assertIn('batch', gen.check_caps([e(1.995, batch='b')], 'stage7', 'b', GUESS))

    def test_g6_project_over_cap(self):
        msg = gen.check_caps([e(49.99, stage='legacy')], 'stage7', 'b', GUESS)
        self.assertIn('project', msg)

    def test_g8_stage6_over_cap(self):
        msg = gen.check_caps([e(14.99, stage='stage6')], 'stage6', 'b', GUESS)
        self.assertIn('stage6', msg)

    def test_g2_unknown_stage_refused(self):
        self.assertIn('unknown stage', gen.check_caps([], 'stage9', 'b', GUESS))


class MainPath(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        d = Path(self.tmp.name)
        self.card = d / 'card.json'
        self.card.write_text(json.dumps({'id': 'c', 'prompt': 'x'}), encoding='utf-8')
        self.ledger = d / 'ledger.json'
        self.ledger.write_text(json.dumps({'caps': {}, 'entries': [e(19.99)]}), encoding='utf-8', newline='\n')

    def run_main(self, *args):
        with mock.patch.object(gen, 'LEDGER', self.ledger), \
                mock.patch.object(gen, 'openai_key') as key, \
                mock.patch.object(gen.urllib.request, 'urlopen') as net, \
                mock.patch.object(sys, 'argv', ['gen_image.py', str(self.card), *args]):
            with self.assertRaises(SystemExit) as cm:
                gen.main()
        return cm.exception.code, key, net

    def test_g1_stage_required(self):
        before = self.ledger.read_bytes()
        code, key, net = self.run_main('--batch', 'b')
        self.assertEqual(code, 2)
        key.assert_not_called(); net.assert_not_called()
        self.assertEqual(self.ledger.read_bytes(), before)

    def test_g2_unregistered_stage_exit_2(self):
        code, key, net = self.run_main('--batch', 'b', '--stage', 'stage9')
        self.assertEqual(code, 2)
        key.assert_not_called(); net.assert_not_called()

    def test_g7_refusal_leaves_ledger_and_skips_key_and_network(self):
        before = self.ledger.read_bytes()
        code, key, net = self.run_main('--batch', 'b', '--stage', 'stage7')
        self.assertIn('refused', str(code))
        self.assertIn('stage7', str(code))
        key.assert_not_called(); net.assert_not_called()
        self.assertEqual(self.ledger.read_bytes(), before)


if __name__ == '__main__':
    unittest.main()
