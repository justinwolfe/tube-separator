import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloadSuccess, setDownloadSuccess] = useState(null);
  const [separatingStems, setSeparatingStems] = useState(false);
  const [stemsResult, setStemsResult] = useState(null);

  const handleGetInfo = async () => {
    if (!url.trim()) {
      setError('Please enter a YouTube URL');
      return;
    }

    setLoading(true);
    setError('');
    setVideoInfo(null);

    try {
      const response = await axios.post('/api/video-info', { url });
      setVideoInfo(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to get video info');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format = 'best') => {
    setDownloading(true);
    setError('');
    setDownloadSuccess(null);
    setStemsResult(null);

    try {
      const response = await axios.post('/api/download', { url, format });
      setDownloadSuccess(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const handleSeparateStems = async () => {
    if (!downloadSuccess?.filename) return;

    setSeparatingStems(true);
    setError('');
    setStemsResult(null);

    try {
      const response = await axios.post('/api/separate-stems', {
        filename: downloadSuccess.filename,
      });
      setStemsResult(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Stem separation failed');
    } finally {
      setSeparatingStems(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown duration';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStemDisplayName = (stemType) => {
    const names = {
      vocals: 'Vocals',
      drums: 'Drums',
      bass: 'Bass',
      melodies: 'Melodies',
      instrumental: 'Instrumental',
      other: 'Other',
    };
    return (
      names[stemType] || stemType.charAt(0).toUpperCase() + stemType.slice(1)
    );
  };

  return (
    <div className="App">
      <div className="container">
        <header className="header">
          <h1>SAMPLER</h1>
          <p>Extract • Isolate • Transform</p>
        </header>

        <div className="input-section">
          <div className="input-group">
            <input
              type="url"
              placeholder="Enter YouTube URL..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="url-input"
              disabled={loading || downloading || separatingStems}
            />
            <button
              onClick={handleGetInfo}
              disabled={loading || downloading || separatingStems}
              className="action-btn"
            >
              {loading ? 'ANALYZING' : 'ANALYZE'}
            </button>
          </div>
        </div>

        {error && <div className="error-message">{error}</div>}

        {videoInfo && (
          <div className="video-info">
            <div className="video-details">
              {videoInfo.thumbnail && (
                <img
                  src={videoInfo.thumbnail}
                  alt="Video thumbnail"
                  className="thumbnail"
                />
              )}
              <div className="details">
                <h3>{videoInfo.title}</h3>
                <p className="uploader">{videoInfo.uploader}</p>
                <p className="duration">{formatDuration(videoInfo.duration)}</p>
              </div>
            </div>

            <div className="download-options">
              <button
                onClick={() => handleDownload('bestaudio/best')}
                disabled={downloading || separatingStems}
                className="download-btn"
              >
                {downloading ? 'EXTRACTING...' : 'EXTRACT AUDIO'}
              </button>
            </div>
          </div>
        )}

        {downloadSuccess && (
          <div className="success-section">
            <div className="file-info">
              <h3>EXTRACTION COMPLETE</h3>
              <p className="filename">{downloadSuccess.filename}</p>
            </div>

            <div className="player-section">
              <audio
                controls
                preload="metadata"
                className="audio-player"
                src={downloadSuccess.streamUrl}
              >
                Your browser does not support the audio element.
              </audio>
            </div>

            <div className="download-section">
              <a
                href={downloadSuccess.downloadUrl}
                download
                className="download-link"
              >
                DOWNLOAD
              </a>
            </div>

            {downloadSuccess.canSeparateStems && (
              <div className="stem-separation-section">
                <h4>STEM ISOLATION</h4>
                <p>
                  Separate audio into individual components:\nvocals • drums •
                  bass • melodies
                </p>
                <button
                  onClick={handleSeparateStems}
                  disabled={separatingStems}
                  className="stems-btn"
                >
                  {separatingStems ? 'ISOLATING...' : 'ISOLATE STEMS'}
                </button>
                {separatingStems && (
                  <div className="stem-progress">
                    <div className="progress-bar">
                      <div className="progress-fill"></div>
                    </div>
                    <p>Processing with AI... This may take 30-60 seconds</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {stemsResult && (
          <div className="stems-result">
            <h3>ISOLATION COMPLETE</h3>
            <p>{stemsResult.stems.length} stems extracted</p>

            {stemsResult.musicAnalysis && (
              <div className="music-analysis">
                <h4>MUSICAL ANALYSIS</h4>
                <div className="analysis-grid">
                  {stemsResult.musicAnalysis.tempo && (
                    <div className="analysis-item">
                      <span className="analysis-label">TEMPO</span>
                      <span className="analysis-value">
                        {stemsResult.musicAnalysis.tempo} BPM
                        {stemsResult.musicAnalysis.tempoConfidence && (
                          <span className="confidence">
                            {Math.round(
                              stemsResult.musicAnalysis.tempoConfidence * 100
                            )}
                            % confidence
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                  {stemsResult.musicAnalysis.key && (
                    <div className="analysis-item">
                      <span className="analysis-label">KEY</span>
                      <span className="analysis-value">
                        {stemsResult.musicAnalysis.key}
                        {stemsResult.musicAnalysis.keyConfidence && (
                          <span className="confidence">
                            {Math.round(
                              stemsResult.musicAnalysis.keyConfidence * 100
                            )}
                            % confidence
                          </span>
                        )}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="stems-grid">
              {stemsResult.stems.map((stem, index) => (
                <div key={index} className="stem-item">
                  <div className="stem-header">
                    <h4>{getStemDisplayName(stem.type).toUpperCase()}</h4>
                  </div>

                  <div className="stem-controls">
                    <audio
                      controls
                      preload="metadata"
                      className="stem-player"
                      src={stem.streamUrl}
                    >
                      Your browser does not support the audio element.
                    </audio>

                    <a
                      href={stem.downloadUrl}
                      download
                      className="stem-download-link"
                    >
                      DOWNLOAD
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
