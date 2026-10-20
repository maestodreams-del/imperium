"""Conservative defaults based on measured hardware, not a laptop's brand."""
import ctypes
import os
import platform
import shutil
import subprocess

import torch


def ram_gib():
    try:
        if os.name == "nt":
            class Memory(ctypes.Structure):
                _fields_ = [("length", ctypes.c_ulong), ("load", ctypes.c_ulong)] + [
                    (name, ctypes.c_ulonglong) for name in ("total", "available", "page_total", "page_available", "virtual_total", "virtual_available", "extended")
                ]
            info = Memory()
            info.length = ctypes.sizeof(info)
            if not ctypes.windll.kernel32.GlobalMemoryStatusEx(ctypes.byref(info)):
                return None
            return round(info.total / 2**30, 1)
        return round(os.sysconf("SC_PAGE_SIZE") * os.sysconf("SC_PHYS_PAGES") / 2**30, 1)
    except (AttributeError, OSError, ValueError):
        return None


def inspect(requested="auto"):
    if requested not in ("auto", "cpu", "cuda"):
        raise ValueError("Device must be auto, cpu or cuda")
    result = {"platform": platform.platform(), "python": platform.python_version(), "torch": str(torch.__version__),
              "ram_gib": ram_gib(), "device": "cpu", "profile": "tiny", "batch_size": 4, "warnings": []}
    if requested != "cpu" and torch.cuda.is_available():
        try:
            # Check that this build can actually execute on the installed card.
            probe = torch.ones((16, 16), device="cuda")
            _ = probe @ probe
            torch.cuda.synchronize()
            del probe, _
            props = torch.cuda.get_device_properties(0)
            free_bytes, total_bytes = torch.cuda.mem_get_info()
            result.update(device="cuda", gpu=props.name, vram_gib=round(total_bytes / 2**30, 2), free_vram_gib=round(free_bytes / 2**30, 2))
            if free_bytes >= 3 * 2**30:
                result.update(profile="small", batch_size=8)
        except RuntimeError as error:
            if requested == "cuda":
                raise RuntimeError("CUDA execution failed; check PyTorch and the GPU driver") from error
            result["warnings"].append("GPU execution failed; using CPU. " + str(error))
    elif requested == "cuda":
        raise RuntimeError("CUDA is unavailable. Install a compatible GPU-enabled PyTorch build and NVIDIA driver.")
    if result["device"] == "cpu":
        executable = shutil.which("nvidia-smi")
        if executable:
            try:
                info = subprocess.run([executable, "--query-gpu=name,memory.total,driver_version", "--format=csv,noheader"], capture_output=True, text=True, timeout=5, check=True)
                result["nvidia_driver_report"] = info.stdout.strip()
                if requested != "cpu":
                    result["warnings"].append("An NVIDIA driver is present, but PyTorch GPU acceleration is unavailable. See README for GPU installation.")
            except (OSError, subprocess.SubprocessError):
                pass
    return result
