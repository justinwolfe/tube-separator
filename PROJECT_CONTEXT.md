# PROJECT_CONTEXT.md

## Overview

**tube-stemmer** (formerly sampler) is a modern web application that downloads MP3 audio from YouTube videos and separates them into individual stems (vocals, drums, bass, melodies) using AI-powered stem separation. The project also supports file upload, transcript generation via OpenAI Whisper, and comprehensive audio playback with visual waveforms.

## 🏗️ Architecture

### Project Structure

```
sampler/
├── client/                 # React frontend (Vite + React 18)
│   ├── src/
│   │   ├── App.js         # Main application with 2 tabs (Main/Saved) - unified download/upload
│   │   ├── App.css        # Modern dark theme with gradient effects
│   │   ├── CustomAudioPlayer.js  # Advanced audio player with WaveSurfer.js
│   │   ├── CustomAudioPlayer.css
│   │   ├── BeatGridPlayerV2.js   # (Legacy - may be unused)
│   │   └── index.js       # App entry point
│   ├── package.json       # Client dependencies
│   └── vite.config.js     # Vite configuration with proxy to backend
├── server/                 # Fastify backend (High-performance Node.js)
│   ├── index.js           # Main server with all API endpoints
│   ├── downloads/         # Storage for downloaded audio files
│   ├── metadata/          # JSON metadata for each file
│   ├── python/            # Python environment (only .venv exists)
│   ├── package.json       # Server dependencies
│   └── nodemon.json       # Development server configuration
├── package.json           # Root workspace configuration
├── pnpm-workspace.yaml    # pnpm monorepo setup
├── README.md              # Comprehensive setup and usage guide
└── MIGRATION.md           # Tech stack upgrade documentation
```

### Tech Stack

- **Frontend**: React 18, Vite, WaveSurfer.js, Axios
- **Backend**: Fastify, Node.js 18+, ES Modules
- **Package Manager**: pnpm (workspace-based monorepo)
- **Audio Processing**: yt-dlp, ffmpeg, Fadr API, OpenAI Whisper
- **Development**: Hot Module Replacement, concurrent dev servers

## 🎵 Core Features

### 1. YouTube Audio Download

- Paste YouTube URLs (supports mobile links, youtu.be, etc.)
- Video metadata extraction (title, duration, uploader, thumbnail)
- High-quality MP3 extraction using yt-dlp
- Real-time download progress indicators
- Automatic file naming with sanitized titles and timestamps

### 2. File Upload Processing

- Drag-and-drop interface for video/audio files
- Supports: MP4, AVI, MOV, MKV, WebM, MP3, WAV, M4A
- 100MB file size limit
- FFmpeg-based audio extraction from video files
- Progress tracking for uploads

### 3. AI-Powered Stem Separation

- **Integration**: Fadr API for advanced AI stem separation
- **Stems Generated**:
  - 🎤 Vocals (lead and backing vocals)
  - 🥁 Drums (drum kit and percussion)
  - 🎸 Bass (bass guitar and low-end instruments)
  - 🎹 Melodies (lead instruments and melodies)
  - 🎼 Instrumental (combined instrumental track)
- **Process**: Upload to Fadr → AI Analysis → Download separated stems (30-60 seconds)
- Automatic processing after download/upload completion

### 4. Advanced Audio Player

- **Multi-Waveform Visualization**: Multiple stacked waveforms showing original track + all stems simultaneously
- **Optional Video Surface**: When available, a video element renders above the waveforms and stays time-synced during play, seek, and stem switches
- **Synchronized Playback Position**: All waveforms display the same cursor position and progress
- **Interactive Stem Switching**: Click on any waveform to switch to that stem for playback
- **Active Stem Highlighting**: Visual styling to indicate which stem is currently playing
- **Individual Stem Labels**: Clear labels for Original, Vocals, Drums, Bass, Melodies, etc.
- **Playback Controls**: Play/pause, seek forward/backward (5s), volume control
- **Range Requests**: Supports HTTP range requests for streaming
- **Touch/Mobile Support**: Responsive touch controls and gestures
- **Memory Management**: Proper cleanup of multiple WaveSurfer instances to prevent memory leaks
- **Vocals Lyrics Single-Line Feed**: When `transcript.formattedText` and `transcript.words` are available, a time-synced single lyric line renders directly below the `vocals` waveform. Each word remains a timestamped link (click to seek), highlighting in real time during playback.

### 5. Transcript Generation & Display

- **OpenAI Whisper Integration**: Automatic speech-to-text transcription
- **Features**:
  - Word-level timestamps for precise seeking
  - Clickable words to jump to specific times
  - Auto-formatted text using GPT-3.5-turbo for readability
  - Real-time word highlighting during playback
  - Toggle show/hide transcript interface

### 6. File Management System

- **Saved Files Tab**: Browse all downloaded files with metadata
- **Metadata Storage**: JSON files storing video info, stems, transcripts
- **File Grouping**: Original files automatically grouped with their stems
- **Sorting**: Files sorted by creation date (newest first)
- **File Serving**: Stream files for playback or force download

## 🔌 API Endpoints

### Video Processing

- `POST /api/video-info` - Extract YouTube video metadata
- `POST /api/download` - Download YouTube video as MP3, optionally also download MP4 video (<=720p)
  - Body: `{ url: string, format?: string, withVideo?: boolean }`
  - Response adds `videoStreamUrl` and `videoDownloadUrl` when `withVideo` succeeds
- `POST /api/upload` - Upload and process video/audio files

### AI Services

- `POST /api/separate-stems` - Separate audio into stems via Fadr API
- `POST /api/generate-transcript` - Generate transcript via OpenAI Whisper
- `POST /api/format-transcript` - Format existing transcript text
- `GET /api/transcript/:filename` - Retrieve saved transcript

### File Management

- `GET /api/file/:filename` - Stream audio or video files (supports range requests; correct MIME)
- `GET /api/download/:filename` - Force download audio or video
- `POST /api/export-video` - Export an MP4 by muxing the selected stem audio with the downloaded video
  - Body: `{ filename: string /* base audio filename */ , stemType?: 'original'|'vocals'|'drums'|'bass'|'melodies'|'instrumental'|'other' }`
  - Output: MP4 with video stream copied and audio re-encoded to AAC; length is shortest of A/V
- `GET /api/saved-files` - List all files with metadata and stems
- `GET /api/downloads` - Simple file listing

## 🎨 User Interface

### Modern Design System

- **Theme**: Dark interface with subtle gradients and transparency effects
- **Typography**: Inter font family with varied weights and letter spacing
- **Colors**: Black background with white text and subtle accent gradients
- **Layout**: Centered 800px max-width with responsive design
- **Interactions**: Smooth transitions and hover effects throughout

### Two-Tab Interface

1. **Main Tab**: Unified YouTube URL input and file upload with conditional drag-and-drop area
2. **Saved Tab**: Library of all processed files with playback

### Component Hierarchy

```
App
├── TabNavigation (Main/Saved)
├── MainView (Unified Download/Upload)
│   ├── URLInput + UploadButton
│   ├── ConditionalDragDropZone
│   ├── VideoInfo Display
│   ├── CustomAudioPlayer
│   └── TranscriptGeneration
└── SavedView
    └── SavedFileItem[]
        ├── FileMetadata
        ├── CustomAudioPlayer
        └── TranscriptGeneration
```

## ⚙️ Configuration & Environment

### Required Environment Variables

```env
FADR_API_KEY=your_fadr_api_key_here    # For stem separation
OPENAI_API_KEY=your_openai_key_here    # For transcript generation
PORT=7329                               # Server port (default)
```

### System Dependencies

- **Node.js**: v18+ (ES modules, top-level await)
  - **Note**: This project uses fnm (Fast Node Manager) for Node.js version management and upgrades
- **pnpm**: v8+ (package manager)
- **yt-dlp**: System installation required for YouTube downloads
- **ffmpeg**: Required for audio processing and format conversion

### Development Setup

```bash
pnpm install                # Install all dependencies
pnpm run dev               # Run both client (3000) and server (7329)
pnpm run kill-ports        # Kill any conflicting processes
```

## 📊 Performance Optimizations

### Build Performance

- **Vite**: Sub-second cold starts, ~50-200ms HMR
- **Code Splitting**: Vendor chunks (React), axios separate bundle
- **ES Modules**: Native browser support, better tree-shaking

### Runtime Performance

- **Fastify**: ~65k req/sec vs Express ~35k req/sec
- **pnpm**: 2-3x faster installs, significant disk space savings
- **Audio Streaming**: HTTP range requests for efficient audio loading
- **Throttled UI Updates**: RequestAnimationFrame for smooth timeline scrubbing

### Memory Management

- **Audio Element Cleanup**: Proper cleanup of multiple audio instances
- **Animation Frame Cleanup**: Cancel pending RAF calls on unmount
- **WaveSurfer Cleanup**: Destroy instances to prevent memory leaks

## 🔧 Development Patterns

### State Management

- React hooks for local component state
- Axios for HTTP client communication
- Real-time UI updates for processing status

### Error Handling

- Try-catch blocks around all async operations
- User-friendly error messages displayed in UI
- Console error logging for debugging
- Graceful degradation when API keys missing

### File Organization

- Monorepo structure with clear client/server separation
- CSS co-located with components
- Metadata stored separately from audio files
- Atomic file operations to prevent corruption

## 🚨 Known Considerations

### API Dependencies

- **Fadr API**: Required for stem separation (has usage limits/costs)
- **OpenAI API**: Required for transcript generation (has usage costs)
- **External Tools**: yt-dlp and ffmpeg must be installed on system

### File Storage

- Files stored in `server/downloads/` directory
- Metadata stored in `server/metadata/` as JSON files
- No automatic cleanup - files persist until manually removed
- 100MB upload limit enforced for file uploads

### Browser Compatibility

- Modern browsers required for ES modules and Web Audio API
- WaveSurfer.js requires browsers with Web Audio support
- Range request support needed for audio streaming

## 🛠️ Recent Changes (Migration)

### Tech Stack Modernization

**Before**: Create React App + Express + npm + CommonJS
**After**: Vite + Fastify + pnpm + ES Modules

### Performance Improvements

- Dev server startup: ~15-30s → ~1-3s (**5-10x faster**)
- Hot reload: ~2-5s → ~50-200ms (**10-25x faster**)
- Build time: ~45-90s → ~10-20s (**4-5x faster**)
- Server throughput: ~35k → ~65k req/sec (**~2x faster**)

### Compatibility

- All existing functionality preserved
- Same API endpoints and environment variables
- Identical user workflows and features

### Audio Player Improvements (December 2024)

- Seamless stem switching: when clicking a different stem waveform or label, playback continues immediately from the same timestamp without requiring manual pause/play.
- Preload behavior: audio elements switched to `preload="auto"` for the original and all stems to reduce switch latency.
- Robust readiness handling: new stem playback begins muted under the same user activation, seeks to the captured time after metadata is available, then unmutes to avoid pops.

### Player UI Enhancements (December 2024)

- Added a synced, single-line lyrics display mounted directly beneath the vocals stem container. It mirrors the transcript word behavior: clickable timestamped words and active-word highlighting. This is implemented via a portal in `client/src/CustomAudioPlayer.js` and styled in `client/src/CustomAudioPlayer.css`.

### Start Point Marker (December 2024)

- Press `F` to set a persistent start point at the current playback time. A vertical start marker is rendered across all stacked waveforms and stays synchronized as you seek or resize. Playback will resume from this start point when pressing play if the current position is before it. The marker is cleaned up properly during re-initialization and unmount.

### Layout & Responsiveness (December 2024)

- Landscape optimizations: increased stacked waveform heights and spacing on landscape screens, with wider container max-width on large landscape viewports to make better use of horizontal space.
- Active waveform styling: the currently active stem container is now borderless/edgeless to emphasize focus and reduce visual clutter.

### Keyboard Shortcuts

- Space: Toggle play/pause
- T: Cycle through available stems (Original → next stem ...)
- Arrow Left/Right: Seek backward/forward 0.5s
- F: Set start point and display a synchronized marker across all waveforms

### UI Consolidation (December 2024)

- **Unified Interface**: Merged download and upload functionality into a single main tab for improved user experience
- **Conditional Upload Area**: Upload button beside the URL input toggles a drag-and-drop area when clicked
- **Streamlined Navigation**: Reduced from 3 tabs (Download/Upload/Saved) to 2 tabs (Main/Saved)
- **Preserved Functionality**: All existing download and upload features maintained with identical behavior
- **Cleaner Layout**: Eliminated tab switching between download and upload workflows

## 📝 Usage Workflow

### Typical User Journey

1. **Input**: Paste YouTube URL or upload file
2. **Processing**: Automatic download/extraction + stem separation
3. **Playback**: Interactive waveform player with stem switching
4. **Transcription**: Generate clickable, time-synced transcripts
5. **Library**: Access all processed files in saved tab

### File Lifecycle

```
Input (URL/Upload) → Download/Extract → Stem Separation → Metadata Storage → Library Access
                                    ↓
                              Transcript Generation (Optional)
```

This context provides a comprehensive foundation for understanding the tube-stemmer application architecture, features, and development patterns. The application represents a modern, high-performance approach to audio processing with AI integration and excellent user experience.

---

_Last updated: December 17, 2024 - This file should be updated whenever significant changes are made to the repository._
