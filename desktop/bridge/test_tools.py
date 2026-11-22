"""Offline safety checks, runnable on Linux and Windows."""
import unittest
from .tools import TOOLS,KEYS,validate_filename,execute

class BridgeTests(unittest.TestCase):
    def test_names(self):
        self.assertEqual(validate_filename("тест.txt"),"тест.txt")
        for name in ("../evil.txt","evil.exe","foo/bar.txt","a..txt","bad.txt\n"):
            with self.assertRaises(ValueError):
                validate_filename(name)
    def test_allowed_tools(self):
        self.assertEqual({t["name"] for t in TOOLS},
                         {"open_app","screenshot","click","type_text","hotkey","save_text_file"})
        self.assertNotIn(("ctrl","alt","delete"),KEYS)
    def test_no_shell_tool(self):
        with self.assertRaises(ValueError): execute("shell",{"command":"whoami"})

if __name__=="__main__":
    unittest.main()
