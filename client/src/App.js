import React, { useState, useEffect } from 'react';
import axios from 'axios';
import './App.css';
import CustomAudioPlayer from './CustomAudioPlayer';
import BeatGridPlayerV2 from './BeatGridPlayerV2';

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
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [transcripts, setTranscripts] = useState({});
  const [generatingTranscript, setGeneratingTranscript] = useState(false);

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

  const generateTranscript = async (filename) => {
    setGeneratingTranscript(true);
    try {
      const response = await axios.post('/api/generate-transcript', {
        filename,
      });
      setTranscripts((prev) => ({
        ...prev,
        [filename]: response.data.transcript,
      }));
      return response.data.transcript;
    } catch (err) {
      console.error('Failed to generate transcript:', err);
      setError(err.response?.data?.error || 'Failed to generate transcript');
      return null;
    } finally {
      setGeneratingTranscript(false);
    }
  };

  const loadTranscript = async (filename) => {
    try {
      const response = await axios.get(`/api/transcript/${filename}`);
      setTranscripts((prev) => ({
        ...prev,
        [filename]: response.data.transcript,
      }));
      return response.data.transcript;
    } catch (err) {
      console.error('Failed to load transcript:', err);
      return null;
    }
  };

  const formatTranscript = async (filename) => {
    setGeneratingTranscript(true);
    try {
      const response = await axios.post('/api/format-transcript', {
        filename,
      });
      setTranscripts((prev) => ({
        ...prev,
        [filename]: response.data.transcript,
      }));
      return response.data.transcript;
    } catch (err) {
      console.error('Failed to format transcript:', err);
      setError(err.response?.data?.error || 'Failed to format transcript');
      return null;
    } finally {
      setGeneratingTranscript(false);
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

  const handleUpload = async (file) => {
    setUploading(true);
    setSeparatingStems(true);
    setError('');
    setExtractionResult(null);
    setUploadProgress(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // Upload and extract audio
      const uploadResponse = await axios.post('/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round(
            (progressEvent.loaded / progressEvent.total) * 100
          );
          setUploadProgress(progress);
        },
      });

      const uploadData = uploadResponse.data;

      // Set video info for uploaded file
      setVideoInfo({
        title: uploadData.title,
        duration: uploadData.duration,
        uploader: 'uploaded file',
      });

      // Update extraction result with upload
      setExtractionResult({
        ...uploadData,
        stems: [],
        processingStems: true,
      });

      setUploading(false);

      // If stem separation is available, automatically start it
      if (uploadData.canSeparateStems) {
        try {
          const stemsResponse = await axios.post(
            '/api/separate-stems',
            {
              filename: uploadData.filename,
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
            'audio extracted successfully, but stem separation failed';

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
      setError(err.response?.data?.error || 'upload failed');
      setUploading(false);
    } finally {
      setSeparatingStems(false);
      setUploadProgress(0);
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
      other: 'Instrumental w/o Drums',
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
            className={`tab-button ${activeTab === 'upload' ? 'active' : ''}`}
            onClick={() => handleTabChange('upload')}
          >
            upload
          </button>
          <button
            className={`tab-button ${activeTab === 'saved' ? 'active' : ''}`}
            onClick={() => handleTabChange('saved')}
          >
            saved
          </button>
          <button
            className={`tab-button ${activeTab === 'v2' ? 'active' : ''}`}
            onClick={() => handleTabChange('v2')}
          >
            v2
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
            transcripts={transcripts}
            generateTranscript={generateTranscript}
            loadTranscript={loadTranscript}
            formatTranscript={formatTranscript}
            generatingTranscript={generatingTranscript}
          />
        ) : activeTab === 'upload' ? (
          <UploadView
            videoInfo={videoInfo}
            uploading={uploading}
            uploadProgress={uploadProgress}
            separatingStems={separatingStems}
            error={error}
            extractionResult={extractionResult}
            handleUpload={handleUpload}
            formatDuration={formatDuration}
            getStemDisplayName={getStemDisplayName}
            transcripts={transcripts}
            generateTranscript={generateTranscript}
            loadTranscript={loadTranscript}
            formatTranscript={formatTranscript}
            generatingTranscript={generatingTranscript}
          />
        ) : activeTab === 'saved' ? (
          <SavedView
            savedFiles={savedFiles}
            loading={savedFilesLoading}
            formatDuration={formatDuration}
            getStemDisplayName={getStemDisplayName}
            transcripts={transcripts}
            generateTranscript={generateTranscript}
            loadTranscript={loadTranscript}
            formatTranscript={formatTranscript}
            generatingTranscript={generatingTranscript}
          />
        ) : (
          <V2View
            savedFiles={savedFiles}
            loading={savedFilesLoading}
            formatDuration={formatDuration}
            getStemDisplayName={getStemDisplayName}
            loadSavedFiles={loadSavedFiles}
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
  transcripts,
  generateTranscript,
  loadTranscript,
  formatTranscript,
  generatingTranscript,
}) {
  // Load transcript when extraction result becomes available
  React.useEffect(() => {
    if (extractionResult?.filename && !transcripts[extractionResult.filename]) {
      loadTranscript(extractionResult.filename);
    }
  }, [extractionResult?.filename, transcripts, loadTranscript]);

  const handleGenerateTranscript = async () => {
    if (extractionResult?.filename) {
      await generateTranscript(extractionResult.filename);
    }
  };

  return (
    <>
      <div className="input-section">
        <div className="input-group">
          <input
            type="url"
            placeholder="enter video url..."
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
                transcript={transcripts[extractionResult.filename]}
                originalFilename={extractionResult.filename}
              />
              {extractionResult.processingStems && (
                <div className="stem-progress">
                  <div className="progress-bar">
                    <div className="progress-fill"></div>
                  </div>
                  <p>separating stems via fadr...this may take 30-60 seconds</p>
                </div>
              )}

              {/* Transcript Generation */}
              {extractionResult.canGenerateTranscript &&
                !transcripts[extractionResult.filename] &&
                !generatingTranscript && (
                  <div className="transcript-generation">
                    <button
                      onClick={handleGenerateTranscript}
                      className="transcript-btn"
                      disabled={generatingTranscript}
                    >
                      generate transcript
                    </button>
                  </div>
                )}

              {/* Format existing transcript */}
              {transcripts[extractionResult.filename] &&
                transcripts[extractionResult.filename].text &&
                !transcripts[extractionResult.filename].formattedText &&
                !generatingTranscript && (
                  <div className="transcript-generation">
                    <button
                      onClick={async () => {
                        await formatTranscript(extractionResult.filename);
                      }}
                      className="transcript-btn"
                      disabled={generatingTranscript}
                    >
                      format transcript into lines
                    </button>
                  </div>
                )}

              {generatingTranscript && (
                <div className="transcript-progress">
                  <div className="progress-bar">
                    <div className="progress-fill"></div>
                  </div>
                  <p>
                    generating/formatting transcript with openai...this may take
                    30-60 seconds
                  </p>
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
  transcripts,
  generateTranscript,
  loadTranscript,
  formatTranscript,
  generatingTranscript,
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
          transcripts={transcripts}
          generateTranscript={generateTranscript}
          loadTranscript={loadTranscript}
          formatTranscript={formatTranscript}
          generatingTranscript={generatingTranscript}
        />
      ))}
    </div>
  );
}

// Upload tab component
function UploadView({
  videoInfo,
  uploading,
  uploadProgress,
  separatingStems,
  error,
  extractionResult,
  handleUpload,
  formatDuration,
  getStemDisplayName,
  transcripts,
  generateTranscript,
  loadTranscript,
  formatTranscript,
  generatingTranscript,
}) {
  const [dragActive, setDragActive] = useState(false);

  // Load transcript when extraction result becomes available
  React.useEffect(() => {
    if (extractionResult?.filename && !transcripts[extractionResult.filename]) {
      loadTranscript(extractionResult.filename);
    }
  }, [extractionResult?.filename, transcripts, loadTranscript]);

  const handleGenerateTranscript = async () => {
    if (extractionResult?.filename) {
      await generateTranscript(extractionResult.filename);
    }
  };

  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileSelect(e.dataTransfer.files[0]);
    }
  };

  const handleFileSelect = (file) => {
    // Check file type
    const allowedTypes = [
      'video/mp4',
      'video/avi',
      'video/mov',
      'video/mkv',
      'video/webm',
      'audio/mp3',
      'audio/wav',
      'audio/m4a',
    ];

    if (!allowedTypes.includes(file.type)) {
      alert(
        'Please select a video or audio file (MP4, AVI, MOV, MKV, WebM, MP3, WAV, M4A)'
      );
      return;
    }

    // Check file size (limit to 100MB)
    if (file.size > 100 * 1024 * 1024) {
      alert('File size must be less than 100MB');
      return;
    }

    handleUpload(file);
  };

  const disabled = uploading || separatingStems;

  return (
    <>
      {!extractionResult ? (
        <div className="upload-section">
          <div
            className={`upload-zone ${dragActive ? 'drag-active' : ''} ${
              disabled ? 'disabled' : ''
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="upload-content">
              <div className="upload-icon">📁</div>
              <h3>upload video or audio file</h3>
              <p>drag and drop a file here, or click to browse</p>
              <p className="upload-formats">
                supported: MP4, AVI, MOV, MKV, WebM, MP3, WAV, M4A
              </p>
              <p className="upload-limit">max file size: 100MB</p>

              <input
                type="file"
                id="file-upload"
                className="file-input"
                accept="video/*,audio/*"
                onChange={(e) => {
                  if (e.target.files[0]) {
                    handleFileSelect(e.target.files[0]);
                  }
                }}
                disabled={disabled}
              />
              <label htmlFor="file-upload" className="upload-btn">
                {uploading ? 'uploading...' : 'choose file'}
              </label>
            </div>
          </div>

          {uploading && (
            <div className="upload-progress">
              <div className="progress-bar">
                <div
                  className="progress-fill"
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
              <p>uploading file... {uploadProgress}%</p>
            </div>
          )}

          {separatingStems && !uploading && (
            <div className="processing-section">
              <div className="progress-bar">
                <div className="progress-fill"></div>
              </div>
              <p>
                extracting audio and separating stems...this may take 30-60
                seconds
              </p>
            </div>
          )}
        </div>
      ) : (
        <div className="upload-result">
          {videoInfo && (
            <div className="video-info">
              <div className="video-details">
                <div className="details">
                  <h3>{videoInfo.title}</h3>
                  <p className="uploader">{videoInfo.uploader}</p>
                  <p className="duration">
                    {formatDuration(videoInfo.duration)}
                  </p>
                </div>
              </div>
            </div>
          )}

          <div className="player-section">
            <CustomAudioPlayer
              originalTrack={extractionResult.streamUrl}
              stems={extractionResult.stems || []}
              className="main-player"
              transcript={transcripts[extractionResult.filename]}
              originalFilename={extractionResult.filename}
            />
            {extractionResult.processingStems && (
              <div className="stem-progress">
                <div className="progress-bar">
                  <div className="progress-fill"></div>
                </div>
                <p>separating stems via fadr...this may take 30-60 seconds</p>
              </div>
            )}

            {/* Transcript Generation */}
            {extractionResult.canGenerateTranscript &&
              !transcripts[extractionResult.filename] &&
              !generatingTranscript && (
                <div className="transcript-generation">
                  <button
                    onClick={handleGenerateTranscript}
                    className="transcript-btn"
                    disabled={generatingTranscript}
                  >
                    generate transcript
                  </button>
                </div>
              )}

            {/* Format existing transcript */}
            {transcripts[extractionResult.filename] &&
              transcripts[extractionResult.filename].text &&
              !transcripts[extractionResult.filename].formattedText &&
              !generatingTranscript && (
                <div className="transcript-generation">
                  <button
                    onClick={async () => {
                      await formatTranscript(extractionResult.filename);
                    }}
                    className="transcript-btn"
                    disabled={generatingTranscript}
                  >
                    format transcript into lines
                  </button>
                </div>
              )}

            {generatingTranscript && (
              <div className="transcript-progress">
                <div className="progress-bar">
                  <div className="progress-fill"></div>
                </div>
                <p>
                  generating/formatting transcript with openai...this may take
                  30-60 seconds
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {error && <div className="error-message">{error}</div>}
    </>
  );
}

// Individual saved file component
function SavedFileItem({
  fileGroup,
  formatDuration,
  getStemDisplayName,
  transcripts,
  generateTranscript,
  loadTranscript,
  formatTranscript,
  generatingTranscript,
}) {
  const { original, stems, metadata } = fileGroup;
  const [expanded, setExpanded] = useState(false);

  // Load transcript when component becomes expanded
  React.useEffect(() => {
    if (expanded && original.filename && !transcripts[original.filename]) {
      loadTranscript(original.filename);
    }
  }, [expanded, original.filename, transcripts, loadTranscript]);

  const handleGenerateTranscript = async () => {
    if (original.filename) {
      await generateTranscript(original.filename);
    }
  };

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
            transcript={transcripts[original.filename]}
            originalFilename={original.filename}
          />

          {/* Transcript Generation for saved files */}
          {!transcripts[original.filename] && !generatingTranscript && (
            <div className="transcript-generation">
              <button
                onClick={handleGenerateTranscript}
                className="transcript-btn"
                disabled={generatingTranscript}
              >
                generate transcript
              </button>
            </div>
          )}

          {/* Format existing transcript for saved files */}
          {transcripts[original.filename] &&
            transcripts[original.filename].text &&
            !transcripts[original.filename].formattedText &&
            !generatingTranscript && (
              <div className="transcript-generation">
                <button
                  onClick={async () => {
                    await formatTranscript(original.filename);
                  }}
                  className="transcript-btn"
                  disabled={generatingTranscript}
                >
                  format transcript into lines
                </button>
              </div>
            )}

          {generatingTranscript && (
            <div className="transcript-progress">
              <div className="progress-bar">
                <div className="progress-fill"></div>
              </div>
              <p>
                generating/formatting transcript with openai...this may take
                30-60 seconds
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function V2View({
  savedFiles,
  loading,
  loadSavedFiles,
  formatDuration,
  getStemDisplayName,
}) {
  const [selected, setSelected] = useState(null);
  useEffect(() => {
    if (!savedFiles?.length) loadSavedFiles();
  }, []);

  return (
    <div className="section">
      <h2>beat grid player v2 (experimental)</h2>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
        <div style={{ minWidth: 320 }}>
          <h3>choose a file</h3>
          {loading ? (
            <div>loading…</div>
          ) : (
            <ul style={{ maxHeight: 280, overflow: 'auto' }}>
              {(savedFiles || []).map((g) => (
                <li key={g.original.filename} style={{ marginBottom: 8 }}>
                  <button onClick={() => setSelected(g)}>
                    {g.metadata?.title || g.original.filename} (
                    {formatDuration(g.metadata?.duration || 0)})
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div style={{ flex: 1 }}>
          {selected ? (
            <BeatGridPlayerV2
              className="card"
              originalUrl={selected.original.streamUrl}
              filename={selected.original.filename}
              stems={selected.stems}
            />
          ) : (
            <div>pick a file on the left</div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
