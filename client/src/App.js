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

    try {
      const response = await axios.post('/api/download', { url, format });
      setDownloadSuccess(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'Download failed');
    } finally {
      setDownloading(false);
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

  return (
    <div className="App">
      <div className="container">
        <header className="header">
          <h1>🎵 YouTube Audio Downloader</h1>
          <p>Download MP3 audio from YouTube videos</p>
        </header>

        <div className="input-section">
          <div className="input-group">
            <input
              type="url"
              placeholder="Paste YouTube URL here..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              className="url-input"
              disabled={loading || downloading}
            />
            <button
              onClick={handleGetInfo}
              disabled={loading || downloading}
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
                disabled={downloading}
                className="download-btn primary"
              >
                {downloading ? '🎵 Downloading...' : '🎵 Download MP3 Audio'}
              </button>

              <button
                onClick={() => handleDownload('worstaudio/worst')}
                disabled={downloading}
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
                        disabled={downloading}
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
            <a
              href={downloadSuccess.downloadUrl}
              download
              className="download-link"
            >
              📥 Download File
            </a>
          </div>
        )}

        <footer className="footer">
          <p>🚀 Powered by youtube-dlp</p>
          <p className="tip">
            💡 Tip: Works best with YouTube, but supports many video sites!
          </p>
        </footer>
      </div>
    </div>
  );
}

export default App;
