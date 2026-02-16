#!/usr/bin/env python3
import argparse
import json
import math
import sys

import librosa
import numpy as np


def round6(value):
    return round(float(value), 6)


def clamp_non_negative(v):
    return max(0.0, float(v))


def scalar_float(value, default=0.0):
    try:
        arr = np.asarray(value, dtype=float).reshape(-1)
        if arr.size == 0 or not np.isfinite(arr[0]):
            return float(default)
        return float(arr[0])
    except Exception:
        return float(default)


def build_slices(beats, duration, beats_per_slice):
    slices = []

    if not beats:
        return slices

    count = len(beats)
    i = 0
    slice_id = 1
    while i < count:
        start = beats[i]
        next_index = i + beats_per_slice
        if next_index < count:
            end = beats[next_index]
        else:
            end = duration

        end = min(duration, end)
        if end - start >= 0.05:
            slices.append(
                {
                    "id": slice_id,
                    "start": round6(start),
                    "end": round6(end),
                    "duration": round6(end - start),
                    "startBeatIndex": i,
                    "beats": min(beats_per_slice, count - i),
                }
            )
            slice_id += 1

        i += beats_per_slice

    return slices


def main():
    parser = argparse.ArgumentParser(description="Analyze beats and create musical slices")
    parser.add_argument("--input", required=True, help="Path to input audio file")
    parser.add_argument("--sr", type=int, default=44100, help="Target sample rate")
    parser.add_argument("--hop-length", type=int, default=512, help="Hop length for onset/beat")
    args = parser.parse_args()

    try:
        y, sr = librosa.load(args.input, sr=args.sr, mono=True)
        duration = float(librosa.get_duration(y=y, sr=sr))

        # Median onset envelope reduces spurious transients and gives steadier beat grids.
        onset_env = librosa.onset.onset_strength(
            y=y,
            sr=sr,
            hop_length=args.hop_length,
            aggregate=np.median,
        )

        tempo, beat_frames = librosa.beat.beat_track(
            onset_envelope=onset_env,
            sr=sr,
            hop_length=args.hop_length,
            tightness=100,
            trim=False,
        )
        tempo_value = scalar_float(tempo, default=120.0)

        beat_times = librosa.frames_to_time(
            beat_frames,
            sr=sr,
            hop_length=args.hop_length,
        ).astype(float)

        beats = [clamp_non_negative(t) for t in beat_times.tolist()]

        if len(beats) == 0:
            # Fallback: simple quarter-note grid from detected tempo.
            if not math.isfinite(tempo_value) or tempo_value <= 0:
                tempo_value = 120.0
            beat_step = 60.0 / tempo_value
            t = 0.0
            while t < duration:
                beats.append(round6(t))
                t += beat_step
        else:
            if beats[0] > 0.12:
                beats.insert(0, 0.0)

        beats = [round6(t) for t in beats if t < duration]

        beat_intervals = []
        for idx, start in enumerate(beats):
            if idx + 1 < len(beats):
                end = beats[idx + 1]
            else:
                end = round6(duration)
            beat_intervals.append(
                {
                    "start": round6(start),
                    "end": round6(end),
                    "duration": round6(max(0.0, end - start)),
                    "index": idx,
                }
            )

        slices = {
            "1": build_slices(beats, duration, 1),
            "2": build_slices(beats, duration, 2),
            "4": build_slices(beats, duration, 4),
            "8": build_slices(beats, duration, 8),
            # Bar-based groups assume 4/4 feel (4 beats per bar).
            "2bar": build_slices(beats, duration, 8),
            "4bar": build_slices(beats, duration, 16),
        }

        analysis = {
            "bpm": round6(tempo_value if math.isfinite(tempo_value) else 0.0),
            "sampleRate": int(sr),
            "hopLength": int(args.hop_length),
            "duration": round6(duration),
            "beatCount": len(beats),
            "beats": beats,
            "beatIntervals": beat_intervals,
            "slices": slices,
        }

        print(json.dumps(analysis))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
