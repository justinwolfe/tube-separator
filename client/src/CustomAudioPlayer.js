import React, { useState, useRef, useEffect, useCallback } from 'react';
import './CustomAudioPlayer.css';
import WaveSurfer from 'wavesurfer.js';
import RegionsPlugin from 'wavesurfer.js/dist/plugins/regions.esm.js';

const CustomAudioPlayer = ({
  originalTrack,
  stems = [],
  title,
  className = '',
  transcript = null,
  onSeekToTime,
  originalFilename = null,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [activeStem, setActiveStem] = useState('original');
  const [stemVolumes, setStemVolumes] = useState({});
  const [isDragging, setIsDragging] = useState(false);
  const [dragTime, setDragTime] = useState(0);
  const [showTranscript, setShowTranscript] = useState(false);

  // Beat grid and loop state
  const [bpm, setBpm] = useState(120);
  const [beatsPerBar, setBeatsPerBar] = useState(4);
  const [gridEnabled, setGridEnabled] = useState(true);
  const [gridOffsetSec, setGridOffsetSec] = useState(0);
  const [activeRegionId, setActiveRegionId] = useState(null);
  const [gridDragEnabled, setGridDragEnabled] = useState(false);

  // Audio refs
  const originalAudioRef = useRef(null);
  const stemAudioRefs = useRef({});
  const timelineRef = useRef(null);
  const waveformRef = useRef(null);
  const wavesurferRef = useRef(null);
  const regionsPluginRef = useRef(null);
  const gridOverlayRef = useRef(null);
  const waveformScrollRef = useRef(null);
  const waveformContentRef = useRef(null);

  // Performance refs
  const animationFrameRef = useRef(null);
  const lastUpdateTimeRef = useRef(0);
  const lastBpmUpdateTimeRef = useRef(0);

  // Resize observer to recompute grid
  const waveformWidthRef = useRef(0);

  // Zoom state: 1 = fit, >1 = zoomed in
  const [zoom, setZoom] = useState(1);
  const [contentWidthPx, setContentWidthPx] = useState(0);
  const prevContentWidthRef = useRef(0);

  // Initialize stem volumes
  useEffect(() => {
    const initialVolumes = {};
    stems.forEach((stem) => {
      initialVolumes[stem.type] = 0.8;
    });
    setStemVolumes(initialVolumes);
  }, [stems]);

  // Set up audio elements
  useEffect(() => {
    const originalAudio = originalAudioRef.current;
    if (!originalAudio) return;

    const handleLoadedMetadata = () => {
      setDuration(originalAudio.duration);
    };

    const handleTimeUpdate = () => {
      if (!isDragging) {
        setCurrentTime(originalAudio.currentTime);
        // Keep waveform in sync if playing via HTMLAudio
        if (wavesurferRef.current && !wavesurferRef.current.isPlaying()) {
          const ws = wavesurferRef.current;
          const wsDuration = ws.getDuration() || 0;
          if (wsDuration > 0) {
            ws.seekTo(originalAudio.currentTime / wsDuration);
          }
        }
      }
    };

    originalAudio.addEventListener('loadedmetadata', handleLoadedMetadata);
    originalAudio.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      originalAudio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      originalAudio.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [originalTrack, isDragging]);

  // Initialize WaveSurfer + Regions
  useEffect(() => {
    if (!waveformRef.current || !originalTrack) return;

    const ws = WaveSurfer.create({
      container: waveformRef.current,
      waveColor: 'rgba(255, 255, 255, 0.25)',
      progressColor: 'rgba(255, 255, 255, 0.8)',
      cursorColor: 'rgba(255, 255, 255, 0.6)',
      cursorWidth: 1,
      barWidth: 2,
      barGap: 1,
      barRadius: 0,
      height: 96,
      normalize: true,
      interact: true,
      partialRender: true,
      dragToSeek: true,
      backend: 'webaudio',
    });

    wavesurferRef.current = ws;

    // Register regions plugin
    const regions = ws.registerPlugin(RegionsPlugin.create());
    regions.enableDragSelection({
      color: 'rgba(80, 160, 255, 0.15)',
      resize: true,
      drag: true,
    });
    regionsPluginRef.current = regions;

    // Track active region for looping
    const handleRegionCreated = (region) => {
      // Snap to grid on create
      const snapped = snapRegion(region.start, region.end);
      if (snapped) {
        region.setOptions({ start: snapped.start, end: snapped.end });
      }
      // Set loop by default
      region.setOptions({ loop: true });
      setActiveRegionId(region.id);
    };

    const handleRegionUpdated = (region) => {
      // Snap to grid on update (drag/resize)
      const snapped = snapRegion(region.start, region.end);
      if (
        snapped &&
        (Math.abs(snapped.start - region.start) > 0.0005 ||
          Math.abs(snapped.end - region.end) > 0.0005)
      ) {
        region.setOptions({ start: snapped.start, end: snapped.end });
      }
    };

    const handleRegionIn = (region) => {
      setActiveRegionId(region.id);
    };

    const handleRegionOut = (region) => {
      // Manual loop management for HTMLAudio
      if (region.loop) {
        const loopTo = region.start;
        setCurrentTime(loopTo);
        syncAudioElements(loopTo);
        if (wavesurferRef.current) {
          const d = wavesurferRef.current.getDuration() || 0;
          if (d > 0)
            wavesurferRef.current.seekTo(Math.min(Math.max(loopTo / d, 0), 1));
          if (isPlaying && !wavesurferRef.current.isPlaying()) {
            try {
              wavesurferRef.current.play();
            } catch (_) {}
          }
        }
        const originalAudio = originalAudioRef.current;
        if (isPlaying && originalAudio && originalAudio.paused) {
          originalAudio.play().catch(() => {});
        }
      }
    };

    regions.on('region-created', handleRegionCreated);
    regions.on('region-updated', handleRegionUpdated);
    regions.on('region-in', handleRegionIn);
    regions.on('region-out', handleRegionOut);

    ws.load(originalTrack);

    // Sync durations
    ws.on('ready', () => {
      setDuration(ws.getDuration());
      // Mute WaveSurfer audio to use it as a visual-only transport
      try {
        ws.setMuted(true);
      } catch (e) {}
      // compute initial width for grid
      if (waveformScrollRef.current) {
        // Initialize content width to viewport width at zoom=1
        const viewport = waveformScrollRef.current.clientWidth || 0;
        const initialWidth = Math.max(0, Math.floor(viewport * zoom));
        setContentWidthPx(initialWidth);
        prevContentWidthRef.current = initialWidth;
        waveformWidthRef.current = initialWidth;
        // Apply initial zoom in pixels-per-second if duration is known
        const d = ws.getDuration() || 0;
        if (d > 0 && initialWidth > 0) {
          try {
            ws.zoom(initialWidth / d);
          } catch (_) {}
        }
      }
    });

    // Sync current time updates to React state and perform loop checks
    ws.on('timeupdate', (time) => {
      if (!isDragging) {
        setCurrentTime(time);
      }
      // If a looping region is active, ensure we loop
      const activeRegion = getActiveRegion();
      if (activeRegion && activeRegion.loop) {
        if (time >= activeRegion.end - 0.02) {
          const loopTo = activeRegion.start;
          setCurrentTime(loopTo);
          syncAudioElements(loopTo);
          const d = ws.getDuration() || 0;
          if (d > 0) ws.seekTo(Math.min(Math.max(loopTo / d, 0), 1));
        }
      }
    });

    // Handle seeking via waveform
    ws.on('seek', (progress) => {
      const target = progress * (ws.getDuration() || 0);
      setCurrentTime(target);
      setDragTime(target);
      syncAudioElements(target);
    });

    // Play/pause events
    ws.on('play', () => setIsPlaying(true));
    ws.on('pause', () => setIsPlaying(false));

    // Resize observer for grid overlay
    let ro;
    if ('ResizeObserver' in window && waveformRef.current) {
      ro = new ResizeObserver(() => {
        waveformWidthRef.current = waveformRef.current.clientWidth || 0;
      });
      ro.observe(waveformRef.current);
    }

    return () => {
      regions.unAll();
      ws.destroy();
      wavesurferRef.current = null;
      regionsPluginRef.current = null;
      if (ro && waveformRef.current) ro.unobserve(waveformRef.current);
    };
  }, [originalTrack]);

  // Maintain zoomed content width and sync WaveSurfer zoom; preserve scroll position
  useEffect(() => {
    const scrollEl = waveformScrollRef.current;
    const ws = wavesurferRef.current;
    if (!scrollEl || !duration) return;

    const viewportWidth = scrollEl.clientWidth || 0;
    if (viewportWidth <= 0) return;

    // Compute current center time (to preserve on zoom changes)
    const prevContentWidth = prevContentWidthRef.current || viewportWidth;
    const currentScrollLeft = scrollEl.scrollLeft || 0;
    const centerPx = currentScrollLeft + viewportWidth / 2;
    const centerTime =
      duration > 0 ? (centerPx / prevContentWidth) * duration : 0;

    // Compute new content width
    const newContentWidth = Math.max(
      viewportWidth,
      Math.floor(viewportWidth * Math.max(1, zoom))
    );
    setContentWidthPx(newContentWidth);
    waveformWidthRef.current = newContentWidth;
    prevContentWidthRef.current = newContentWidth;

    // Sync WaveSurfer zoom in pixels-per-second
    if (ws && duration > 0) {
      const pps = newContentWidth / duration;
      try {
        ws.zoom(pps);
      } catch (_) {}
    }

    // Restore scroll to keep same center time in view
    if (duration > 0) {
      const targetCenterPx = (centerTime / duration) * newContentWidth;
      const targetScrollLeft = Math.max(
        0,
        Math.min(
          targetCenterPx - viewportWidth / 2,
          newContentWidth - viewportWidth
        )
      );
      scrollEl.scrollLeft = isFinite(targetScrollLeft) ? targetScrollLeft : 0;
    }
  }, [zoom, duration]);

  // Observe viewport resize to recompute content width and keep zoom consistent
  useEffect(() => {
    if (!('ResizeObserver' in window)) return;
    const el = waveformScrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      // Trigger zoom effect by toggling a no-op state update
      setContentWidthPx((w) => w);
      setGridOffsetSec((s) => s + 0);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Helper: get active region instance
  const getActiveRegion = () => {
    const regions = regionsPluginRef.current;
    if (!regions || !activeRegionId) return null;
    return regions.getRegions().find((r) => r.id === activeRegionId) || null;
  };

  // Compute beat duration
  const beatDurationSec = bpm > 0 ? 60 / bpm : 0;

  // Snap helpers
  const snapTime = useCallback(
    (time) => {
      if (!gridEnabled || beatDurationSec <= 0) return time;
      const relative = time - gridOffsetSec;
      const beats = Math.round(relative / beatDurationSec);
      return beats * beatDurationSec + gridOffsetSec;
    },
    [gridEnabled, beatDurationSec, gridOffsetSec]
  );

  const snapRegion = useCallback(
    (start, end) => {
      if (start == null || end == null) return null;
      const s = Math.max(0, Math.min(duration, snapTime(start)));
      const e = Math.max(0, Math.min(duration, snapTime(end)));
      if (e <= s)
        return { start: s, end: Math.min(duration, s + beatDurationSec || 0) };
      return { start: s, end: e };
    },
    [duration, snapTime, beatDurationSec]
  );

  // Sync all audio elements
  const syncAudioElements = useCallback((time) => {
    const originalAudio = originalAudioRef.current;
    if (originalAudio && !isNaN(time) && time >= 0) {
      originalAudio.currentTime = time;
    }

    Object.values(stemAudioRefs.current).forEach((audio) => {
      if (audio && !isNaN(time) && time >= 0) {
        audio.currentTime = time;
      }
    });

    // Sync waveform position
    if (wavesurferRef.current) {
      const ws = wavesurferRef.current;
      const wsDuration = ws.getDuration() || 0;
      if (wsDuration > 0) {
        ws.seekTo(Math.min(Math.max(time / wsDuration, 0), 1));
      }
    }
  }, []);

  // Play/Pause functionality
  const togglePlayPause = async () => {
    const originalAudio = originalAudioRef.current;
    if (!originalAudio) return;

    try {
      if (isPlaying) {
        originalAudio.pause();
        Object.values(stemAudioRefs.current).forEach((audio) => {
          if (audio) audio.pause();
        });
        if (wavesurferRef.current && wavesurferRef.current.isPlaying()) {
          try {
            wavesurferRef.current.pause();
          } catch (_) {}
        }
        setIsPlaying(false);
      } else {
        // If looping region exists and currentTime is outside it, start at region.start
        const activeRegion = getActiveRegion();
        let startTime =
          lastBeatClickTime != null ? lastBeatClickTime : currentTime;
        // Fallback to region start only if we don't have a recent beat click and we're outside region
        if (
          lastBeatClickTime == null &&
          activeRegion &&
          (currentTime < activeRegion.start || currentTime > activeRegion.end)
        ) {
          startTime = activeRegion.start;
        }

        setCurrentTime(startTime);
        syncAudioElements(startTime);

        // Sync time before playing
        syncAudioElements(startTime);

        // Play active audio(s)
        if (activeStem === 'original') {
          await originalAudio.play().catch(() => {});
          if (wavesurferRef.current && !wavesurferRef.current.isPlaying()) {
            const ws = wavesurferRef.current;
            const wsDuration = ws.getDuration() || 0;
            if (wsDuration > 0) ws.seekTo(startTime / wsDuration);
            try {
              ws.play();
            } catch (_) {}
          }
        } else if (activeStem === 'all') {
          await originalAudio.play().catch(() => {});
          await Promise.all(
            stems.map(async (stem) => {
              const audio = stemAudioRefs.current[stem.type];
              if (audio) {
                return audio.play().catch(() => {});
              }
            })
          );
          if (wavesurferRef.current && !wavesurferRef.current.isPlaying()) {
            const ws = wavesurferRef.current;
            const wsDuration = ws.getDuration() || 0;
            if (wsDuration > 0) ws.seekTo(startTime / wsDuration);
            try {
              ws.play();
            } catch (_) {}
          }
        } else {
          const stemAudio = stemAudioRefs.current[activeStem];
          if (stemAudio) {
            await stemAudio.play().catch(() => {});
          }
          if (wavesurferRef.current && !wavesurferRef.current.isPlaying()) {
            const ws = wavesurferRef.current;
            const wsDuration = ws.getDuration() || 0;
            if (wsDuration > 0) ws.seekTo(startTime / wsDuration);
            try {
              ws.play();
            } catch (_) {}
          }
        }
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Playback error:', error);
    }
  };

  // Get position from mouse or touch event
  const getEventPosition = (e) => {
    if (e.touches && e.touches[0]) {
      return e.touches[0].clientX;
    }
    return e.clientX;
  };

  // Calculate time from position
  const getTimeFromPosition = useCallback(
    (positionX, rect) => {
      const percentage = Math.max(0, Math.min(positionX / rect.width, 1));
      return percentage * duration;
    },
    [duration]
  );

  // Throttled visual update using requestAnimationFrame
  const updateTimelineVisually = useCallback((newTime) => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
    }

    animationFrameRef.current = requestAnimationFrame(() => {
      setDragTime(newTime);
    });
  }, []);

  // Handle timeline click (immediate audio seek)
  const handleTimelineClick = (e) => {
    if (isDragging) return; // Don't handle clicks during drag
    e.preventDefault();
    if (!timelineRef.current || !duration) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const positionX = getEventPosition(e) - rect.left;
    const newTime = getTimeFromPosition(positionX, rect);

    setCurrentTime(newTime);
    setDragTime(newTime);
    syncAudioElements(newTime);
    if (wavesurferRef.current) {
      const ws = wavesurferRef.current;
      const wsDuration = ws.getDuration() || 0;
      if (wsDuration > 0) ws.seekTo(newTime / wsDuration);
    }
  };

  // Handle timeline drag (visual updates only, throttled)
  const handleTimelineDrag = (e) => {
    if (!isDragging || !timelineRef.current || !duration) return;
    e.preventDefault();

    const now = performance.now();
    if (now - lastUpdateTimeRef.current < 16) return; // Throttle to ~60fps
    lastUpdateTimeRef.current = now;

    const rect = timelineRef.current.getBoundingClientRect();
    const dragX = getEventPosition(e) - rect.left;
    const newTime = getTimeFromPosition(dragX, rect);

    // Only update visual state during drag, not audio
    updateTimelineVisually(newTime);
    if (wavesurferRef.current) {
      const ws = wavesurferRef.current;
      const wsDuration = ws.getDuration() || 0;
      if (wsDuration > 0)
        ws.seekTo(Math.min(Math.max(newTime / wsDuration, 0), 1));
    }
  };

  const startDragging = (e) => {
    e.preventDefault();
    if (!timelineRef.current || !duration) return;

    setIsDragging(true);
    const rect = timelineRef.current.getBoundingClientRect();
    const positionX = getEventPosition(e) - rect.left;
    const newTime = getTimeFromPosition(positionX, rect);

    setDragTime(newTime);
    updateTimelineVisually(newTime);
  };

  const stopDragging = useCallback(() => {
    if (isDragging) {
      setIsDragging(false);

      // Cancel any pending animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }

      // Sync audio to final position
      const finalTime = dragTime;
      setCurrentTime(finalTime);
      syncAudioElements(finalTime);
      if (wavesurferRef.current) {
        const ws = wavesurferRef.current;
        const wsDuration = ws.getDuration() || 0;
        if (wsDuration > 0)
          ws.seekTo(Math.min(Math.max(finalTime / wsDuration, 0), 1));
      }
    }
  }, [isDragging, dragTime, syncAudioElements]);

  // Touch event handlers
  const handleTouchStart = (e) => {
    startDragging(e);
  };

  const handleTouchMove = (e) => {
    handleTimelineDrag(e);
  };

  const handleTouchEnd = () => {
    stopDragging();
  };

  // Cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  // Handle stem selection
  const handleStemToggle = async (stemType) => {
    const originalAudio = originalAudioRef.current;
    const wasPlaying = isPlaying;

    if (!wasPlaying) {
      // If not playing, just switch the active stem
      setActiveStem(stemType);
      return;
    }

    try {
      // Store current time before switching
      const currentPlayTime = originalAudio
        ? originalAudio.currentTime
        : currentTime;

      // Pause all current audio
      if (originalAudio) originalAudio.pause();
      Object.values(stemAudioRefs.current).forEach((audio) => {
        if (audio) audio.pause();
      });
      if (wavesurferRef.current && wavesurferRef.current.isPlaying()) {
        try {
          wavesurferRef.current.pause();
        } catch (_) {}
      }

      // Sync all audio to current time for seamless switching
      syncAudioElements(currentPlayTime);

      // Small delay to ensure sync is complete
      await new Promise((resolve) => setTimeout(resolve, 10));

      // Update active stem
      setActiveStem(stemType);

      // Immediately start playing the new selection
      if (stemType === 'original') {
        if (originalAudio) {
          await originalAudio.play().catch(() => {});
        }
      } else {
        const stemAudio = stemAudioRefs.current[stemType];
        if (stemAudio) {
          await stemAudio.play().catch(() => {});
        }
      }

      if (wavesurferRef.current) {
        const ws = wavesurferRef.current;
        const wsDuration = ws.getDuration() || 0;
        if (wsDuration > 0) ws.seekTo(currentPlayTime / wsDuration);
        try {
          ws.play();
        } catch (_) {}
      }
    } catch (error) {
      console.error('Error switching stems:', error);
      // If there's an error, fall back to paused state
      setIsPlaying(false);
    }
  };

  // Volume controls
  const handleVolumeChange = (value) => {
    setVolume(value);
    const originalAudio = originalAudioRef.current;
    if (originalAudio) {
      originalAudio.volume = value;
    }
  };

  // Seek functionality
  const seekBackward = () => {
    const originalAudio = originalAudioRef.current;
    if (originalAudio) {
      const newTime = Math.max(0, currentTime - 5);
      setCurrentTime(newTime);
      syncAudioElements(newTime);
      if (wavesurferRef.current) {
        const ws = wavesurferRef.current;
        const wsDuration = ws.getDuration() || 0;
        if (wsDuration > 0) ws.seekTo(newTime / wsDuration);
      }
    }
  };

  const seekForward = () => {
    const originalAudio = originalAudioRef.current;
    if (originalAudio) {
      const newTime = Math.min(duration, currentTime + 5);
      setCurrentTime(newTime);
      syncAudioElements(newTime);
      if (wavesurferRef.current) {
        const ws = wavesurferRef.current;
        const wsDuration = ws.getDuration() || 0;
        if (wsDuration > 0) ws.seekTo(newTime / wsDuration);
      }
    }
  };

  // Handle transcript word click
  const handleTranscriptWordClick = (time) => {
    if (onSeekToTime) {
      onSeekToTime(time);
    }
    setCurrentTime(time);
    syncAudioElements(time);
    if (wavesurferRef.current) {
      const ws = wavesurferRef.current;
      const wsDuration = ws.getDuration() || 0;
      if (wsDuration > 0) ws.seekTo(time / wsDuration);
    }
  };

  // Beat grid overlay rendering
  const [gridLines, setGridLines] = useState([]);

  // Precompute handle positions (bars only plus beats)
  const [gridHandles, setGridHandles] = useState([]);
  const [startHandle, setStartHandle] = useState(null);
  const [lastBeatClickTime, setLastBeatClickTime] = useState(null);

  useEffect(() => {
    if (!gridEnabled || duration <= 0 || !waveformRef.current) {
      setGridLines([]);
      setGridHandles([]);
      setStartHandle(null);
      return;
    }
    const containerWidth =
      contentWidthPx || waveformRef.current.clientWidth || 0;
    waveformWidthRef.current = containerWidth;

    const lines = [];
    const handles = [];
    const beat = beatDurationSec;
    if (beat <= 0) {
      setGridLines([]);
      setGridHandles([]);
      setStartHandle(null);
      return;
    }

    // Start handle at exact offset if visible
    const startX = (gridOffsetSec / duration) * containerWidth;
    if (gridOffsetSec >= 0 && gridOffsetSec <= duration) {
      setStartHandle({ x: startX, time: gridOffsetSec });
    } else {
      setStartHandle(null);
    }

    // Start bars at offset and extend forward only
    const nStart = 0;
    const nEnd = Math.floor((duration - gridOffsetSec) / beat);

    for (let n = nStart; n <= nEnd; n++) {
      const t = gridOffsetSec + n * beat;
      const x = (t / duration) * containerWidth;
      const isBar = n % beatsPerBar === 0;
      lines.push({ x, isBar, time: t });
      if (isBar) {
        const barIndex = Math.floor(n / beatsPerBar);
        // Skip duplicating the start handle at n=0; it's rendered separately
        if (n !== 0) handles.push({ x, isBar, time: t, barIndex });
      }
    }

    setGridLines(lines);
    setGridHandles(handles);
  }, [
    gridEnabled,
    beatDurationSec,
    beatsPerBar,
    gridOffsetSec,
    duration,
    contentWidthPx,
  ]);

  useEffect(() => {
    const handleResize = () => {
      if (!waveformRef.current) return;
      const containerWidth = waveformRef.current.clientWidth || 0;
      if (containerWidth !== waveformWidthRef.current) {
        waveformWidthRef.current = containerWidth;
        // trigger recompute by updating state dependency
        setGridOffsetSec((s) => s + 0);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Handle clicking on a top handle to set or adjust loop region between adjacent beats
  const handleHandleClick = (time) => {
    if (!regionsPluginRef.current || !duration) return;
    const regions = regionsPluginRef.current;
    // Include the start offset as a valid beat so the yellow handle is respected
    const beats = [gridOffsetSec, ...gridHandles.map((h) => h.time)]
      .filter((t) => t >= 0 && t <= duration)
      .sort((a, b) => a - b);
    if (beats.length < 2) return;

    // Find nearest beat index
    let idx = 0;
    let best = Infinity;
    for (let i = 0; i < beats.length; i++) {
      const d = Math.abs(beats[i] - time);
      if (d < best) {
        best = d;
        idx = i;
      }
    }

    const start = beats[idx];
    const next = beats[Math.min(idx + beatsPerBar, beats.length - 1)]; // default one bar
    const snapped = snapRegion(start, next);

    // Remember last clicked beat for play
    setLastBeatClickTime(snapped.start);

    // If there's an active region, update it; else create new
    const existing = getActiveRegion();
    if (existing) {
      existing.setOptions({
        start: snapped.start,
        end: snapped.end,
        loop: true,
      });
    } else {
      const added = regions.addRegion({
        start: snapped.start,
        end: snapped.end,
        color: 'rgba(80, 160, 255, 0.15)',
        loop: true,
        drag: true,
        resize: true,
      });
      if (added) setActiveRegionId(added.id);
    }

    // Seek to start for immediate feedback
    setCurrentTime(snapped.start);
    syncAudioElements(snapped.start);
  };

  // Grid drag to change phase/offset
  const gridDragRef = useRef({ dragging: false, startX: 0, startOffset: 0 });
  const onGridMouseDown = (e) => {
    if (
      !gridEnabled ||
      !waveformRef.current ||
      duration <= 0 ||
      !gridDragEnabled
    )
      return;
    e.preventDefault();
    const rect = waveformContentRef.current
      ? waveformContentRef.current.getBoundingClientRect()
      : waveformRef.current.getBoundingClientRect();
    gridDragRef.current = {
      dragging: true,
      startX: e.clientX,
      startOffset: gridOffsetSec,
      rect,
      secondsPerPixel:
        duration > 0 && (contentWidthPx || rect.width)
          ? duration / (contentWidthPx || rect.width)
          : 0,
    };
    document.addEventListener('mousemove', onGridMouseMove);
    document.addEventListener('mouseup', onGridMouseUp);
  };
  const onGridMouseMove = (e) => {
    const st = gridDragRef.current;
    if (!st.dragging || !st.rect) return;
    const dx = e.clientX - st.startX;
    const spp = st.secondsPerPixel || 0;
    const newOffset = st.startOffset + dx * spp;
    setGridOffsetSec(newOffset);
  };
  const onGridMouseUp = () => {
    gridDragRef.current.dragging = false;
    document.removeEventListener('mousemove', onGridMouseMove);
    document.removeEventListener('mouseup', onGridMouseUp);
  };

  // Tap tempo
  const tapTimesRef = useRef([]);
  const handleTapTempo = () => {
    const now = performance.now();
    const times = tapTimesRef.current.filter((t) => now - t < 2500);
    times.push(now);
    tapTimesRef.current = times;
    if (times.length >= 2) {
      const intervals = [];
      for (let i = 1; i < times.length; i++)
        intervals.push(times[i] - times[i - 1]);
      const avgMs = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const newBpm = 60000 / avgMs;
      if (newBpm > 20 && newBpm < 300) setBpm(Math.round(newBpm));
    }
  };

  // Render formatted text with clickable words mapped from transcript.words
  const renderFormattedClickableTranscript = () => {
    if (!transcript || !transcript.formattedText || !transcript.words)
      return null;

    const lines = transcript.formattedText.split('\n');
    let wordIndex = 0;

    return (
      <div className="transcript-text">
        {lines.map((line, lineIdx) => {
          // Split into whitespace and non-whitespace tokens while preserving spaces
          const tokens = line.split(/(\s+)/);
          return (
            <div key={lineIdx}>
              {tokens.map((token, tokenIdx) => {
                if (token === '') return null;
                // Whitespace: render as-is
                if (/^\s+$/.test(token)) {
                  return <span key={`${lineIdx}-${tokenIdx}`}>{token}</span>;
                }

                // Non-whitespace: try to map to next word, preserving punctuation
                const leadingPunctMatch = token.match(/^[\(\[\{"'“‘]+/);
                const trailingPunctMatch = token.match(/[\)\]\}"'”’!?,\.:;]+$/);
                const leadingPunct = leadingPunctMatch
                  ? leadingPunctMatch[0]
                  : '';
                const trailingPunct = trailingPunctMatch
                  ? trailingPunctMatch[0]
                  : '';

                // Core token without surrounding punctuation
                const coreStart = leadingPunct.length;
                const coreEnd = token.length - trailingPunct.length;
                const core = token.slice(coreStart, coreEnd);

                if (wordIndex < transcript.words.length) {
                  const wordObj = transcript.words[wordIndex++];
                  const isActive =
                    currentTime >= wordObj.start && currentTime <= wordObj.end;

                  return (
                    <React.Fragment key={`${lineIdx}-${tokenIdx}`}>
                      {leadingPunct}
                      <span
                        className={`transcript-word ${
                          isActive ? 'active' : ''
                        }`}
                        onClick={() => handleTranscriptWordClick(wordObj.start)}
                        title={`${formatTime(wordObj.start)} - ${formatTime(
                          wordObj.end
                        )}`}
                      >
                        {wordObj.word}
                      </span>
                      {trailingPunct}
                    </React.Fragment>
                  );
                }

                // Fallback: render token if we ran out of words
                return <span key={`${lineIdx}-${tokenIdx}`}>{token}</span>;
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const handleStemVolumeChange = (stemType, value) => {
    setStemVolumes((prev) => ({
      ...prev,
      [stemType]: value,
    }));

    const stemAudio = stemAudioRefs.current[stemType];
    if (stemAudio) {
      stemAudio.volume = value;
    }
  };

  // Format time display
  const formatTime = (seconds) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  // Calculate progress percentage (use dragTime during drag, currentTime otherwise)
  const displayTime = isDragging ? dragTime : currentTime;
  const progressPercentage = duration > 0 ? (displayTime / duration) * 100 : 0;

  // Helper: get currently selected stem type for extraction
  const getSelectedStemType = () => {
    if (activeStem === 'original' || activeStem === 'all') return null;
    return activeStem;
  };

  // Create loop helper
  const createLoopBars = (bars = 1) => {
    const regions = regionsPluginRef.current;
    if (!regions || duration <= 0) return;
    const barLen = beatDurationSec * beatsPerBar * bars;
    const start = snapTime(currentTime);
    const end = Math.min(duration, start + (barLen || beatDurationSec));
    const snapped = snapRegion(start, end);
    const added = regions.addRegion({
      start: snapped.start,
      end: snapped.end,
      color: 'rgba(80, 160, 255, 0.15)',
      loop: true,
      drag: true,
      resize: true,
    });
    if (added) setActiveRegionId(added.id);
    setLastBeatClickTime(snapped.start);
  };

  // Extract loop via server
  const [extracting, setExtracting] = useState(false);
  const [lastExtractUrl, setLastExtractUrl] = useState(null);
  const handleExtractLoop = async () => {
    const activeRegion = getActiveRegion();
    if (!activeRegion || !originalFilename) return;
    setExtracting(true);
    setLastExtractUrl(null);
    try {
      const response = await fetch('/api/extract-loop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: originalFilename,
          start: activeRegion.start,
          end: activeRegion.end,
          stemType: getSelectedStemType(),
        }),
      });
      if (!response.ok) throw new Error('extract loop failed');
      const data = await response.json();
      setLastExtractUrl(data.downloadUrl || data.streamUrl);
    } catch (e) {
      console.error('extract loop error:', e);
      alert('failed to extract loop');
    } finally {
      setExtracting(false);
    }
  };

  // Handle dragging of bar handles to adjust BPM/offset
  const barHandleDragRef = useRef({
    dragging: false,
    barIndex: 0,
    startX: 0,
    rect: null,
    moved: false,
  });

  const onBarHandleMouseDown = (barIndex, time, clientX) => {
    if (!waveformRef.current || !gridEnabled) return;
    const rect = waveformContentRef.current
      ? waveformContentRef.current.getBoundingClientRect()
      : waveformRef.current.getBoundingClientRect();
    barHandleDragRef.current = {
      dragging: true,
      barIndex,
      startX: clientX,
      rect,
      moved: false,
      startScrollLeft: waveformScrollRef.current
        ? waveformScrollRef.current.scrollLeft
        : 0,
    };
    document.addEventListener('mousemove', onBarHandleMouseMove);
    document.addEventListener('mouseup', onBarHandleMouseUp);
  };

  const onBarHandleMouseMove = (e) => {
    const st = barHandleDragRef.current;
    if (!st.dragging || !st.rect || duration <= 0) return;
    const dx = e.clientX - st.startX;
    if (Math.abs(dx) > 2) st.moved = true;

    const width = contentWidthPx || st.rect.width || 1;
    const scrollLeft = waveformScrollRef.current
      ? waveformScrollRef.current.scrollLeft
      : 0;
    const viewportRelativeX = e.clientX - st.rect.left;
    const contentX = Math.max(
      0,
      Math.min(viewportRelativeX + scrollLeft, width)
    );
    const newTime = (contentX / width) * duration;

    if (st.barIndex === 0) {
      // Should not happen because start handle is rendered separately; still treat as offset
      setGridOffsetSec(Math.max(0, Math.min(duration, newTime)));
      return;
    }

    // Throttle updates to ~60fps
    const now = performance.now();
    if (now - lastBpmUpdateTimeRef.current < 16) return;
    lastBpmUpdateTimeRef.current = now;

    // Dragging any later bar adjusts BPM by changing beat duration from offset (barIndex bars away)
    const barsFromZero = st.barIndex; // number of bars from offset to this handle
    const newBarDuration = (newTime - gridOffsetSec) / barsFromZero; // seconds per bar
    const newBeatDuration = newBarDuration / beatsPerBar; // seconds per beat
    if (newBeatDuration > 0.01 && isFinite(newBeatDuration)) {
      const currentBeatDuration = beatDurationSec || 0;
      const delta = Math.abs(newBeatDuration - currentBeatDuration);
      const threshold = Math.max(0.0005, currentBeatDuration * 0.005);
      if (delta < threshold) return; // ignore tiny changes to reduce jitter
      const computedBpm = 60 / newBeatDuration;
      const clamped = Math.max(20, Math.min(300, computedBpm));
      const rounded = Math.round(clamped * 10) / 10; // 0.1 BPM precision for stability
      setBpm(rounded);
    }
  };

  const onBarHandleMouseUp = (e) => {
    const st = barHandleDragRef.current;
    if (!st.dragging) return;
    document.removeEventListener('mousemove', onBarHandleMouseMove);
    document.removeEventListener('mouseup', onBarHandleMouseUp);
    barHandleDragRef.current.dragging = false;

    // If it was a click (not a drag), create/update loop at nearest bar
    if (!st.moved) {
      const rect = st.rect;
      const width = contentWidthPx || rect?.width || 1;
      const scrollLeft = waveformScrollRef.current
        ? waveformScrollRef.current.scrollLeft
        : 0;
      const viewportRelativeX = e.clientX - (rect?.left || 0);
      const contentX = Math.max(
        0,
        Math.min(viewportRelativeX + scrollLeft, width)
      );
      const clickedTime = (contentX / width) * duration;
      handleHandleClick(clickedTime);
    }
  };

  // Start handle drag (offset only)
  const startHandleDragRef = useRef({
    dragging: false,
    rect: null,
    moved: false,
  });
  const onStartHandleMouseDown = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!waveformRef.current || !gridEnabled) return;
    const rect = waveformContentRef.current
      ? waveformContentRef.current.getBoundingClientRect()
      : waveformRef.current.getBoundingClientRect();
    startHandleDragRef.current = {
      dragging: true,
      rect,
      moved: false,
    };
    document.addEventListener('mousemove', onStartHandleMouseMove);
    document.addEventListener('mouseup', onStartHandleMouseUp);
  };
  const onStartHandleMouseMove = (e) => {
    const st = startHandleDragRef.current;
    if (!st.dragging || !st.rect || duration <= 0) return;
    const width = contentWidthPx || st.rect.width || 1;
    const scrollLeft = waveformScrollRef.current
      ? waveformScrollRef.current.scrollLeft
      : 0;
    const viewportRelativeX = e.clientX - st.rect.left;
    const contentX = Math.max(
      0,
      Math.min(viewportRelativeX + scrollLeft, width)
    );
    const newTime = (contentX / width) * duration;
    st.moved = true;
    // Clamp offset within [0, duration]
    setGridOffsetSec(Math.max(0, Math.min(duration, newTime)));
  };
  const onStartHandleMouseUp = (e) => {
    const st = startHandleDragRef.current;
    if (!st.dragging) return;
    document.removeEventListener('mousemove', onStartHandleMouseMove);
    document.removeEventListener('mouseup', onStartHandleMouseUp);
    startHandleDragRef.current.dragging = false;
    // Compute landed time at mouse position to avoid stale state
    const rect = st.rect;
    const width = contentWidthPx || rect?.width || 1;
    const scrollLeft = waveformScrollRef.current
      ? waveformScrollRef.current.scrollLeft
      : 0;
    const viewportRelativeX = e.clientX - (rect?.left || 0);
    const contentX = Math.max(
      0,
      Math.min(viewportRelativeX + scrollLeft, width)
    );
    const landedTime = (contentX / width) * (duration || 0);
    const clampedTime = Math.max(0, Math.min(duration || 0, landedTime));
    // Update offset, last clicked, and playback position
    setGridOffsetSec(clampedTime);
    setLastBeatClickTime(clampedTime);
    setCurrentTime(clampedTime);
    syncAudioElements(clampedTime);
    if (!st.moved) {
      // Click on start handle: create 1-bar loop starting at offset as well
      handleHandleClick(clampedTime);
    }
  };

  return (
    <div className={`custom-audio-player ${className}`}>
      {/* Waveform */}
      <div className="waveform-container">
        <div className="waveform-scroll" ref={waveformScrollRef}>
          <div
            className="waveform-content"
            ref={waveformContentRef}
            style={{ width: contentWidthPx ? `${contentWidthPx}px` : '100%' }}
          >
            <div ref={waveformRef} className="waveform" />
            {/* Beat Grid Lines */}
            {gridEnabled && (
              <div
                className={`beat-grid-lines ${
                  gridDragEnabled ? 'beat-grid-overlay--interactive' : ''
                }`}
              >
                {gridLines.map((line, idx) => (
                  <div
                    key={idx}
                    className={
                      line.isBar
                        ? 'grid-line grid-line--bar grid-line--extend'
                        : 'grid-line'
                    }
                    style={{ left: `${line.x}px` }}
                  />
                ))}
              </div>
            )}
            {/* Beat Grid Handles on top (bars only) */}
            {gridEnabled && startHandle && (
              <div className="beat-grid-handles">
                <div
                  className="grid-handle start"
                  style={{ left: `${startHandle.x}px` }}
                  onMouseDown={onStartHandleMouseDown}
                  title={
                    'Drag to set grid start (offset). Click to set 1 bar loop.'
                  }
                />
              </div>
            )}
            {gridEnabled && (
              <div className="beat-grid-handles">
                {gridHandles.map((h, idx) => (
                  <div
                    key={idx}
                    className={`grid-handle bar`}
                    style={{ left: `${h.x}px` }}
                    onMouseDown={(e) =>
                      onBarHandleMouseDown(h.barIndex, h.time, e.clientX)
                    }
                    title={
                      'Drag to adjust BPM relative to start. Click to set loop.'
                    }
                  />
                ))}
              </div>
            )}
            {/* Optional: phase drag area uses original overlay but is invisible */}
            {gridEnabled && (
              <div
                className={`beat-grid-overlay ${
                  gridDragEnabled ? 'beat-grid-overlay--interactive' : ''
                }`}
                ref={gridOverlayRef}
                onMouseDown={onGridMouseDown}
                title={
                  gridDragEnabled
                    ? 'Drag to shift grid phase'
                    : 'Toggle Adjust Grid to drag'
                }
              />
            )}
          </div>
        </div>
      </div>

      {/* Hidden audio elements */}
      <audio
        ref={originalAudioRef}
        src={originalTrack}
        preload="metadata"
        volume={volume}
        style={{ display: 'none' }}
      />

      {stems.map((stem) => (
        <audio
          key={stem.type}
          ref={(el) => (stemAudioRefs.current[stem.type] = el)}
          src={stem.streamUrl}
          preload="metadata"
          volume={stemVolumes[stem.type] || 0.8}
          style={{ display: 'none' }}
        />
      ))}

      {/* Player Header */}
      {title && (
        <div className="player-header">
          <h4>{title}</h4>
        </div>
      )}

      {/* Timeline (kept as time display only, waveform handles seeking) */}
      <div
        className="timeline-container"
        ref={timelineRef}
        onMouseDown={startDragging}
        onMouseMove={handleTimelineDrag}
        onMouseUp={stopDragging}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={handleTimelineClick}
      >
        <div className="time-display">
          <span>{formatTime(displayTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="player-controls">
        <button className="seek-btn" onClick={seekBackward}>
          ‹‹
        </button>

        <button className="play-pause-btn" onClick={togglePlayPause}>
          {isPlaying ? '||' : '▶'}
        </button>

        <button className="seek-btn" onClick={seekForward}>
          ››
        </button>
      </div>

      {/* Beat Grid + Loop Controls */}
      <div className="grid-controls">
        <div className="grid-controls-row">
          <label className="grid-label">Zoom</label>
          <input
            className="grid-input"
            type="range"
            min={1}
            max={12}
            step={0.1}
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value || '1'))}
            title="Zoom waveform and grid"
          />
          <button
            className="grid-btn"
            onClick={() =>
              setZoom((z) => Math.max(1, Math.round((z - 0.25) * 100) / 100))
            }
            title="Zoom out"
          >
            −
          </button>
          <button
            className="grid-btn"
            onClick={() =>
              setZoom((z) => Math.min(12, Math.round((z + 0.25) * 100) / 100))
            }
            title="Zoom in"
          >
            +
          </button>
          <label className="grid-label">BPM</label>
          <input
            className="grid-input"
            type="number"
            min={20}
            max={300}
            value={bpm}
            onChange={(e) => setBpm(parseInt(e.target.value || '0', 10))}
          />
          <button className="grid-btn" onClick={handleTapTempo}>
            Tap
          </button>

          <label className="grid-label">Beats/Bar</label>
          <input
            className="grid-input"
            type="number"
            min={1}
            max={12}
            value={beatsPerBar}
            onChange={(e) =>
              setBeatsPerBar(parseInt(e.target.value || '4', 10))
            }
          />

          <label className="grid-label">Phase (s)</label>
          <input
            className="grid-input"
            type="number"
            step={0.01}
            value={gridOffsetSec}
            onChange={(e) =>
              setGridOffsetSec(parseFloat(e.target.value || '0'))
            }
          />

          <button
            className={`grid-toggle ${gridEnabled ? 'active' : ''}`}
            onClick={() => setGridEnabled((v) => !v)}
          >
            {gridEnabled ? 'Hide Grid' : 'Show Grid'}
          </button>

          <button
            className={`grid-toggle ${gridDragEnabled ? 'active' : ''}`}
            onClick={() => setGridDragEnabled((v) => !v)}
            title="Enable to drag grid overlay"
          >
            {gridDragEnabled ? 'Adjusting Grid…' : 'Adjust Grid'}
          </button>

          <button className="grid-btn" onClick={() => createLoopBars(1)}>
            Add 1 Bar Loop
          </button>
          <button className="grid-btn" onClick={() => createLoopBars(2)}>
            Add 2 Bar Loop
          </button>
          <button className="grid-btn" onClick={() => createLoopBars(4)}>
            Add 4 Bar Loop
          </button>

          <button
            className="grid-btn"
            onClick={handleExtractLoop}
            disabled={!originalFilename || !getActiveRegion() || extracting}
            title={
              !originalFilename
                ? 'Extraction requires a known filename'
                : 'Extract the active loop as mp3'
            }
          >
            {extracting ? 'Extracting…' : 'Extract Loop'}
          </button>

          {lastExtractUrl && (
            <a className="grid-btn" href={lastExtractUrl} download>
              Download Last Extract
            </a>
          )}
        </div>
      </div>

      {/* Stem Toggles */}
      <div className="stem-controls">
        <div className="stem-toggles">
          <button
            className={`stem-toggle ${
              activeStem === 'original' ? 'active' : ''
            }`}
            onClick={() => handleStemToggle('original')}
          >
            ORIGINAL
          </button>

          {stems.map((stem) => (
            <button
              key={stem.type}
              className={`stem-toggle ${
                activeStem === stem.type ? 'active' : ''
              }`}
              onClick={() => handleStemToggle(stem.type)}
            >
              {stem.type.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Transcript Section */}
      {transcript && (
        <div className="transcript-section">
          <div className="transcript-header">
            <button
              className={`transcript-toggle ${showTranscript ? 'active' : ''}`}
              onClick={() => setShowTranscript(!showTranscript)}
            >
              {showTranscript ? 'HIDE TRANSCRIPT' : 'SHOW TRANSCRIPT'}
            </button>
          </div>

          {showTranscript && (
            <div className="transcript-content">
              <div className="transcript-words">
                {transcript.formattedText &&
                transcript.words &&
                transcript.words.length > 0 ? (
                  renderFormattedClickableTranscript()
                ) : transcript.words && transcript.words.length > 0 ? (
                  transcript.words.map((word, index) => (
                    <React.Fragment key={index}>
                      <span
                        className={`transcript-word ${
                          currentTime >= word.start && currentTime <= word.end
                            ? 'active'
                            : ''
                        }`}
                        onClick={() => handleTranscriptWordClick(word.start)}
                        title={`${formatTime(word.start)} - ${formatTime(
                          word.end
                        )}`}
                      >
                        {word.word}
                      </span>{' '}
                    </React.Fragment>
                  ))
                ) : (
                  <div className="transcript-text">
                    {transcript.formattedText ? (
                      <div>{transcript.formattedText}</div>
                    ) : (
                      <p>{transcript.text}</p>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default CustomAudioPlayer;
