import React, {
  useState,
  useRef,
  useEffect,
  useCallback,
  useMemo,
} from 'react';
import { createPortal } from 'react-dom';
import './CustomAudioPlayer.css';
import WaveSurfer from 'wavesurfer.js';

const CustomAudioPlayer = ({
  originalTrack,
  stems = [],
  title,
  className = '',
  transcript = null,
  onSeekToTime,
  videoUrl = null,
  sourceAudioFilename = null,
  // Add download URL props
  originalDownloadUrl = null,
  videoDownloadUrl = null,
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
  const [startPoint, setStartPoint] = useState(null);
  const [downloadingFiles, setDownloadingFiles] = useState(new Set());
  const startPointRef = useRef(startPoint);
  useEffect(() => {
    startPointRef.current = startPoint;
  }, [startPoint]);

  // Video ref
  const videoRef = useRef(null);

  // Audio refs
  const originalAudioRef = useRef(null);
  const stemAudioRefs = useRef({});
  const timelineRef = useRef(null);
  const waveformRef = useRef(null);
  const wavesurferRef = useRef(null);

  // Multi-waveform refs
  const waveformRefs = useRef({});
  const wavesurferRefs = useRef({});
  const startMarkerRefs = useRef({});

  // Create or update the persistent start marker across all waveforms
  const createOrUpdateStartMarker = useCallback(() => {
    try {
      const currentStart = startPointRef.current;
      const wsEntries = Object.entries(wavesurferRefs.current);
      wsEntries.forEach(([stemType, ws]) => {
        const container = waveformRefs.current[stemType];
        if (!container || !ws) return;
        const durationSec = ws.getDuration ? ws.getDuration() || 0 : 0;

        // Remove marker if start is unset or duration unknown
        if (currentStart == null || !(durationSec > 0)) {
          const existing = startMarkerRefs.current[stemType];
          if (existing && existing.parentNode) {
            try {
              existing.parentNode.removeChild(existing);
            } catch {}
          }
          delete startMarkerRefs.current[stemType];
          return;
        }

        // Ensure marker element exists
        let marker = startMarkerRefs.current[stemType];
        if (!marker) {
          marker = document.createElement('div');
          marker.className = 'start-marker';
          marker.style.position = 'absolute';
          marker.style.top = '0';
          marker.style.bottom = '0';
          marker.style.width = '2px';
          marker.style.background = 'rgba(255, 0, 90, 0.9)';
          marker.style.pointerEvents = 'none';
          marker.style.zIndex = '5';
          // Ensure container positioning context
          if (!container.style.position) container.style.position = 'relative';
          container.appendChild(marker);
          startMarkerRefs.current[stemType] = marker;
        }

        // Position marker within the waveform visual area
        const visualDiv = container.querySelector('.waveform-visual');
        const targetWidth = visualDiv
          ? visualDiv.clientWidth
          : container.clientWidth;
        const clamped = Math.min(Math.max(currentStart / durationSec, 0), 1);
        const x = clamped * targetWidth;
        const offsetLeft = visualDiv ? visualDiv.offsetLeft : 0;
        marker.style.left = `${offsetLeft + x}px`;
      });
    } catch (e) {
      // no-op safeguard
    }
  }, []);

  // Lyrics mount ref (below vocals stem container)
  const lyricsMountRef = useRef(null);

  // Performance refs
  const animationFrameRef = useRef(null);
  const lastUpdateTimeRef = useRef(0);
  const rafSyncRef = useRef(null);
  const activeStemRef = useRef(activeStem);
  const isPlayingRef = useRef(isPlaying);
  const isProgrammaticSeekRef = useRef(false);

  useEffect(() => {
    activeStemRef.current = activeStem;
  }, [activeStem]);

  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Sync all waveforms to the same position
  const syncAllWaveforms = useCallback((time) => {
    isProgrammaticSeekRef.current = true;
    Object.values(wavesurferRefs.current).forEach((ws) => {
      if (ws && ws.getDuration) {
        try {
          const wsDuration = ws.getDuration() || 0;
          if (wsDuration > 0) {
            const position = Math.min(Math.max(time / wsDuration, 0), 1);
            ws.seekTo(position);
          }
        } catch (error) {
          console.warn('Error syncing waveform:', error);
        }
      }
    });
    // release flag next frame
    requestAnimationFrame(() => {
      isProgrammaticSeekRef.current = false;
    });
    // keep marker visually aligned when time changes as widths may change
    createOrUpdateStartMarker();
  }, []);

  // Utility: wait for a single event with timeout
  const waitForEventOnce = (element, eventName, timeoutMs = 1500) => {
    return new Promise((resolve, reject) => {
      let done = false;
      const onEvent = () => {
        if (done) return;
        done = true;
        element.removeEventListener(eventName, onEvent);
        resolve();
      };
      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        element.removeEventListener(eventName, onEvent);
        resolve();
      }, timeoutMs);
      element.addEventListener(
        eventName,
        () => {
          clearTimeout(timer);
          onEvent();
        },
        { once: true }
      );
    });
  };

  // Sync other waveforms (excluding the source to avoid recursion)
  const syncOtherWaveforms = useCallback((time, excludeType) => {
    isProgrammaticSeekRef.current = true;
    Object.entries(wavesurferRefs.current).forEach(([type, ws]) => {
      if (type !== excludeType && ws && ws.getDuration) {
        try {
          const wsDuration = ws.getDuration() || 0;
          if (wsDuration > 0) {
            const position = Math.min(Math.max(time / wsDuration, 0), 1);
            ws.seekTo(position);
          }
        } catch (error) {
          console.warn('Error syncing waveform:', error);
        }
      }
    });
    // release flag next frame
    requestAnimationFrame(() => {
      isProgrammaticSeekRef.current = false;
    });
    createOrUpdateStartMarker();
  }, []);

  const getActiveAudioUnsafe = useCallback(() => {
    return activeStemRef.current === 'original'
      ? originalAudioRef.current
      : stemAudioRefs.current[activeStemRef.current];
  }, []);

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
        // Keep all waveforms in sync
        syncAllWaveforms(originalAudio.currentTime);
      }
    };

    originalAudio.addEventListener('loadedmetadata', handleLoadedMetadata);
    originalAudio.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      originalAudio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      originalAudio.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [originalTrack, isDragging, syncAllWaveforms]);

  // Keep visuals synced when playing a stem element
  useEffect(() => {
    const handlers = [];

    Object.entries(stemAudioRefs.current).forEach(([type, el]) => {
      if (!el) return;
      const onTime = () => {
        if (!isDragging && activeStemRef.current === type) {
          const t = el.currentTime || 0;
          setCurrentTime(t);
          syncAllWaveforms(t);
          const v = videoRef.current;
          if (v && Math.abs((v.currentTime || 0) - t) > 0.08) {
            try {
              v.currentTime = t;
            } catch {}
          }
        }
      };
      el.addEventListener('timeupdate', onTime);
      handlers.push([el, onTime]);
    });

    return () => {
      handlers.forEach(([el, fn]) => el.removeEventListener('timeupdate', fn));
    };
  }, [stems, isDragging, syncAllWaveforms]);

  // Initialize WaveSurfer
  useEffect(() => {
    if (!waveformRef.current || !originalTrack) return;

    // Clear existing waveforms
    Object.values(wavesurferRefs.current).forEach((ws) => ws?.destroy());
    waveformRefs.current = {};
    wavesurferRefs.current = {};
    // Clear start markers
    Object.values(startMarkerRefs.current).forEach((el) => {
      if (el && el.parentNode) {
        try {
          el.parentNode.removeChild(el);
        } catch {}
      }
    });
    startMarkerRefs.current = {};

    // Clear any existing lyrics mount
    if (lyricsMountRef.current && lyricsMountRef.current.parentNode) {
      try {
        lyricsMountRef.current.parentNode.removeChild(lyricsMountRef.current);
      } catch {}
    }
    lyricsMountRef.current = null;

    // Clear DOM container
    waveformRef.current.innerHTML = '';

    // Create a lyrics mount ABOVE all waveforms (so it appears before Original)
    const globalLyricsMount = document.createElement('div');
    globalLyricsMount.className = 'lyrics-line-mount';
    waveformRef.current.appendChild(globalLyricsMount);
    lyricsMountRef.current = globalLyricsMount;

    // Get all tracks (original + stems)
    const tracks = [
      {
        type: 'original',
        url: originalTrack,
        label: 'ORIGINAL',
        downloadUrl: originalDownloadUrl,
        filename: sourceAudioFilename,
      },
      ...stems.map((stem) => ({
        type: stem.type,
        url: stem.streamUrl,
        label: stem.type.toUpperCase(),
        downloadUrl: stem.downloadUrl,
        filename: stem.filename,
      })),
    ];

    // Create waveform containers and WaveSurfer instances for each track
    tracks.forEach((track) => {
      // Create container element
      const container = document.createElement('div');
      container.className = `waveform-item ${
        track.type === activeStem ? 'active' : ''
      }`;
      container.dataset.stemType = track.type;

      // Create label container with download button
      const labelContainer = document.createElement('div');
      labelContainer.className = 'waveform-label-container';

      const label = document.createElement('div');
      label.className = 'waveform-label';
      label.textContent = track.label;
      labelContainer.appendChild(label);

      // Add download button if downloadUrl is available
      if (track.downloadUrl) {
        const downloadBtn = document.createElement('button');
        downloadBtn.className = 'waveform-download-btn';
        const filename = track.filename || `${track.label}.mp3`;
        const downloadKey = `${track.downloadUrl}-${filename}`;
        const isDownloading = downloadingFiles.has(downloadKey);
        downloadBtn.innerHTML = isDownloading ? '⏳' : '⬇';
        downloadBtn.title = `Download ${track.label}`;
        downloadBtn.disabled = isDownloading;
        downloadBtn.dataset.downloadUrl = track.downloadUrl;
        downloadBtn.dataset.filename = filename;
        downloadBtn.onclick = (e) => {
          e.stopPropagation();
          handleDownload(track.downloadUrl, filename);
        };
        labelContainer.appendChild(downloadBtn);
      }

      container.appendChild(labelContainer);

      // Create waveform div
      const waveformDiv = document.createElement('div');
      waveformDiv.className = 'waveform-visual';
      container.appendChild(waveformDiv);

      // Store container ref
      waveformRefs.current[track.type] = container;
      waveformRef.current.appendChild(container);

      // Create WaveSurfer instance
      const ws = WaveSurfer.create({
        container: waveformDiv,
        waveColor:
          track.type === activeStem
            ? 'rgba(255, 255, 255, 0.4)'
            : 'rgba(255, 255, 255, 0.15)',
        progressColor:
          track.type === activeStem
            ? 'rgba(255, 255, 255, 0.9)'
            : 'rgba(255, 255, 255, 0.3)',
        cursorColor: 'rgba(255, 255, 255, 0.8)',
        cursorWidth: 1,
        barWidth: 2,
        barGap: 1,
        barRadius: 0,
        height: 60,
        normalize: true,
        interact: true,
        partialRender: true,
        dragToSeek: true,
        backend: 'webaudio',
      });

      wavesurferRefs.current[track.type] = ws;
      ws.load(track.url);

      // Mute all waveforms (visual only)
      ws.on('ready', () => {
        ws.setMuted(true);
        // Set duration from the original track
        if (track.type === 'original') {
          setDuration(ws.getDuration());
        }
        // Snap to current position on ready
        const d = ws.getDuration() || 0;
        if (d > 0) {
          const t = isDragging ? dragTime : currentTime;
          const pos = Math.min(Math.max(t / d, 0), 1);
          isProgrammaticSeekRef.current = true;
          ws.seekTo(pos);
          requestAnimationFrame(() => {
            isProgrammaticSeekRef.current = false;
          });
        }
        // Ensure marker position once waveform is ready
        createOrUpdateStartMarker();
      });

      // Handle clicking anywhere in the container to select this stem
      container.addEventListener('click', () => {
        if (activeStemRef.current !== track.type) {
          handleStemToggle(track.type);
        }
      });

      const handleSeekProgress = (progress) => {
        if (isProgrammaticSeekRef.current) return;
        const target = progress * (ws.getDuration() || 0);
        seekAllFromWaveform(target, track.type);
      };

      // Handle seeking via waveform
      ws.on('seek', handleSeekProgress);

      // Also handle generic interaction (click without drag on some builds)
      if (ws.on) {
        ws.on('interaction', () => {
          if (isProgrammaticSeekRef.current) return;
          const d = ws.getDuration() || 0;
          const t = ws.getCurrentTime
            ? ws.getCurrentTime()
            : ws.getProgress
            ? ws.getProgress() * d
            : null;
          if (t != null) seekAllFromWaveform(t, track.type);
        });
        // Reposition markers after resize/render events WaveSurfer may emit
        ws.on('redrawcomplete', () => {
          createOrUpdateStartMarker();
        });
      }
    });

    // Keep original wavesurferRef for backward compatibility
    wavesurferRef.current = wavesurferRefs.current.original;

    return () => {
      Object.values(wavesurferRefs.current).forEach((ws) => ws?.destroy());
      waveformRefs.current = {};
      wavesurferRefs.current = {};
      wavesurferRef.current = null;
      Object.values(startMarkerRefs.current).forEach((el) => {
        if (el && el.parentNode) {
          try {
            el.parentNode.removeChild(el);
          } catch {}
        }
      });
      startMarkerRefs.current = {};
      if (lyricsMountRef.current && lyricsMountRef.current.parentNode) {
        try {
          lyricsMountRef.current.parentNode.removeChild(lyricsMountRef.current);
        } catch {}
      }
      lyricsMountRef.current = null;
    };
  }, [originalTrack, stems, syncOtherWaveforms]);

  // Update active waveform styling when activeStem changes
  useEffect(() => {
    Object.entries(waveformRefs.current).forEach(([stemType, container]) => {
      if (container) {
        container.className = `waveform-item ${
          stemType === activeStem ? 'active' : ''
        }`;
      }
    });

    // Update waveform colors
    Object.entries(wavesurferRefs.current).forEach(([stemType, ws]) => {
      if (ws && ws.isReady) {
        ws.setOptions({
          waveColor:
            stemType === activeStem
              ? 'rgba(255, 255, 255, 0.4)'
              : 'rgba(255, 255, 255, 0.15)',
          progressColor:
            stemType === activeStem
              ? 'rgba(255, 255, 255, 0.9)'
              : 'rgba(255, 255, 255, 0.3)',
        });
      }
    });
    createOrUpdateStartMarker();
  }, [activeStem, createOrUpdateStartMarker]);

  // Update download button states when downloadingFiles changes
  useEffect(() => {
    Object.entries(waveformRefs.current).forEach(([stemType, container]) => {
      if (container) {
        const downloadBtn = container.querySelector('.waveform-download-btn');
        if (downloadBtn) {
          const downloadUrl = downloadBtn.dataset.downloadUrl;
          const filename = downloadBtn.dataset.filename;
          if (downloadUrl && filename) {
            const downloadKey = `${downloadUrl}-${filename}`;
            const isDownloading = downloadingFiles.has(downloadKey);
            downloadBtn.innerHTML = isDownloading ? '⏳' : '⬇';
            downloadBtn.disabled = isDownloading;
          }
        }
      }
    });
  }, [downloadingFiles]);

  // Sync all audio elements
  const syncAudioElements = useCallback(
    (time) => {
      const originalAudio = originalAudioRef.current;
      if (originalAudio && !isNaN(time) && time >= 0) {
        originalAudio.currentTime = time;
      }

      Object.values(stemAudioRefs.current).forEach((audio) => {
        if (audio && !isNaN(time) && time >= 0) {
          audio.currentTime = time;
        }
      });

      // Sync attached video if present
      const videoEl = videoRef.current;
      if (videoEl && !isNaN(time) && time >= 0) {
        try {
          videoEl.currentTime = time;
        } catch {}
      }

      // Sync all waveforms
      syncAllWaveforms(time);
      // Keep marker stable on layout changes
      createOrUpdateStartMarker();
    },
    [syncAllWaveforms, createOrUpdateStartMarker]
  );

  // Seek from any waveform and keep everything in sync
  const seekAllFromWaveform = useCallback(
    (targetTime, sourceType) => {
      setCurrentTime(targetTime);
      syncAudioElements(targetTime);
      syncOtherWaveforms(targetTime, sourceType);
      createOrUpdateStartMarker();
    },
    [syncAudioElements, syncOtherWaveforms, createOrUpdateStartMarker]
  );

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
        if (videoRef.current) videoRef.current.pause();
        setIsPlaying(false);
      } else {
        // Determine resume point honoring startPoint
        const resumeAt = startPoint != null ? startPoint : currentTime;

        // Sync time before playing
        setCurrentTime(resumeAt);
        syncAudioElements(resumeAt);

        // Pause all, then play active only
        originalAudio.pause();
        Object.values(stemAudioRefs.current).forEach((audio) => {
          if (audio) audio.pause();
        });

        const activeAudio =
          activeStem === 'original'
            ? originalAudio
            : stemAudioRefs.current[activeStem];

        if (activeAudio) await activeAudio.play();
        if (videoRef.current) {
          try {
            await videoRef.current.play();
          } catch {}
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

  // Handle timeline click (immediate audio seek) - Remove since we're using waveforms
  const handleTimelineClick = (e) => {
    // This function is no longer needed as seeking is handled by waveforms
  };

  // Handle timeline drag - Remove since we're using waveforms
  const handleTimelineDrag = (e) => {
    // This function is no longer needed as seeking is handled by waveforms
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

  // Keep start marker positioned on window resize
  useEffect(() => {
    const onResize = () => createOrUpdateStartMarker();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [createOrUpdateStartMarker]);

  // Handle stem selection
  const handleStemToggle = async (stemType) => {
    const originalAudio = originalAudioRef.current;
    const wasPlaying = isPlayingRef.current;

    try {
      // Capture current time from the actively playing source for accurate resume
      const activeAudio =
        activeStem === 'original'
          ? originalAudio
          : stemAudioRefs.current[activeStem];
      const currentPlayTime = activeAudio
        ? activeAudio.currentTime
        : currentTime;

      // Pause everything
      if (originalAudio) originalAudio.pause();
      Object.values(stemAudioRefs.current).forEach((audio) => {
        if (audio) audio.pause();
      });
      if (videoRef.current) videoRef.current.pause();

      // Update active stem and sync position globally
      setActiveStem(stemType);
      syncAudioElements(currentPlayTime);

      const nextAudio =
        stemType === 'original'
          ? originalAudio
          : stemAudioRefs.current[stemType];

      if (wasPlaying && nextAudio) {
        // Start muted immediately to preserve user activation and avoid audio blips
        const previousMuted = nextAudio.muted;
        nextAudio.muted = true;

        // Kick off load if needed
        if (nextAudio.readyState < 1) {
          try {
            nextAudio.load();
          } catch {}
        }

        // Start playback ASAP under user gesture
        try {
          await nextAudio.play();
        } catch {}

        // Ensure metadata, then seek to the captured time
        if (nextAudio.readyState < 1) {
          await waitForEventOnce(nextAudio, 'loadedmetadata', 1500);
        }
        try {
          if (!Number.isNaN(currentPlayTime) && currentPlayTime >= 0) {
            nextAudio.currentTime = currentPlayTime;
            if (videoRef.current) {
              try {
                videoRef.current.currentTime = currentPlayTime;
              } catch {}
            }
          }
        } catch {}

        // Wait for seek to apply if possible, but don't block too long
        await waitForEventOnce(nextAudio, 'seeked', 300).catch(() => {});

        // Unmute and continue playing
        nextAudio.muted = previousMuted;
        try {
          await nextAudio.play();
        } catch {}
        if (videoRef.current) {
          try {
            await videoRef.current.play();
          } catch {}
        }
        setIsPlaying(true);
      }
    } catch (error) {
      console.error('Error switching stems:', error);
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
      const newTime = Math.max(0, currentTime - 0.5);
      setCurrentTime(newTime);
      syncAudioElements(newTime);
    }
  };

  const seekForward = () => {
    const originalAudio = originalAudioRef.current;
    if (originalAudio) {
      const newTime = Math.min(duration, currentTime + 0.5);
      setCurrentTime(newTime);
      syncAudioElements(newTime);
    }
  };

  // Keyboard shortcuts: space (play/pause), 't' (cycle stems), arrows (seek)
  useEffect(() => {
    const isTypingTarget = (el) => {
      if (!el) return false;
      const tag = el.tagName?.toLowerCase();
      const editable = el.getAttribute && el.getAttribute('contenteditable');
      return (
        tag === 'input' ||
        tag === 'textarea' ||
        tag === 'select' ||
        editable === '' ||
        editable === 'true'
      );
    };

    const cycleStem = () => {
      const order = ['original', ...stems.map((s) => s.type)];
      const idx = order.indexOf(activeStemRef.current || 'original');
      const next = order[(idx + 1) % order.length];
      if (next) handleStemToggle(next);
    };

    const onKeyDown = (e) => {
      if (isTypingTarget(e.target)) return;

      // Normalize key
      const key = e.key;

      // Space to toggle play/pause
      if (key === ' ' || key === 'Spacebar' || e.code === 'Space') {
        e.preventDefault();
        togglePlayPause();
        return;
      }

      // 't' to cycle stems (ignore modifiers)
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (key === 't' || key === 'T')
      ) {
        e.preventDefault();
        cycleStem();
        return;
      }

      // 'f' to set start point at current time
      if (
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        (key === 'f' || key === 'F')
      ) {
        e.preventDefault();
        const t = isDragging ? dragTime : currentTime;
        setStartPoint(t);
        // Sync markers right away
        setTimeout(() => createOrUpdateStartMarker(), 0);
        return;
      }

      // Arrow keys to seek
      if (key === 'ArrowLeft') {
        e.preventDefault();
        seekBackward();
        return;
      }
      if (key === 'ArrowRight') {
        e.preventDefault();
        seekForward();
        return;
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    stems,
    seekBackward,
    seekForward,
    togglePlayPause,
    handleStemToggle,
    isDragging,
    dragTime,
    currentTime,
    createOrUpdateStartMarker,
  ]);

  // Reposition marker when startPoint changes (e.g., via 'f')
  useEffect(() => {
    createOrUpdateStartMarker();
  }, [startPoint]);

  // Handle transcript word click
  const handleTranscriptWordClick = (time) => {
    if (onSeekToTime) {
      onSeekToTime(time);
    }
    setCurrentTime(time);
    syncAudioElements(time);
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
                const trailingPunctMatch = token.match(/[\)\]\}"'”’!?,.:;]+$/);
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

  // Build mapping from formatted lines to word index ranges [start, end)
  const lineWordRanges = useMemo(() => {
    if (!transcript || !transcript.formattedText || !transcript.words)
      return [];
    const lines = transcript.formattedText.split('\n');
    let idx = 0;
    const ranges = [];
    lines.forEach((line) => {
      const start = idx;
      const tokens = line.split(/(\s+)/);
      tokens.forEach((token) => {
        if (token && !/^\s+$/.test(token) && idx < transcript.words.length) {
          idx += 1;
        }
      });
      ranges.push({ start, end: idx, line });
    });
    return ranges;
  }, [transcript]);

  // Determine current word index from time
  const currentWordIndex = useMemo(() => {
    if (!transcript || !transcript.words) return -1;
    const i = transcript.words.findIndex(
      (w) => currentTime >= w.start && currentTime <= w.end
    );
    if (i !== -1) return i;
    if (currentTime < (transcript.words[0]?.start ?? 0)) return 0;
    return transcript.words.length - 1;
  }, [transcript, currentTime]);

  // Current line index based on current word
  const currentLineIndex = useMemo(() => {
    if (currentWordIndex < 0 || lineWordRanges.length === 0) return -1;
    for (let i = 0; i < lineWordRanges.length; i++) {
      const r = lineWordRanges[i];
      if (currentWordIndex >= r.start && currentWordIndex < r.end) return i;
    }
    return -1;
  }, [currentWordIndex, lineWordRanges]);

  // Render a single line with clickable, timestamped words
  const renderSingleLyricLine = (lineIdx) => {
    if (!transcript) return null;
    // Always render a placeholder to avoid layout shift
    if (lineIdx < 0 || lineIdx >= lineWordRanges.length || !transcript.words) {
      return <div className="lyrics-line" />;
    }
    const { line, start } = lineWordRanges[lineIdx];
    let wordIndex = start;
    const tokens = line.split(/(\s+)/);
    return (
      <div className="lyrics-line">
        {tokens.map((token, tokenIdx) => {
          if (token === '') return null;
          if (/^\s+$/.test(token)) {
            return <span key={`l-${lineIdx}-${tokenIdx}`}>{token}</span>;
          }
          const leadingPunctMatch = token.match(/^[\(\[\{"'“‘]+/);
          const trailingPunctMatch = token.match(/[\)\]\}"'”’!?,.:;]+$/);
          const leadingPunct = leadingPunctMatch ? leadingPunctMatch[0] : '';
          const trailingPunct = trailingPunctMatch ? trailingPunctMatch[0] : '';
          const coreStart = leadingPunct.length;
          const coreEnd = token.length - trailingPunct.length;
          const core = token.slice(coreStart, coreEnd);

          if (wordIndex < (transcript.words?.length || 0)) {
            const wordObj = transcript.words[wordIndex++];
            const isActive =
              currentTime >= wordObj.start && currentTime <= wordObj.end;
            return (
              <React.Fragment key={`l-${lineIdx}-${tokenIdx}`}>
                {leadingPunct}
                <span
                  className={`transcript-word ${isActive ? 'active' : ''}`}
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
          return <span key={`l-${lineIdx}-${tokenIdx}`}>{token}</span>;
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

  // Export current selection to video via backend
  const handleExportVideo = async () => {
    try {
      if (!sourceAudioFilename) return;
      const resp = await fetch('/api/export-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filename: sourceAudioFilename,
          stemType: activeStem,
        }),
      });
      const data = await resp.json();
      if (!resp.ok || !data.success) {
        throw new Error(data.error || 'Export failed');
      }
      // Trigger browser download
      window.open(data.downloadUrl, '_blank');
    } catch (e) {
      console.error('export failed', e);
      alert(e.message || 'Export failed');
    }
  };

  // Handle file downloads with HTTPS/CORS support
  const handleDownload = async (downloadUrl, filename) => {
    if (!downloadUrl) {
      console.warn('No download URL provided for', filename);
      return;
    }

    const downloadKey = `${downloadUrl}-${filename}`;

    // Prevent multiple simultaneous downloads of the same file
    if (downloadingFiles.has(downloadKey)) {
      return;
    }

    setDownloadingFiles((prev) => new Set([...prev, downloadKey]));

    try {
      // Method 1: Try fetch + blob approach for better HTTPS compatibility
      const response = await fetch(downloadUrl);
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      const link = document.createElement('a');
      link.href = url;
      link.download = filename || 'download';
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Clean up the blob URL
      setTimeout(() => window.URL.revokeObjectURL(url), 100);
    } catch (error) {
      console.error('Fetch download failed:', error);

      try {
        // Method 2: Fallback to simple anchor approach
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = filename || '';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      } catch (anchorError) {
        console.error('Anchor download failed:', anchorError);

        // Method 3: Last resort - open in new tab
        try {
          window.open(downloadUrl, '_blank');
        } catch (windowError) {
          console.error('All download methods failed:', windowError);
          alert(
            'Download failed. Please try right-clicking the download button and selecting "Save link as..."'
          );
        }
      }
    } finally {
      // Remove from downloading set after a short delay
      setTimeout(() => {
        setDownloadingFiles((prev) => {
          const newSet = new Set(prev);
          newSet.delete(downloadKey);
          return newSet;
        });
      }, 1000);
    }
  };

  return (
    <div className={`custom-audio-player ${className}`}>
      {/* Optional Video Display */}
      {videoUrl && (
        <div className="video-container">
          <video
            ref={videoRef}
            src={videoUrl}
            preload="metadata"
            playsInline
            controls={false}
            muted={true}
            className="player-video"
          />
        </div>
      )}

      {/* Multi-Waveform Display */}
      <div className="waveform-container">
        <div ref={waveformRef} className="multi-waveform" />
      </div>
      {/* CSS: .start-marker is positioned absolutely within each waveform item */}

      {/* Vocals lyrics single-line feed (portal mounted under vocals container) */}
      {lyricsMountRef.current &&
        transcript &&
        createPortal(
          renderSingleLyricLine(currentLineIndex),
          lyricsMountRef.current
        )}

      {/* Hidden audio elements */}
      <audio
        ref={originalAudioRef}
        src={originalTrack}
        preload="auto"
        volume={volume}
        style={{ display: 'none' }}
      />

      {stems.map((stem) => (
        <audio
          key={stem.type}
          ref={(el) => (stemAudioRefs.current[stem.type] = el)}
          src={stem.streamUrl}
          preload="auto"
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
      <div className="timeline-container">
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

        {videoUrl && (
          <button
            className="seek-btn"
            onClick={handleExportVideo}
            title="export video with current stem audio"
          >
            ⬇︎
          </button>
        )}

        {videoDownloadUrl && (
          <button
            className="seek-btn"
            onClick={() => handleDownload(videoDownloadUrl, 'video.mp4')}
            title="download original video"
          >
            📹
          </button>
        )}
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
