import React, { useState } from 'react';
import axios from 'axios';
import './App.css';

function App() {
  const [activeTab, setActiveTab] = useState('main');
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [downloadSuccess, setDownloadSuccess] = useState(null);
  const [separatingStems, setSeparatingStems] = useState(false);
  const [stemsResult, setStemsResult] = useState(null);
  const [savedFiles, setSavedFiles] = useState([]);
  const [savedFilesLoading, setSavedFilesLoading] = useState(false);

  const loadSavedFiles = async () => {
    setSavedFilesLoading(true);
    try {
      const response = await axios.get('/api/saved-files');
      setSavedFiles(response.data);
    } catch (err) {
      console.error('Failed to load saved files:', err);
    } finally {
      setSavedFilesLoading(false);
    }
  };

  const handleTabChange = (tab) => {
    setActiveTab(tab);
    if (tab === 'saved') {
      loadSavedFiles();
    }
  };

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

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'main' ? 'active' : ''}`}
            onClick={() => handleTabChange('main')}
          >
            EXTRACT
          </button>
          <button
            className={`tab-button ${activeTab === 'saved' ? 'active' : ''}`}
            onClick={() => handleTabChange('saved')}
          >
            SAVED
          </button>
        </div>

        {/* Tab Content */}
        {activeTab === 'main' ? (
          <MainView
            url={url}
            setUrl={setUrl}
            videoInfo={videoInfo}
            loading={loading}
            downloading={downloading}
            separatingStems={separatingStems}
            error={error}
            downloadSuccess={downloadSuccess}
            stemsResult={stemsResult}
            handleGetInfo={handleGetInfo}
            handleDownload={handleDownload}
            handleSeparateStems={handleSeparateStems}
            formatDuration={formatDuration}
            getStemDisplayName={getStemDisplayName}
          />
        ) : (
          <SavedView
            savedFiles={savedFiles}
            loading={savedFilesLoading}
            formatDuration={formatDuration}
            getStemDisplayName={getStemDisplayName}
          />
        )}
      </div>
    </div>
  );
}

// Main tab component (existing functionality)
function MainView({
  url,
  setUrl,
  videoInfo,
  loading,
  downloading,
  separatingStems,
  error,
  downloadSuccess,
  stemsResult,
  handleGetInfo,
  handleDownload,
  handleSeparateStems,
  formatDuration,
  getStemDisplayName,
}) {
  return (
    <>
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
    </>
  );
}

// Saved tab component
function SavedView({
  savedFiles,
  loading,
  formatDuration,
  getStemDisplayName,
}) {
  if (loading) {
    return (
      <div className="saved-loading">
        <div className="loading-message">Loading saved files...</div>
      </div>
    );
  }

  if (savedFiles.length === 0) {
    return (
      <div className="saved-empty">
        <div className="empty-message">
          <h3>No saved files yet</h3>
          <p>Extract and isolate audio tracks to see them here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="saved-files">
      {savedFiles.map((fileGroup, index) => (
        <SavedFileItem
          key={fileGroup.original.filename}
          fileGroup={fileGroup}
          formatDuration={formatDuration}
          getStemDisplayName={getStemDisplayName}
        />
      ))}
    </div>
  );
}

// Individual saved file component
function SavedFileItem({ fileGroup, formatDuration, getStemDisplayName }) {
  const { original, stems, metadata } = fileGroup;
  const [expanded, setExpanded] = useState(false);

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div className="saved-file-item">
      <div className="saved-file-header" onClick={() => setExpanded(!expanded)}>
        <div className="saved-file-info">
          {metadata?.thumbnail && (
            <img
              src={metadata.thumbnail}
              alt="Video thumbnail"
              className="saved-thumbnail"
            />
          )}
          <div className="saved-details">
            <h3>{metadata?.title || original.filename}</h3>
            {metadata?.uploader && (
              <p className="saved-uploader">{metadata.uploader}</p>
            )}
            <div className="saved-meta">
              <span className="saved-duration">
                {metadata?.duration
                  ? formatDuration(metadata.duration)
                  : 'Unknown duration'}
              </span>
              <span className="saved-date">{formatDate(original.created)}</span>
              <span className="saved-size">
                {formatFileSize(original.size)}
              </span>
              {stems.length > 0 && (
                <span className="saved-stems-count">{stems.length} stems</span>
              )}
            </div>
          </div>
        </div>
        <div className="expand-arrow">{expanded ? '▼' : '▶'}</div>
      </div>

      {expanded && (
        <div className="saved-file-content">
          {/* Original File */}
          <div className="saved-original">
            <h4>ORIGINAL AUDIO</h4>
            <div className="saved-audio-section">
              <audio
                controls
                preload="metadata"
                className="saved-audio-player"
                src={original.streamUrl}
              >
                Your browser does not support the audio element.
              </audio>
              <a
                href={original.downloadUrl}
                download
                className="saved-download-link"
              >
                DOWNLOAD
              </a>
            </div>
          </div>

          {/* Musical Analysis */}
          {metadata?.musicAnalysis && (
            <div className="saved-music-analysis">
              <h4>MUSICAL ANALYSIS</h4>
              <div className="analysis-grid">
                {metadata.musicAnalysis.tempo && (
                  <div className="analysis-item">
                    <span className="analysis-label">TEMPO</span>
                    <span className="analysis-value">
                      {metadata.musicAnalysis.tempo} BPM
                      {metadata.musicAnalysis.tempoConfidence && (
                        <span className="confidence">
                          {Math.round(
                            metadata.musicAnalysis.tempoConfidence * 100
                          )}
                          % confidence
                        </span>
                      )}
                    </span>
                  </div>
                )}
                {metadata.musicAnalysis.key && (
                  <div className="analysis-item">
                    <span className="analysis-label">KEY</span>
                    <span className="analysis-value">
                      {metadata.musicAnalysis.key}
                      {metadata.musicAnalysis.keyConfidence && (
                        <span className="confidence">
                          {Math.round(
                            metadata.musicAnalysis.keyConfidence * 100
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

          {/* Stems */}
          {stems.length > 0 && (
            <div className="saved-stems">
              <h4>ISOLATED STEMS</h4>
              <div className="saved-stems-grid">
                {stems.map((stem, stemIndex) => (
                  <div key={stemIndex} className="saved-stem-item">
                    <div className="saved-stem-header">
                      <h5>{getStemDisplayName(stem.type).toUpperCase()}</h5>
                    </div>
                    <div className="saved-stem-controls">
                      <audio
                        controls
                        preload="metadata"
                        className="saved-stem-player"
                        src={stem.streamUrl}
                      >
                        Your browser does not support the audio element.
                      </audio>
                      <a
                        href={stem.downloadUrl}
                        download
                        className="saved-stem-download-link"
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
      )}
    </div>
  );
}

export default App;
