"""Limited Windows GUI actions. No arbitrary shell or destructive file access."""
import base64
import io
import os
from pathlib import Path
import re
import shutil
import subprocess
import time

TOOLS = [
    {"type":"function","name":"open_app","description":"Open Notepad or Opera only.","parameters":{"type":"object","properties":{"name":{"type":"string","enum":["notepad","opera"]}},"required":["name"],"additionalProperties":False}},
    {"type":"function","name":"screenshot","description":"Inspect the primary Windows screen. The screenshot goes to the OpenAI API.","parameters":{"type":"object","properties":{},"required":[],"additionalProperties":False}},
    {"type":"function","name":"click","description":"Click at primary-screen pixel coordinates.","parameters":{"type":"object","properties":{"x":{"type":"integer"},"y":{"type":"integer"}},"required":["x","y"],"additionalProperties":False}},
    {"type":"function","name":"type_text","description":"Paste text into the focused UI. This replaces the clipboard.","parameters":{"type":"object","properties":{"text":{"type":"string"}},"required":["text"],"additionalProperties":False}},
    {"type":"function","name":"hotkey","description":"Allowed combinations: ctrl+s, ctrl+l, ctrl+a, ctrl+t, alt+tab, enter, tab, esc.","parameters":{"type":"object","properties":{"keys":{"type":"array","items":{"type":"string"}}},"required":["keys"],"additionalProperties":False}},
    {"type":"function","name":"save_text_file","description":"Create a NEW .txt file in Desktop/IMPERIUM Agent; refuses overwrite.","parameters":{"type":"object","properties":{"filename":{"type":"string"},"content":{"type":"string"}},"required":["filename","content"],"additionalProperties":False}},
]
KEYS={("ctrl","s"),("ctrl","l"),("ctrl","a"),("ctrl","t"),("alt","tab"),("enter",),("tab",),("esc",)}
NAME=re.compile(r"^[\w .()-]{1,80}\.txt$",re.UNICODE)

def desktop():
    if os.name!="nt": raise RuntimeError("Windows only")
    import ctypes
    buf=ctypes.create_unicode_buffer(260)
    if ctypes.windll.shell32.SHGetFolderPathW(None,0x10,None,0,buf)!=0:
        raise RuntimeError("Desktop location not found")
    return Path(buf.value)

def validate_filename(name):
    if not isinstance(name,str) or not NAME.fullmatch(name) or ".." in name:
        raise ValueError("Expected a simple .txt filename (no paths, no overwrite).")
    return name

def gui():
    if os.name!="nt": raise RuntimeError("Windows only")
    import pyautogui
    pyautogui.FAILSAFE=True
    pyautogui.PAUSE=0.2
    return pyautogui

def execute(name, args):
    """Returns (JSON-able status, optional screenshot data URI)."""
    if name=="open_app":
        app=args["name"]
        if app=="notepad":
            executable="notepad.exe"
        elif app=="opera":
            candidates=[
                Path(os.environ.get("LOCALAPPDATA",""))/"Programs"/"Opera"/"opera.exe",
                Path(os.environ.get("PROGRAMFILES",""))/"Opera"/"launcher.exe",
                Path(os.environ.get("PROGRAMFILES(X86)",""))/"Opera"/"launcher.exe",
            ]
            executable=next((str(p) for p in candidates if p.is_file()),None) or shutil.which("opera.exe")
            if not executable: raise FileNotFoundError("Opera is not found in standard installation paths.")
        else: raise ValueError("Unsupported application")
        subprocess.Popen([executable],shell=False)
        return {"opened":app},None
    if name=="screenshot":
        im=gui().screenshot().convert("RGB")
        size=list(im.size)
        im.thumbnail((1440,1000))
        b=io.BytesIO()
        im.save(b,format="JPEG",quality=72,optimize=True)
        return {"screen_size":size,"sent_to_model":True},"data:image/jpeg;base64,"+base64.b64encode(b.getvalue()).decode("ascii")
    if name=="click":
        x,y=args["x"],args["y"]
        g=gui()
        width,height=g.size()
        if type(x)!=int or type(y)!=int or not (0<=x<width and 0<=y<height):
            raise ValueError("Coordinates outside primary monitor.")
        g.click(x,y)
        return {"clicked":[x,y]},None
    if name=="type_text":
        s=args["text"]
        if not isinstance(s,str) or len(s)>10000: raise ValueError("Text limit: 10000 characters")
        import pyperclip
        pyperclip.copy(s)
        gui().hotkey("ctrl","v")
        time.sleep(0.25)
        return {"typed_characters":len(s),"clipboard_replaced":True},None
    if name=="hotkey":
        keys=args["keys"]
        if not isinstance(keys,list) or tuple(keys) not in KEYS:
            raise ValueError("Hotkey not allowlisted")
        gui().hotkey(*keys)
        return {"keys":keys},None
    if name=="save_text_file":
        filename=validate_filename(args["filename"])
        content=args["content"]
        if not isinstance(content,str) or len(content)>10000: raise ValueError("Text limit: 10000 characters")
        folder=desktop()/"IMPERIUM Agent"
        folder.mkdir(parents=True,exist_ok=True)
        dest=folder/filename
        with dest.open("x",encoding="utf-8") as f:
            f.write(content)
        return {"saved":str(dest)},None
    raise ValueError("Unknown tool")
