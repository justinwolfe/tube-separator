import React, { useState } from 'react';
import axios from 'axios';
import './App.css';
import CustomAudioPlayer from './CustomAudioPlayer';

function App() {
  const [activeTab, setActiveTab] = useState('main');
  const [url, setUrl] = useState('');
  const [videoInfo, setVideoInfo] = useState(null);
  const [downloading, setDownloading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [extractionResult, setExtractionResult] = useState(null);
  const [separatingStems, setSeparatingStems] = useState(false);
  const [savedFiles, setSavedFiles] = useState([]);
  const [savedFilesLoading, setSavedFilesLoading] = useState(false);

  const loadSavedFiles = async () => {
    setSavedFilesLoading(true);
    try {
      const response = await axios.get('/api/saved-files');
      setSavedFiles(response.data);
    } catch (err) {
      console.error('failed to load saved files:', err);
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
      setError('please enter a youtube url');
      return;
    }

    setLoading(true);
    setError('');
    setVideoInfo(null);

    try {
      const response = await axios.post('/api/video-info', { url });
      setVideoInfo(response.data);
    } catch (err) {
      setError(err.response?.data?.error || 'failed to get video info');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async (format = 'best') => {
    setDownloading(true);
    setSeparatingStems(true);
    setError('');
    setExtractionResult(null);

    try {
      // First download the audio
      const downloadResponse = await axios.post('/api/download', {
        url,
        format,
      });
      const downloadData = downloadResponse.data;

      // Update extraction result with initial download
      setExtractionResult({
        ...downloadData,
        stems: [],
        processingStems: true,
      });

      setDownloading(false);

      // If stem separation is available, automatically start it
      if (downloadData.canSeparateStems) {
        try {
          const stemsResponse = await axios.post(
            '/api/separate-stems',
            {
              filename: downloadData.filename,
            },
            {
              timeout: 300000, // 5 minutes timeout
            }
          );

          // Update with stems data
          setExtractionResult((prev) => ({
            ...prev,
            stems: stemsResponse.data.stems,
            processingStems: false,
          }));
        } catch (stemsErr) {
          console.error('Stem separation error:', stemsErr);
          let errorMessage =
            'audio downloaded successfully, but stem separation failed';

          if (stemsErr.code === 'ECONNABORTED') {
            errorMessage +=
              ': request timed out. the server may be processing your request.';
          } else if (stemsErr.response?.data?.error) {
            errorMessage += ': ' + stemsErr.response.data.error;
          } else {
            errorMessage += ': ' + stemsErr.message;
          }

          setError(errorMessage);
          setExtractionResult((prev) => ({
            ...prev,
            processingStems: false,
          }));
        }
      } else {
        setExtractionResult((prev) => ({
          ...prev,
          processingStems: false,
        }));
      }
    } catch (err) {
      setError(err.response?.data?.error || 'download failed');
      setDownloading(false);
    } finally {
      setSeparatingStems(false);
    }
  };

  const formatDuration = (seconds) => {
    if (!seconds) return 'unknown duration';
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
          <h1>tube-splitter</h1>
          <p>download • isolate • transform</p>
        </header>

        {/* Tab Navigation */}
        <div className="tab-navigation">
          <button
            className={`tab-button ${activeTab === 'main' ? 'active' : ''}`}
            onClick={() => handleTabChange('main')}
          >
            download
          </button>
          <button
            className={`tab-button ${activeTab === 'saved' ? 'active' : ''}`}
            onClick={() => handleTabChange('saved')}
          >
            saved
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
            extractionResult={extractionResult}
            handleGetInfo={handleGetInfo}
            handleDownload={handleDownload}
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
  extractionResult,
  handleGetInfo,
  handleDownload,
  formatDuration,
  getStemDisplayName,
}) {
  return (
    <>
      <div className="input-section">
        <div className="input-group">
          <input
            type="url"
            placeholder="enter youtube url..."
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
            {loading ? 'finding' : 'find'}
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

          {/* Show progress bar when processing, otherwise show button or player */}
          {downloading || separatingStems ? (
            <div className="processing-section">
              <div className="progress-bar">
                <div className="progress-fill"></div>
              </div>
              <p>
                {downloading
                  ? 'downloading audio...'
                  : 'separating stems via fadr...this may take 30-60 seconds'}
              </p>
            </div>
          ) : extractionResult ? (
            <div className="player-section">
              <CustomAudioPlayer
                originalTrack={extractionResult.streamUrl}
                stems={extractionResult.stems || []}
                className="main-player"
              />
              {extractionResult.processingStems && (
                <div className="stem-progress">
                  <div className="progress-bar">
                    <div className="progress-fill"></div>
                  </div>
                  <p>separating stems via fadr...this may take 30-60 seconds</p>
                </div>
              )}
            </div>
          ) : (
            <div className="download-options">
              <button
                onClick={() => handleDownload('bestaudio/best')}
                disabled={downloading || separatingStems}
                className="download-btn"
              >
                process
              </button>
            </div>
          )}
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
        <div className="loading-message">loading saved files...</div>
      </div>
    );
  }

  if (savedFiles.length === 0) {
    return (
      <div className="saved-empty">
        <div className="empty-message">
          <h3>no saved files yet</h3>
          <p>download and isolate audio tracks to see them here</p>
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
    if (bytes === 0) return '0 bytes';
    const k = 1024;
    const sizes = ['bytes', 'kb', 'mb', 'gb'];
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
                  : 'unknown duration'}
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
          <CustomAudioPlayer
            originalTrack={original.streamUrl}
            stems={stems}
            title={metadata?.title || original.filename}
            className="saved-player"
          />
        </div>
      )}
    </div>
  );
}

export default App;
