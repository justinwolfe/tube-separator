#!/usr/bin/env python3
import argparse
import json
import math
import os
import sys
import tempfile
import subprocess
from typing import List, Tuple

# Dependencies: librosa, numpy, soundfile
try:
	import numpy as np
	import librosa
except Exception as e:
	sys.stderr.write(
		"Missing Python dependencies for v2 analyzer. Install: pip3 install librosa numpy soundfile\n"
	)
	raise


def _decode_to_wav(input_path: str) -> Tuple[str, bool]:
	"""Decode any audio file to mono 44.1kHz wav via ffmpeg; return path and deletion flag."""
	ext = os.path.splitext(input_path)[1].lower()
	if ext == ".wav":
		return input_path, False

	ffmpeg_bin = os.environ.get("FFMPEG", "ffmpeg")
	fd, tmp_path = tempfile.mkstemp(suffix=".wav")
	os.close(fd)
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
		subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
		return tmp_path, True
	except subprocess.CalledProcessError as e:
		try:
			os.remove(tmp_path)
		except Exception:
			pass
		raise RuntimeError(
			f"ffmpeg decode failed: {e.stderr.decode('utf-8', errors='ignore')}"
		)


def _infer_downbeats_from_beats(beat_times: List[float], beats_per_bar: int = 4) -> List[float]:
	"""Heuristic: treat every Nth beat as downbeat; return subset of beat times.
	If beats are sparse or N < 1, returns empty list."""
	if not beat_times or beats_per_bar < 1:
		return []
	return [beat_times[i] for i in range(0, len(beat_times), beats_per_bar)]


def analyze_v2(audio_path: str, prefer_stem: str = "none") -> dict:
	"""Compute tempo, beat grid, and downbeats with librosa.

	prefer_stem is kept for future multi-track logic; not used by this pure file analyzer.
	"""
	wav_path, should_delete = _decode_to_wav(audio_path)
	try:
		y, sr = librosa.load(wav_path, sr=None, mono=True)
		# Stronger onset envelope using mel spectrogram with log-amplitude
		hop_length = 512
		S = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop_length))
		mel = librosa.feature.melspectrogram(S=S, sr=sr)
		log_mel = librosa.power_to_db(mel, ref=np.max)
		onset_env = librosa.onset.onset_strength(S=log_mel, sr=sr)

		# Estimate tempo and beats
		tempo, beat_frames = librosa.beat.beat_track(
			sr=sr, onset_envelope=onset_env, hop_length=hop_length
		)
		beat_times = librosa.frames_to_time(beat_frames, sr=sr, hop_length=hop_length)
		beat_times = beat_times.tolist()

		# BPM rounding
		bpm = float(np.round(float(tempo), 1)) if tempo is not None else None

		# Estimate downbeats heuristically
		beats_per_bar = 4
		downbeat_times = _infer_downbeats_from_beats(beat_times, beats_per_bar)

		# Grid offset from first beat within period
		offset = 0.0
		if bpm and bpm > 0 and beat_times:
			period = 60.0 / bpm
			off = float(beat_times[0]) % period
			offset = 0.0 if abs(off) < 0.02 else float(off)

		# Confidence based on inter-beat interval stability
		confidence = None
		if len(beat_times) >= 3:
			diffs = np.diff(beat_times)
			if np.all(diffs > 0):
				confidence = float(
					np.clip(1.0 - (np.std(diffs) / (np.mean(diffs) + 1e-6)), 0.0, 1.0)
				)

		return {
			"bpm": bpm,
			"gridOffsetSec": offset,
			"beatsPerBar": beats_per_bar,
			"beatTimesSec": beat_times,
			"downbeatTimesSec": downbeat_times,
			"confidence": confidence,
			"analyzer": "librosa_v2_beats_downbeats",
		}
	finally:
		if should_delete:
			try:
				os.remove(wav_path)
			except Exception:
				pass


def main():
	p = argparse.ArgumentParser(description="Analyze BPM/beat grid (v2)")
	p.add_argument("--path", required=True, help="Path to audio file (wav/mp3/etc)")
	p.add_argument("--preferStem", default="none", help="Hint: drums|instrumental|none")
	args = p.parse_args()

	try:
		result = analyze_v2(args.path, prefer_stem=args.preferStem)
		print(json.dumps(result))
	except Exception as e:
		sys.stderr.write(json.dumps({"error": str(e)}) + "\n")
		sys.exit(1)


if __name__ == "__main__":
	main() 