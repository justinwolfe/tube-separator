import React, { useState, useRef, useEffect, useCallback } from 'react';
import './CustomAudioPlayer.css';

const CustomAudioPlayer = ({
  originalTrack,
  stems = [],
  title,
  className = '',
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [activeStem, setActiveStem] = useState('original');
  const [stemVolumes, setStemVolumes] = useState({});
  const [isDragging, setIsDragging] = useState(false);

  // Audio refs
  const originalAudioRef = useRef(null);
  const stemAudioRefs = useRef({});
  const timelineRef = useRef(null);

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
      }
    };

    originalAudio.addEventListener('loadedmetadata', handleLoadedMetadata);
    originalAudio.addEventListener('timeupdate', handleTimeUpdate);

    return () => {
      originalAudio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      originalAudio.removeEventListener('timeupdate', handleTimeUpdate);
    };
  }, [originalTrack, isDragging]);

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
        setIsPlaying(false);
      } else {
        // Sync time before playing
        syncAudioElements(currentTime);

        // Play active audio(s)
        if (activeStem === 'original') {
          await originalAudio.play();
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
        } else {
          const stemAudio = stemAudioRefs.current[activeStem];
          if (stemAudio) {
            await stemAudio.play();
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

  // Handle timeline seek (unified for mouse and touch)
  const handleTimelineInteraction = (e) => {
    e.preventDefault();
    if (!timelineRef.current || !duration) return;

    const rect = timelineRef.current.getBoundingClientRect();
    const positionX = getEventPosition(e) - rect.left;
    const newTime = Math.max(
      0,
      Math.min((positionX / rect.width) * duration, duration)
    );

    setCurrentTime(newTime);
    syncAudioElements(newTime);
  };

  // Handle timeline drag (mouse and touch)
  const handleTimelineDrag = (e) => {
    if (!isDragging || !timelineRef.current || !duration) return;
    e.preventDefault();

    const rect = timelineRef.current.getBoundingClientRect();
    const dragX = getEventPosition(e) - rect.left;
    const newTime = Math.max(
      0,
      Math.min((dragX / rect.width) * duration, duration)
    );

    setCurrentTime(newTime);
  };

  const startDragging = (e) => {
    e.preventDefault();
    setIsDragging(true);
    handleTimelineInteraction(e);
  };

  const stopDragging = () => {
    if (isDragging) {
      setIsDragging(false);
      syncAudioElements(currentTime);
    }
  };

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
      } else if (stemType === 'all') {
        if (originalAudio) {
          await originalAudio.play();
        }
        await Promise.all(
          stems.map(async (stem) => {
            const audio = stemAudioRefs.current[stem.type];
            if (audio) {
              return audio.play();
            }
          })
        );
      } else {
        const stemAudio = stemAudioRefs.current[stemType];
        if (stemAudio) {
          await stemAudio.play();
        }
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

  // Calculate progress percentage
  const progressPercentage = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <div className={`custom-audio-player ${className}`}>
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

      {/* Timeline */}
      <div className="timeline-container">
        <div
          ref={timelineRef}
          className="timeline"
          onClick={handleTimelineInteraction}
          onMouseDown={startDragging}
          onMouseMove={handleTimelineDrag}
          onMouseUp={stopDragging}
          onMouseLeave={stopDragging}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
        >
          <div className="timeline-track">
            <div
              className="timeline-progress"
              style={{ width: `${progressPercentage}%` }}
            />
            <div
              className="timeline-handle"
              style={{ left: `${progressPercentage}%` }}
            />
          </div>
        </div>

        <div className="time-display">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="player-controls">
        <button className="play-pause-btn" onClick={togglePlayPause}>
          {isPlaying ? '⏸' : '▶'}
        </button>

        <div className="volume-control">
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={volume}
            onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
            className="volume-slider"
          />
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

          {stems.length > 0 && (
            <button
              className={`stem-toggle all ${
                activeStem === 'all' ? 'active' : ''
              }`}
              onClick={() => handleStemToggle('all')}
            >
              ALL STEMS
            </button>
          )}
        </div>

        {/* Individual Stem Volume Controls */}
        {activeStem === 'all' && (
          <div className="individual-stem-controls">
            {stems.map((stem) => (
              <div key={stem.type} className="stem-volume-control">
                <label>{stem.type.toUpperCase()}</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={stemVolumes[stem.type] || 0.8}
                  onChange={(e) =>
                    handleStemVolumeChange(
                      stem.type,
                      parseFloat(e.target.value)
                    )
                  }
                  className="stem-volume-slider"
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default CustomAudioPlayer;
