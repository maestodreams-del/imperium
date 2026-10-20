"""A small decoder-only Transformer. No pretrained model or tokenizer is loaded."""
from dataclasses import asdict, dataclass
import math

import torch
from torch import nn
from torch.nn import functional as F


@dataclass(frozen=True)
class Config:
    context: int = 128
    width: int = 64
    heads: int = 4
    layers: int = 2
    vocab: int = 258

    def __post_init__(self):
        if min(self.context, self.width, self.heads, self.layers) < 1 or self.width % self.heads:
            raise ValueError("Invalid model dimensions")
        if self.vocab != 258:
            raise ValueError("This model uses the version-1 UTF-8 byte tokenizer")


PROFILES = {
    "tiny": Config(),
    "small": Config(context=256, width=128, heads=4, layers=4),
    "medium": Config(context=256, width=256, heads=8, layers=6),
}


class ByteTokenizer:
    """Lossless UTF-8 encoding; each byte is a token, plus EOS and BOS."""
    eos = 256
    bos = 257

    @staticmethod
    def encode(text):
        return list(text.encode("utf-8"))

    @staticmethod
    def decode(tokens):
        # An immature model may emit invalid UTF-8; show it without crashing.
        return bytes(t for t in tokens if 0 <= t < 256).decode("utf-8", errors="replace")


class Attention(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.heads = cfg.heads
        self.qkv = nn.Linear(cfg.width, cfg.width * 3, bias=False)
        self.output = nn.Linear(cfg.width, cfg.width, bias=False)
        self.register_buffer("mask", torch.ones(cfg.context, cfg.context, dtype=torch.bool).tril(), persistent=False)

    def forward(self, x):
        batch, length, width = x.shape
        q, k, v = self.qkv(x).chunk(3, dim=-1)
        q, k, v = [t.view(batch, length, self.heads, width // self.heads).transpose(1, 2) for t in (q, k, v)]
        scores = (q @ k.transpose(-2, -1)) / math.sqrt(width // self.heads)
        scores = scores.masked_fill(~self.mask[:length, :length], float("-inf"))
        attended = F.softmax(scores, dim=-1) @ v
        return self.output(attended.transpose(1, 2).contiguous().view(batch, length, width))


class Block(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.norm1, self.norm2 = nn.LayerNorm(cfg.width), nn.LayerNorm(cfg.width)
        self.attention = Attention(cfg)
        self.feed_forward = nn.Sequential(nn.Linear(cfg.width, cfg.width * 4), nn.GELU(), nn.Linear(cfg.width * 4, cfg.width))

    def forward(self, x):
        x = x + self.attention(self.norm1(x))
        return x + self.feed_forward(self.norm2(x))


class LanguageModel(nn.Module):
    def __init__(self, cfg):
        super().__init__()
        self.cfg = cfg
        self.embedding = nn.Embedding(cfg.vocab, cfg.width)
        self.position = nn.Embedding(cfg.context, cfg.width)
        self.blocks = nn.Sequential(*(Block(cfg) for _ in range(cfg.layers)))
        self.norm = nn.LayerNorm(cfg.width)
        self.output = nn.Linear(cfg.width, cfg.vocab, bias=False)
        self.apply(self._initialize)
        self.output.weight = self.embedding.weight

    @staticmethod
    def _initialize(module):
        if isinstance(module, (nn.Linear, nn.Embedding)):
            nn.init.normal_(module.weight, std=0.02)
            if isinstance(module, nn.Linear) and module.bias is not None:
                nn.init.zeros_(module.bias)

    def forward(self, tokens, targets=None):
        if tokens.ndim != 2 or not 0 < tokens.shape[1] <= self.cfg.context:
            raise ValueError("Input must be [batch, length], with length within model context")
        positions = torch.arange(tokens.shape[1], device=tokens.device)
        x = self.embedding(tokens) + self.position(positions)
        logits = self.output(self.norm(self.blocks(x)))
        loss = None if targets is None else F.cross_entropy(logits.reshape(-1, self.cfg.vocab), targets.reshape(-1))
        return logits, loss

    @torch.no_grad()
    def generate(self, prompt, count=160, temperature=0.8, top_k=32):
        if not 1 <= count <= 4096 or not math.isfinite(temperature) or temperature < 0 or not 1 <= top_k <= self.cfg.vocab:
            raise ValueError("Invalid generation settings")
        self.eval()
        device = self.embedding.weight.device
        ids = [ByteTokenizer.bos] + ByteTokenizer.encode(prompt)
        produced = []
        for _ in range(count):
            x = torch.tensor([ids[-self.cfg.context:]], dtype=torch.long, device=device)
            logits = self(x)[0][0, -1].clone()
            logits[ByteTokenizer.bos] = float("-inf")
            if temperature == 0:
                token = int(logits.argmax())
            else:
                logits /= temperature
                threshold = torch.topk(logits, top_k).values[-1]
                logits[logits < threshold] = float("-inf")
                token = int(torch.multinomial(F.softmax(logits, dim=-1), 1))
            if token == ByteTokenizer.eos:
                break
            produced.append(token)
            ids.append(token)
        return ByteTokenizer.decode(produced)

    def description(self):
        return {"config": asdict(self.cfg), "parameters": sum(p.numel() for p in self.parameters())}
