#!/usr/bin/env python3
"""配乐: 与 tail_voxel 同一时间线, 直接复用它的程序合成配乐."""
import importlib.util, os
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("tv", os.path.join(HERE, "..", "tail_voxel", "render.py"))
tv = importlib.util.module_from_spec(spec); spec.loader.exec_module(tv)
assert abs(tv.TOTAL - 38.8) < 1e-6
tv.synth_audio(os.path.join(HERE, "output", "_audio.wav"))
print("audio ok")
