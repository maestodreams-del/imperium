from pathlib import Path
import tempfile
import unittest

import torch

from imperium_ai.data import batch, load_corpus
from imperium_ai.hardware import inspect
from imperium_ai.model import ByteTokenizer, Config, LanguageModel
from imperium_ai.training import load_model, read_checkpoint, save_checkpoint


class CoreTests(unittest.TestCase):
    def setUp(self):
        torch.set_num_threads(1)
        torch.manual_seed(17)
        self.cfg = Config(context=32, width=32, heads=4, layers=1)

    def test_unicode_round_trip(self):
        text = "Фрей, żółć, Łódź! 🧠"
        self.assertEqual(ByteTokenizer.decode(ByteTokenizer.encode(text)), text)

    def test_future_tokens_cannot_change_past_predictions(self):
        model = LanguageModel(self.cfg).eval()
        a = torch.randint(256, (2, 20))
        b = a.clone()
        b[:, 10:] = (b[:, 10:] + 91) % 256
        torch.testing.assert_close(model(a)[0][:, :10], model(b)[0][:, :10], rtol=0, atol=0)

    def test_training_really_learns(self):
        model = LanguageModel(self.cfg)
        optimizer = torch.optim.AdamW(model.parameters(), lr=0.005)
        sequence = torch.tensor(list(b"abcd" * 9), dtype=torch.long)
        x, y = sequence[:32].unsqueeze(0), sequence[1:33].unsqueeze(0)
        initial = float(model(x, y)[1].detach())
        for _ in range(40):
            optimizer.zero_grad()
            loss = model(x, y)[1]
            loss.backward()
            optimizer.step()
        final = float(model(x, y)[1].detach())
        self.assertLess(final, initial * 0.3)

    def test_split_is_held_out_and_windows_do_not_cross(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "corpus.txt"
            path.write_text("A" * 900 + "B" * 100, encoding="utf-8")
            train, valid, _ = load_corpus(path, 32)
            self.assertNotIn(ord("B"), train.tolist())
            self.assertNotIn(ord("A"), valid.tolist())
            x, y = batch(train, 32, 20, "cpu")
            self.assertNotIn(ord("B"), x.flatten().tolist() + y.flatten().tolist())
            self.assertEqual(train[0].item(), ByteTokenizer.bos)
            with self.assertRaises(ValueError):
                load_corpus(path, 32, path)

    def test_checkpoint_preserves_predictions_and_optimizer_continuation(self):
        model = LanguageModel(self.cfg)
        optimizer = torch.optim.AdamW(model.parameters(), lr=0.001)
        x, y = torch.randint(256, (2, 32)), torch.randint(256, (2, 32))
        def advance(m, opt):
            opt.zero_grad()
            m(x, y)[1].backward()
            opt.step()
        advance(model, optimizer)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "model.pt"
            save_checkpoint(path, model, optimizer, 1, "test-fingerprint")
            restored, payload = load_model(path)
            torch.testing.assert_close(model(x)[0], restored(x)[0], rtol=0, atol=0)
            second = torch.optim.AdamW(restored.parameters())
            second.load_state_dict(payload["optimizer"])
            advance(model, optimizer)
            advance(restored, second)
            for a, b in zip(model.parameters(), restored.parameters()):
                torch.testing.assert_close(a, b, rtol=0, atol=0)
            self.assertEqual(read_checkpoint(path)["step"], 1)
            self.assertFalse(path.with_suffix(".pt.tmp").exists())

    def test_cpu_fallback_and_generation_validation(self):
        self.assertEqual(inspect("cpu")["device"], "cpu")
        model = LanguageModel(self.cfg)
        self.assertIsInstance(model.generate("Проверка", count=4, temperature=0), str)
        with self.assertRaises(ValueError):
            model.generate("test", count=-1)


if __name__ == "__main__":
    unittest.main()
