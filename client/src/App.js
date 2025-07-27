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

  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown size';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round((bytes / Math.pow(1024, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'Unknown duration';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStemIcon = (stemType) => {
    const icons = {
      vocals: '🎤',
      drums: '🥁',
      bass: '🎸',
      melodies: '🎹',
      instrumental: '🎼',
      other: '🎵',
    };
    return icons[stemType] || icons.other;
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
          <h1>🎵 YouTube Audio Downloader & Stem Separator</h1>
          <p>
            Download MP3 audio from YouTube videos and separate into individual
            stems
          </p>
        </header>

        <div className="input-section">
          <div className="input-group">
            <input
              type="url"
              placeholder="Paste YouTube URL here..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="url-input"
              disabled={loading || downloading || separatingStems}
            />
            <button
              onClick={handleGetInfo}
              disabled={loading || downloading || separatingStems}
              className="info-btn"
            >
              {loading ? '⏳' : '🔍'}
            </button>
          </div>
        </div>

        {error && <div className="error-message">❌ {error}</div>}

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
                <p className="uploader">👤 {videoInfo.uploader}</p>
                <p className="duration">
                  ⏱️ {formatDuration(videoInfo.duration)}
                </p>
              </div>
            </div>

            <div className="download-options">
              <button
                onClick={() => handleDownload('bestaudio/best')}
                disabled={downloading || separatingStems}
                className="download-btn primary"
              >
                {downloading ? '🎵 Downloading...' : '🎵 Download MP3 Audio'}
              </button>

              <button
                onClick={() => handleDownload('worstaudio/worst')}
                disabled={downloading || separatingStems}
                className="download-btn secondary"
              >
                {downloading
                  ? '🎵 Downloading...'
                  : '📱 Download Lower Quality MP3'}
              </button>
            </div>

            {videoInfo.formats && videoInfo.formats.length > 0 && (
              <div className="formats-section">
                <h4>Available Formats:</h4>
                <div className="formats-list">
                  {videoInfo.formats.slice(0, 5).map((format, index) => (
                    <div key={index} className="format-item">
                      <span className="format-quality">
                        {format.quality || format.ext}
                      </span>
                      <span className="format-size">
                        {formatFileSize(format.filesize)}
                      </span>
                      <button
                        onClick={() => handleDownload(format.format_id)}
                        disabled={downloading || separatingStems}
                        className="format-download-btn"
                      >
                        ⬇️
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {downloadSuccess && (
          <div className="success-message">
            <h3>✅ Download Complete!</h3>
            <p>File: {downloadSuccess.filename}</p>

            <div className="player-section">
              <h4>🎵 Play Audio</h4>
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
                📥 Download File
              </a>
            </div>

            {downloadSuccess.canSeparateStems && (
              <div className="stem-separation-section">
                <h4>🎛️ Stem Separation</h4>
                <p>
                  Separate this audio into individual tracks (vocals, drums,
                  bass, melodies)
                </p>
                <button
                  onClick={handleSeparateStems}
                  disabled={separatingStems}
                  className="stems-btn"
                >
                  {separatingStems
                    ? '🎛️ Separating Stems... (This may take 30-60 seconds)'
                    : '🎛️ Separate into Stems'}
                </button>
                {separatingStems && (
                  <div className="stem-progress">
                    <p>
                      ⏳ Processing with AI... Please wait while we separate
                      your audio into individual stems.
                    </p>
                    <p>
                      💡 This process typically takes 30-60 seconds depending on
                      the length of your audio.
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {stemsResult && (
          <div className="stems-result">
            <h3>🎛️ Stem Separation Complete!</h3>
            <p>
              Your audio has been separated into {stemsResult.stems.length}{' '}
              individual stems:
            </p>

            <div className="stems-grid">
              {stemsResult.stems.map((stem, index) => (
                <div key={index} className="stem-item">
                  <div className="stem-header">
                    <span className="stem-icon">{getStemIcon(stem.type)}</span>
                    <h4>{getStemDisplayName(stem.type)}</h4>
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
                      📥 Download {getStemDisplayName(stem.type)}
                    </a>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <footer className="footer">
          <p>🚀 Powered by youtube-dlp & Fadr AI</p>
          <p className="tip">
            💡 Tip: Works best with YouTube, but supports many video sites!
          </p>
          <p className="tip">
            🎛️ Stem separation uses AI to isolate vocals, drums, bass, and
            melodies
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
