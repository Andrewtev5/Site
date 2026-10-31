"""Generates the site's interface sounds, so they need no third-party recordings or licences.

Run from the Site1 directory: python tools/generate_sounds.py
"""
from __future__ import annotations

import math
import struct
import wave
from pathlib import Path

SAMPLE_RATE = 44100
AUDIO_DIR = Path(__file__).resolve().parents[1] / "audio"


def seeded_random(seed: int):
    """Mulberry32: a fixed seed makes every generated file identical."""
    state = seed & 0xFFFFFFFF

    def next_value() -> float:
        nonlocal state
        state = (state + 0x6D2B79F5) & 0xFFFFFFFF
        value = state
        value = (value ^ (value >> 15)) * (1 | value) & 0xFFFFFFFF
        value = (value + ((value ^ (value >> 7)) * (61 | value) & 0xFFFFFFFF)) ^ value
        value &= 0xFFFFFFFF
        return (value ^ (value >> 14)) / 4294967296

    return next_value


def add_noise_burst(samples: list[float], random, gain: float, decay: float, highpass: float, attack: float) -> None:
    lowpassed = 0.0
    for index in range(len(samples)):
        time = index / SAMPLE_RATE
        noise = random() * 2 - 1
        lowpassed += (noise - lowpassed) * (1 - highpass)
        samples[index] += (noise - lowpassed) * math.exp(-time / decay) * gain * min(1.0, time / attack)


def fade_out(samples: list[float], seconds: float) -> None:
    length = int(seconds * SAMPLE_RATE)
    for index in range(length):
        samples[-1 - index] *= index / length


def soft_click() -> list[float]:
    samples = [0.0] * int(0.07 * SAMPLE_RATE)
    add_noise_burst(samples, seeded_random(5), gain=0.12, decay=0.003, highpass=0.6, attack=0.0005)

    decay = 0.016
    phase = 0.0
    for index in range(len(samples)):
        time = index / SAMPLE_RATE
        frequency = 520 * (190 / 520) ** min(1.0, time / (decay * 3))
        phase += 2 * math.pi * frequency / SAMPLE_RATE
        samples[index] += math.sin(phase) * math.exp(-time / decay) * 0.9 * min(1.0, time / 0.0005)

    fade_out(samples, 0.004)
    return samples


def glass_shatter() -> list[float]:
    random = seeded_random(27)
    samples = [0.0] * int(1.25 * SAMPLE_RATE)
    add_noise_burst(samples, random, gain=1.0, decay=0.02, highpass=0.65, attack=0.0004)

    for index in range(len(samples)):
        time = index / SAMPLE_RATE
        samples[index] += math.sin(2 * math.pi * 140 * time) * math.exp(-time / 0.03) * 0.45

    spread = 0.75
    for _ in range(60):
        onset = 0.004 + random() ** 1.8 * spread
        frequency = 2200 * (9500 / 2200) ** random()
        decay = 0.015 + random() * (0.09 - 0.015)
        amplitude = 0.2 * (0.35 + 0.65 * random()) * math.exp(-onset / (spread * 0.7))
        overtone = frequency * (1.41 + random() * 0.5)

        start = int(onset * SAMPLE_RATE)
        end = min(len(samples), start + int(decay * 7 * SAMPLE_RATE))
        for index in range(start, end):
            time = (index - start) / SAMPLE_RATE
            envelope = math.exp(-time / decay) * min(1.0, time / 0.0003)
            tone = math.sin(2 * math.pi * frequency * time) + 0.45 * math.sin(2 * math.pi * overtone * time)
            samples[index] += tone * envelope * amplitude

    peak = max(abs(sample) for sample in samples)
    samples = [sample * 0.9 / peak for sample in samples]
    fade_out(samples, 0.03)
    return samples


def write_wav(path: Path, samples: list[float]) -> None:
    frames = b"".join(struct.pack("<h", int(max(-1.0, min(1.0, sample)) * 32767)) for sample in samples)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(1)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(frames)


def main() -> None:
    write_wav(AUDIO_DIR / "button-click.wav", soft_click())
    write_wav(AUDIO_DIR / "purchase-glass.wav", glass_shatter())


if __name__ == "__main__":
    main()
