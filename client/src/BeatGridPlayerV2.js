import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
  useCallback,
} from 'react';
import WaveSurfer from 'wavesurfer.js';
import './BeatGridPlayerV2.css';

function BeatGridPlayerV2({
  originalUrl,
  filename,
  stems = [],
  className = '',
}) {
  const containerRef = useRef(null);
  const wsRef = useRef(null);
  const [isReady, setIsReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(0.9);

  // Analysis state (v2)
  const [bpm, setBpm] = useState(null);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [gridOffsetSec, setGridOffsetSec] = useState(0);
  const [beatTimesSec, setBeatTimesSec] = useState([]);
  const [downbeatTimesSec, setDownbeatTimesSec] = useState([]);
  const [preferStem, setPreferStem] = useState('drums'); // drums | instrumental | none
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState('');

  const availableStemTypes = useMemo(
    () => Array.from(new Set(stems.map((s) => s.type))).filter(Boolean),
    [stems]
  );

  useEffect(() => {
    if (!containerRef.current || !originalUrl) return;

    const ws = WaveSurfer.create({
      container: containerRef.current,
      waveColor: 'rgba(255,255,255,0.25)',
      progressColor: 'rgba(80,160,255,0.8)',
      cursorColor: 'rgba(255,255,255,0.6)',
      cursorWidth: 1,
      height: 120,
      normalize: true,
      dragToSeek: true,
      partialRender: true,
    });

    wsRef.current = ws;
    ws.load(originalUrl);

    ws.on('ready', () => {
      setIsReady(true);
      setDuration(ws.getDuration() || 0);
      try {
        ws.setVolume(volume);
      } catch (_) {}
    });

    ws.on('timeupdate', (t) => setCurrentTime(t));
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    return () => {
      try {
        ws.destroy();
      } catch (_) {}
      wsRef.current = null;
    };
  }, [originalUrl]);

  const handlePlayPause = useCallback(() => {
    const ws = wsRef.current;
    if (!ws) return;
    if (ws.isPlaying()) ws.pause();
    else ws.play();
  }, []);

  const handleSeek = useCallback(
    (seconds) => {
      const ws = wsRef.current;
      if (!ws || !duration || duration <= 0) return;
      const clamped = Math.max(0, Math.min(seconds, duration));
      const progress = clamped / duration;
      try {
        ws.seekTo(progress);
      } catch (_) {}
    },
    [duration]
  );

  const handleVolume = useCallback((v) => {
    const ws = wsRef.current;
    setVolume(v);
    try {
      ws && ws.setVolume(v);
    } catch (_) {}
  }, []);

  // Call v2 analysis endpoint
  const analyze = useCallback(async () => {
    if (!filename) return;
    setAnalyzing(true);
    setAnalysisError('');
    try {
      const res = await fetch('/api/analyze-beatgrid-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename, preferStem }),
      });
      if (!res.ok) throw new Error('analysis failed');
      const data = await res.json();
      const a = data && data.analysis;
      if (a) {
        setBpm(a.bpm ?? null);
        setBeatsPerBar(a.beatsPerBar ?? 4);
        setGridOffsetSec(a.gridOffsetSec ?? 0);
        setBeatTimesSec(Array.isArray(a.beatTimesSec) ? a.beatTimesSec : []);
        setDownbeatTimesSec(
          Array.isArray(a.downbeatTimesSec) ? a.downbeatTimesSec : []
        );
      }
    } catch (e) {
      setAnalysisError(e.message || 'analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }, [filename, preferStem]);

  // Render beat grid overlay positions
  const gridLines = useMemo(() => {
    if (!duration || duration <= 0) return [];
    const lines = [];
    const width = 1; // css will handle hairline

    // Prefer explicit beat times if available
    if (beatTimesSec && beatTimesSec.length) {
      for (const t of beatTimesSec) {
        if (t < 0 || t > duration) continue;
        lines.push({ time: t, type: 'beat' });
      }
    } else if (bpm && bpm > 0) {
      const period = 60 / bpm;
      let t = gridOffsetSec || 0;
      // Walk across duration
      while (t <= duration) {
        lines.push({ time: t, type: 'beat' });
        t += period;
      }
    }

    // Mark downbeats if we have them, otherwise every Nth beat
    if (downbeatTimesSec && downbeatTimesSec.length) {
      for (const t of downbeatTimesSec) {
        if (t < 0 || t > duration) continue;
        lines.push({ time: t, type: 'downbeat' });
      }
    } else if (beatsPerBar && beatsPerBar > 1 && beatTimesSec.length) {
      for (let i = 0; i < beatTimesSec.length; i += beatsPerBar) {
        const t = beatTimesSec[i];
        if (t < 0 || t > duration) continue;
        lines.push({ time: t, type: 'downbeat' });
      }
    }

    return lines;
  }, [
    duration,
    bpm,
    gridOffsetSec,
    beatTimesSec,
    downbeatTimesSec,
    beatsPerBar,
  ]);

  return (
    <div className={`bgp2 ${className}`}>
      <div className="bgp2-toolbar">
        <button onClick={handlePlayPause} disabled={!isReady}>
          {isPlaying ? 'pause' : 'play'}
        </button>
        <span className="bgp2-time">
          {currentTime.toFixed(2)} / {duration.toFixed(2)}
        </span>
        <label className="bgp2-vol">
          vol
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => handleVolume(parseFloat(e.target.value))}
          />
        </label>
        <div className="bgp2-sep" />
        <label>
          prefer stem
          <select
            value={preferStem}
            onChange={(e) => setPreferStem(e.target.value)}
          >
            <option value="drums">drums</option>
            <option value="instrumental">instrumental</option>
            <option value="none">none</option>
          </select>
        </label>
        <button onClick={analyze} disabled={!filename || analyzing}>
          {analyzing ? 'analyzing…' : 'analyze (v2)'}
        </button>
        {bpm ? <span className="bgp2-meta">bpm: {bpm}</span> : null}
        {analysisError ? (
          <span className="bgp2-error">{analysisError}</span>
        ) : null}
      </div>

      <div className="bgp2-wave-wrap">
        <div className="bgp2-wave" ref={containerRef} />
        {/* overlay */}
        <div className="bgp2-grid">
          {gridLines.map((g, idx) => (
            <div
              key={idx}
              className={
                g.type === 'downbeat'
                  ? 'bgp2-grid-line downbeat'
                  : 'bgp2-grid-line'
              }
              style={{ left: `${(g.time / Math.max(1e-6, duration)) * 100}%` }}
            />
          ))}
        </div>
      </div>

      {/* Controls to fine-tune grid start */}
      <div className="bgp2-grid-controls">
        <label>
          start offset (s)
          <input
            type="number"
            step="0.01"
            value={gridOffsetSec}
            onChange={(e) => setGridOffsetSec(parseFloat(e.target.value) || 0)}
          />
        </label>
        <button onClick={() => handleSeek(gridOffsetSec)} disabled={!isReady}>
          jump to start
        </button>
      </div>
    </div>
  );
}

export default BeatGridPlayerV2;
