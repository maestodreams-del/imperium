from dataclasses import asdict
import json
import math
from pathlib import Path
import time

import torch

from .data import batch, load_corpus
from .hardware import inspect
from .model import Config, LanguageModel, PROFILES


FORMAT = "imperium-byte-transformer-v1"


def read_checkpoint(path):
    payload = torch.load(path, map_location="cpu", weights_only=True)
    if not isinstance(payload, dict) or payload.get("format") != FORMAT:
        raise ValueError("Unsupported checkpoint format")
    return payload


def save_checkpoint(path, model, optimizer, step, fingerprint):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    payload = {"format": FORMAT, "config": asdict(model.cfg), "weights": model.state_dict(),
               "optimizer": optimizer.state_dict(), "step": step, "corpus_sha256": fingerprint,
               "rng": torch.get_rng_state(), "torch_version": str(torch.__version__)}
    try:
        torch.save(payload, temporary)
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)


def load_model(path, device="cpu"):
    payload = read_checkpoint(path)
    model = LanguageModel(Config(**payload["config"]))
    model.load_state_dict(payload["weights"])
    return model.to(device).eval(), payload


@torch.no_grad()
def evaluate(model, data, size, device, count=4):
    generator = torch.Generator().manual_seed(2026)
    was_training = model.training
    model.eval()
    try:
        values = [float(model(*batch(data, model.cfg.context, size, device, generator))[1]) for _ in range(count)]
        return sum(values) / len(values)
    finally:
        model.train(was_training)


def train(args):
    if args.steps < 1 or args.eval_every < 1 or args.threads < 1 or not math.isfinite(args.lr) or args.lr <= 0:
        raise ValueError("Steps, eval-every, threads and learning rate must be positive")
    if args.batch_size is not None and args.batch_size < 1:
        raise ValueError("Batch size must be positive")
    torch.set_num_threads(args.threads)
    torch.manual_seed(args.seed)
    hardware = inspect(args.device)
    print(json.dumps({"hardware": hardware}, ensure_ascii=False), flush=True)
    device = hardware["device"]
    size = args.batch_size or hardware["batch_size"]
    output = Path(args.output)
    if output.exists() and not args.resume:
        raise ValueError("Checkpoint exists. Use --resume to continue, or a new --output path.")
    payload = read_checkpoint(output) if args.resume else None
    profile = args.profile or hardware["profile"]
    cfg = Config(**payload["config"]) if payload else PROFILES[profile]
    if payload and args.profile is not None and cfg != PROFILES[args.profile]:
        raise ValueError("--profile conflicts with the saved model")
    train_data, valid_data, fingerprint = load_corpus(args.data, cfg.context, args.validation)
    if payload and payload["corpus_sha256"] != fingerprint:
        raise ValueError("Corpus has changed. Resume requires the same train/validation data.")
    model = LanguageModel(cfg).to(device)
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    step = 0
    if payload:
        model.load_state_dict(payload["weights"])
        optimizer.load_state_dict(payload["optimizer"])
        step = payload["step"]
        torch.set_rng_state(payload["rng"])
    print(json.dumps({"model": model.description(), "train_tokens": len(train_data), "validation_tokens": len(valid_data),
                      "start_step": step, "note": "Experimental model; lower loss is not proof of assistant competence."}), flush=True)
    started = time.monotonic()
    output.parent.mkdir(parents=True, exist_ok=True)
    log_path = output.with_suffix(".jsonl")

    def report():
        record = {"step": step, "train_loss": evaluate(model, train_data, size, device),
                  "validation_loss": evaluate(model, valid_data, size, device),
                  "elapsed_seconds": round(time.monotonic() - started, 2)}
        print(json.dumps(record), flush=True)
        with log_path.open("a", encoding="utf-8") as stream:
            stream.write(json.dumps(record) + "\n")

    report()
    model.train()
    target = step + args.steps
    try:
        while step < target:
            x, y = batch(train_data, cfg.context, size, device)
            optimizer.zero_grad(set_to_none=True)
            loss = model(x, y)[1]
            if not torch.isfinite(loss):
                raise RuntimeError("Training loss became non-finite; last saved checkpoint is intact")
            loss.backward()
            torch.nn.utils.clip_grad_norm_(model.parameters(), 1.0, error_if_nonfinite=True)
            optimizer.step()
            step += 1
            if step % args.eval_every == 0 or step == target:
                report()
                save_checkpoint(output, model, optimizer, step, fingerprint)
    except KeyboardInterrupt:
        # Keep the last fully committed checkpoint. An interrupt can occur halfway
        # through optimizer.step(), so saving current weights here is unsafe.
        print("Interrupted. Resume from the last reported saved checkpoint.", flush=True)
        return
    print(f"Checkpoint saved: {output}", flush=True)
