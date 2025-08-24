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

  // Performance refs
  const animationFrameRef = useRef(null);
  const lastUpdateTimeRef = useRef(0);

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

  // Initialize WaveSurfer
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

    ws.load(originalTrack);

    // Sync durations
    ws.on('ready', () => {
      setDuration(ws.getDuration());
      // Mute WaveSurfer audio to use it as a visual-only transport
      try {
        ws.setMuted(true);
      } catch (e) {}
    });

    // Sync current time updates to React state
    ws.on('timeupdate', (time) => {
      if (!isDragging) {
        setCurrentTime(time);
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

    return () => {
      ws.destroy();
      wavesurferRef.current = null;
    };
  }, [originalTrack]);

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
          wavesurferRef.current.pause();
        }
        setIsPlaying(false);
      } else {
        // Sync time before playing
        syncAudioElements(currentTime);

        // Play active audio(s)
        if (activeStem === 'original') {
          await originalAudio.play();
          if (wavesurferRef.current && !wavesurferRef.current.isPlaying()) {
            // Keep WS in sync: seek then play
            const ws = wavesurferRef.current;
            const wsDuration = ws.getDuration() || 0;
            if (wsDuration > 0) ws.seekTo(currentTime / wsDuration);
            ws.play();
          }
        } else if (activeStem === 'all') {
          await originalAudio.play();
          await Promise.all(
            stems.map(async (stem) => {
              const audio = stemAudioRefs.current[stem.type];
              if (audio) {
                return audio.play();
              }
            })
          );
          if (wavesurferRef.current && !wavesurferRef.current.isPlaying()) {
            const ws = wavesurferRef.current;
            const wsDuration = ws.getDuration() || 0;
            if (wsDuration > 0) ws.seekTo(currentTime / wsDuration);
            ws.play();
          }
        } else {
          const stemAudio = stemAudioRefs.current[activeStem];
          if (stemAudio) {
            await stemAudio.play();
          }
          if (wavesurferRef.current && !wavesurferRef.current.isPlaying()) {
            const ws = wavesurferRef.current;
            const wsDuration = ws.getDuration() || 0;
            if (wsDuration > 0) ws.seekTo(currentTime / wsDuration);
            ws.play();
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
        wavesurferRef.current.pause();
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
          await originalAudio.play();
        }
      } else {
        const stemAudio = stemAudioRefs.current[stemType];
        if (stemAudio) {
          await stemAudio.play();
        }
      }

      if (wavesurferRef.current) {
        const ws = wavesurferRef.current;
        const wsDuration = ws.getDuration() || 0;
        if (wsDuration > 0) ws.seekTo(currentPlayTime / wsDuration);
        ws.play();
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
      {/* Waveform */}
      <div className="waveform-container">
        <div ref={waveformRef} className="waveform" />
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
