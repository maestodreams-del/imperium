"""Explicit local UTF-8 files only: no scraping, uploads or production database reads."""
import hashlib
from pathlib import Path

import torch
from .model import ByteTokenizer


MAX_BYTES = 16 * 1024 * 1024


def read_bytes(path):
    path = Path(path)
    # Bound the read itself, even if the file grows after stat().
    with path.open("rb") as stream:
        raw = stream.read(MAX_BYTES + 1)
    if len(raw) > MAX_BYTES:
        raise ValueError("Prototype supports text files up to 16 MiB each")
    raw.decode("utf-8")  # Reject PDFs, DOCX, binary files and wrong encodings.
    return raw


def load_corpus(path, context, validation_path=None):
    raw = read_bytes(path)
    if validation_path:
        train_raw, valid_raw = raw, read_bytes(validation_path)
        if Path(path).resolve() == Path(validation_path).resolve() or train_raw == valid_raw:
            raise ValueError("Training and validation must be different files with different content")
    else:
        # Contiguous non-overlapping split BEFORE sampling windows.
        cut = int(len(raw) * 0.9)
        train_raw, valid_raw = raw[:cut], raw[cut:]
    if min(len(train_raw), len(valid_raw)) <= context:
        raise ValueError(f"Both splits need more than {context} bytes; provide more text or use profile tiny")
    digest = hashlib.sha256(train_raw).hexdigest() + ":" + hashlib.sha256(valid_raw).hexdigest()
    def tokenize(source):
        ids = []
        for paragraph in source.split(b"\n\n"):
            if paragraph.strip():
                ids.extend([ByteTokenizer.bos, *paragraph, ByteTokenizer.eos])
        if len(ids) <= context:
            raise ValueError("Split contains too little non-whitespace text")
        return torch.tensor(ids, dtype=torch.long)
    return tokenize(train_raw), tokenize(valid_raw), digest


def batch(data, context, size, device, generator=None):
    starts = torch.randint(len(data) - context, (size,), generator=generator)
    x = torch.stack([data[int(i):int(i) + context] for i in starts])
    y = torch.stack([data[int(i) + 1:int(i) + context + 1] for i in starts])
    return x.to(device), y.to(device)
