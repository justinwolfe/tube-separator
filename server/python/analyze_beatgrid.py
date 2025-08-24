#!/usr/bin/env python3
import argparse
import json
import math
import sys
import os
import tempfile
import subprocess
from typing import Tuple

# Lazy import heavy deps to give a clearer error if missing
try:
    import numpy as np
    import librosa
except Exception as e:
    sys.stderr.write(
        "Missing Python dependencies. Please install with: pip3 install librosa numpy soundfile\n"
    )
    raise


def _decode_to_wav(input_path: str) -> Tuple[str, bool]:
    """Return a path to a WAV file for the given input.

    If input is already a WAV, return it with delete=False. Otherwise,
    use ffmpeg to convert to a temporary mono 44.1kHz WAV and return its path
    with delete=True so caller can clean it up.
    """
    ext = os.path.splitext(input_path)[1].lower()
    if ext == ".wav":
        return input_path, False

    # Ensure ffmpeg exists
    ffmpeg_bin = os.environ.get("FFMPEG", "ffmpeg")

    tmp_fd, tmp_path = tempfile.mkstemp(suffix=".wav")
    os.close(tmp_fd)

    cmd = [
        ffmpeg_bin,
        "-y",
        "-i",
        input_path,
        "-ac",
        "1",
        "-ar",
        "44100",
        "-f",
        "wav",
        tmp_path,
    ]
    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            check=True,
        )
        return tmp_path, True
    except subprocess.CalledProcessError as e:
        try:
            os.remove(tmp_path)
        except Exception:
            pass
        raise RuntimeError(
            f"ffmpeg failed to decode input: {e.stderr.decode('utf-8', errors='ignore')}"
        )


def analyze(audio_path: str) -> dict:
    # Decode to WAV first to avoid audioread/aifc dependency paths on MP3/M4A
    wav_path, should_delete = _decode_to_wav(audio_path)
    try:
        # Load audio; mono for beat tracking, preserve native sr
        y, sr = librosa.load(wav_path, sr=None, mono=True)

        # Onset envelope and tempo/beat tracking
        hop_length = 512
        onset_env = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop_length)
        tempo, beat_frames = librosa.beat.beat_track(
            sr=sr, onset_envelope=onset_env, hop_length=hop_length
        )

        beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)
        beat_times = beat_times.tolist()

        # BPM from librosa is already a float; round to 0.1 for stability
        bpm = float(np.round(float(tempo), 1)) if tempo is not None else None

        # Estimate grid offset as the first detected beat time modulo beat period
        offset = 0.0
        if bpm and bpm > 0 and beat_times:
            beat_period = 60.0 / bpm
            raw = float(beat_times[0])
            # Ensure offset is in [0, beat_period)
            offset = float(raw % beat_period)
            # Small offsets (< 20 ms) likely noise; snap to 0
            if abs(offset) < 0.02:
                offset = 0.0

        # Provide a rough confidence based on beat interval stability
        stability = None
        if len(beat_times) >= 3:
            diffs = np.diff(beat_times)
            if np.all(diffs > 0):
                stability = float(
                    np.clip(1.0 - (np.std(diffs) / (np.mean(diffs) + 1e-6)), 0.0, 1.0)
                )

        result = {
            "bpm": bpm,
            "gridOffsetSec": offset,
            "beatsPerBar": 4,  # heuristic default; user can adjust in UI
            "beatTimesSec": beat_times,
            "confidence": stability,
            "analyzer": "librosa_beat_track_v1",
        }
        return result
    finally:
        if should_delete:
            try:
                os.remove(wav_path)
            except Exception:
                pass


def main():
    parser = argparse.ArgumentParser(description="Analyze BPM and beat grid for an audio file")
    parser.add_argument("--path", required=True, help="Path to audio file (wav/mp3/etc)")
    args = parser.parse_args()

    try:
        result = analyze(args.path)
        print(json.dumps(result))
    except Exception as e:
        # Return a JSON error to stderr and non-zero exit
        sys.stderr.write(json.dumps({"error": str(e)}) + "\n")
        sys.exit(1)


if __name__ == "__main__":
    main() 