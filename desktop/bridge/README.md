# IMPERIUM Bridge — local Windows prototype

This is an independently launched module next to the existing Electron app. Not yet installed in the IMPERIUM UI, and not a direct ChatGPT plugin. No inbound network port is opened.

## First real Windows test (no API key)

From PowerShell in the project checkout:

    cd desktop
    py -m pip install -r bridge/requirements.txt
    py -m unittest bridge.test_tools
    py -m bridge.smoke_test

Expected: Notepad opens; a NEW file under Desktop/IMPERIUM Agent contains «IMPERIUM подключён». The test verifies its contents. Keep the desktop unlocked; do not move the mouse while it runs. Notepad UI changes may cause a clearly reported FAIL.

## Model-driven mode

Set a personal OpenAI API key in PowerShell, without committing or pasting it into chat:

    $env:OPENAI_API_KEY = 'YOUR_API_KEY'
    $env:IMPERIUM_MODEL = 'gpt-5'
    py -m bridge.agent

Then try: «Открой Opera, зайди на Leroy Merlin и найди плитку». The model chooses tool calls and consumes screenshots; GUI actions run locally. OpenAI API billing is separate from ChatGPT subscriptions and the model session is separate from this chat.

## Safety / limitations

- Allowlisted apps: Notepad, Opera. No arbitrary shell commands or external incoming listener.
- GUI tools: screenshot, primary-screen click, Unicode paste, restricted hotkeys, create-only .txt under Desktop/IMPERIUM Agent.
- Screenshots are uploaded to OpenAI API when requested. Close any private windows before use.
- Clipboard is replaced by pasted text. Multi-monitor support and robust UI element targeting are not implemented yet.
- No destructive operations or overwrite. Event log: Desktop/IMPERIUM Agent/bridge-events.jsonl.
- Emergency stop: Ctrl+C in console; PyAutoGUI failsafe by moving pointer to upper-left.
- Not yet wired to Electron GUI or a ChatGPT MCP connector; those are later stages after Windows validation.

Run `py -m unittest bridge.test_tools` from desktop for offline checks.
