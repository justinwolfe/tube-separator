import React, { useState, useRef, useEffect, useCallback } from 'react';
import './CustomAudioPlayer.css';
import WaveSurfer from 'wavesurfer.js';

const CustomAudioPlayer = ({
  originalTrack,
  stems = [],
  title,
  className = '',
  transcript = null,
  onSeekToTime,
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

  // Audio refs
  const originalAudioRef = useRef(null);
  const stemAudioRefs = useRef({});
  const timelineRef = useRef(null);
  const waveformRef = useRef(null);
  const wavesurferRef = useRef(null);

  // Multi-waveform refs
  const waveformRefs = useRef({});
  const wavesurferRefs = useRef({});

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

    // Clear DOM container
    waveformRef.current.innerHTML = '';

    // Get all tracks (original + stems)
    const tracks = [
      { type: 'original', url: originalTrack, label: 'ORIGINAL' },
      ...stems.map((stem) => ({
        type: stem.type,
        url: stem.streamUrl,
        label: stem.type.toUpperCase(),
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

      // Create label
      const label = document.createElement('div');
      label.className = 'waveform-label';
      label.textContent = track.label;
      container.appendChild(label);

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
      });

      // Handle clicking on waveform to switch stem (only outside the visual)
      container.addEventListener('click', (e) => {
        if (e.target.closest('.waveform-visual')) return; // Let WaveSurfer handle seeking
        handleStemToggle(track.type);
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
      }
    });

    // Keep original wavesurferRef for backward compatibility
    wavesurferRef.current = wavesurferRefs.current.original;

    return () => {
      Object.values(wavesurferRefs.current).forEach((ws) => ws?.destroy());
      waveformRefs.current = {};
      wavesurferRefs.current = {};
      wavesurferRef.current = null;
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
  }, [activeStem]);

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

      // Sync all waveforms
      syncAllWaveforms(time);
    },
    [syncAllWaveforms]
  );

  // Seek from any waveform and keep everything in sync
  const seekAllFromWaveform = useCallback(
    (targetTime, sourceType) => {
      setCurrentTime(targetTime);
      syncAudioElements(targetTime);
      syncOtherWaveforms(targetTime, sourceType);
    },
    [syncAudioElements, syncOtherWaveforms]
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
        setIsPlaying(false);
      } else {
        // Sync time before playing
        syncAudioElements(currentTime);

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
          }
        } catch {}

        // Wait for seek to apply if possible, but don't block too long
        await waitForEventOnce(nextAudio, 'seeked', 300).catch(() => {});

        // Unmute and continue playing
        nextAudio.muted = previousMuted;
        try {
          await nextAudio.play();
        } catch {}
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
      const newTime = Math.max(0, currentTime - 5);
      setCurrentTime(newTime);
      syncAudioElements(newTime);
    }
  };

  const seekForward = () => {
    const originalAudio = originalAudioRef.current;
    if (originalAudio) {
      const newTime = Math.min(duration, currentTime + 5);
      setCurrentTime(newTime);
      syncAudioElements(newTime);
    }
  };

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

  return (
    <div className={`custom-audio-player ${className}`}>
      {/* Multi-Waveform Display */}
      <div className="waveform-container">
        <div ref={waveformRef} className="multi-waveform" />
      </div>

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
