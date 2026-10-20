import argparse
import json
import os
from pathlib import Path

import torch

from .hardware import inspect
from .model import PROFILES
from .training import load_model, train


def main():
    parser = argparse.ArgumentParser(description="IMPERIUM experimental neural core — own weights, trained from scratch")
    commands = parser.add_subparsers(dest="command", required=True)
    hardware = commands.add_parser("hardware", help="Detect usable GPU, RAM and conservative defaults")
    hardware.add_argument("--output", help="Optional hardware report JSON")
    training = commands.add_parser("train", help="Train on an explicit local UTF-8 text file")
    training.add_argument("--data", required=True)
    training.add_argument("--validation", help="Optional separate UTF-8 validation file; otherwise last 10%% is held out")
    training.add_argument("--output", default="runs/experiment.pt")
    training.add_argument("--profile", choices=PROFILES)
    training.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
    training.add_argument("--batch-size", type=int)
    training.add_argument("--steps", type=int, default=300, help="Additional optimizer steps, also when resuming")
    training.add_argument("--eval-every", type=int, default=50)
    training.add_argument("--lr", type=float, default=0.0003, help="Initial learning rate; resume uses saved optimizer state")
    training.add_argument("--seed", type=int, default=2026)
    training.add_argument("--threads", type=int, default=min(4, os.cpu_count() or 1))
    training.add_argument("--resume", action="store_true")
    for name in ("generate", "chat"):
        p = commands.add_parser(name, help="Inspect model output; this is not yet a reliable assistant")
        p.add_argument("--checkpoint", default="runs/experiment.pt")
        p.add_argument("--device", choices=("auto", "cpu", "cuda"), default="auto")
        p.add_argument("--tokens", type=int, default=160, help="Maximum new byte tokens (not words)")
        p.add_argument("--temperature", type=float, default=0.8)
        p.add_argument("--top-k", type=int, default=32)
        if name == "generate":
            p.add_argument("--prompt", required=True)
    args = parser.parse_args()
    try:
        if args.command == "hardware":
            text = json.dumps(inspect(), indent=2, ensure_ascii=False)
            print(text)
            if args.output:
                Path(args.output).write_text(text + "\n", encoding="utf-8")
        elif args.command == "train":
            train(args)
        else:
            torch.set_num_threads(min(4, os.cpu_count() or 1))
            model, payload = load_model(args.checkpoint, inspect(args.device)["device"])
            print(f"Experimental model, training step {payload['step']}. Output may be meaningless or incorrect.")
            def reply(prompt):
                return model.generate(prompt, args.tokens, args.temperature, args.top_k)
            if args.command == "generate":
                print(reply(args.prompt))
            else:
                print("Enter /exit to stop. Each turn is independent; no access to company data.")
                while True:
                    try:
                        prompt = input("You: ")
                    except (EOFError, KeyboardInterrupt):
                        break
                    if prompt.strip() == "/exit":
                        break
                    print("Model: " + reply("User: " + prompt + "\nAssistant: "))
    except (OSError, ValueError, RuntimeError) as error:
        parser.exit(1, f"Error: {error}\nIf memory is insufficient, try --device cpu --profile tiny --batch-size 1 with a new output path.\n")


if __name__ == "__main__":
    main()
