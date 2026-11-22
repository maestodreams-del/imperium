"""Offline first test: Notepad, Unicode paste, Save As, check the created file."""
import os
import sys
import time
from datetime import datetime
from .tools import desktop,execute

def main():
    if os.name!="nt": sys.exit("Requires Windows desktop.")
    folder=desktop()/"IMPERIUM Agent"
    folder.mkdir(parents=True,exist_ok=True)
    target=folder/("notepad-test-"+datetime.now().strftime("%Y%m%d-%H%M%S")+".txt")
    text="IMPERIUM подключён"
    if target.exists(): sys.exit("File already exists; not overwriting.")
    print("Launching Notepad; expected save:",target)
    execute("open_app",{"name":"notepad"})
    time.sleep(2.5)
    execute("type_text",{"text":text})
    execute("hotkey",{"keys":["ctrl","s"]})
    time.sleep(1)
    execute("type_text",{"text":str(target)})
    execute("hotkey",{"keys":["enter"]})
    for _ in range(20):
        if target.exists():
            if target.read_text(encoding="utf-8-sig")==text:
                print("PASS: Unicode text saved via Notepad UI.")
                return
            sys.exit("FAIL: File text differs.")
        time.sleep(0.5)
    sys.exit("FAIL: File missing. Inspect Notepad/Save dialog.")

if __name__=="__main__":
    main()
