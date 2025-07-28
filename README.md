# YouTube Audio Downloader & Stem Separator

A modern web application that downloads MP3 audio from YouTube videos and separates them into individual stems (vocals, drums, bass, melodies) using AI-powered stem separation.

## Features

- 🎵 Download audio from YouTube videos in MP3 format
- 🎛️ AI-powered stem separation using [Fadr API](https://fadr.com)
- 🎤 Separate tracks into: Vocals, Drums, Bass, Melodies, and Instrumental
- 🎧 Built-in audio player for preview
- 📱 Responsive design for mobile and desktop
- ⚡ Real-time processing status updates
- 🚀 Modern tech stack with Vite + Fastify for exceptional performance
- 📦 Efficient pnpm workspace for fast installs and better dependency management

## Setup Instructions

### Prerequisites

- Node.js (v18 or higher)
- pnpm (v8 or higher) - `npm install -g pnpm`
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) installed on your system
- Fadr API key (for stem separation feature)

### Installation

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd sampler
   ```

2. **Install dependencies**

   ```bash
   pnpm install
   ```

3. **Set up environment variables**

   Create a `.env` file in the root directory:

   ```bash
   cp .env.example .env
   ```

   Edit the `.env` file and add your Fadr API key:

   ```env
   FADR_API_KEY=your_fadr_api_key_here
   PORT=7329
   ```

### Getting Your Fadr API Key

1. Visit [Fadr.com](https://fadr.com) and create an account
2. Go to your account page and navigate to the API tab
3. Click "Create New API Key" and give it a name
4. Copy the generated API key to your `.env` file

**Important**: Keep your API key secret and never commit it to version control. The `.env` file is already included in `.gitignore`.

### Running the Application

1. **Development mode** (runs both client and server):

   ```bash
   pnpm run dev
   ```

2. **Production mode**:

   ```bash
   pnpm run build
   pnpm start
   ```

3. **Server only**:

   ```bash
   pnpm run server
   ```

4. **Client only**:
   ```bash
   pnpm run client
   ```

The application will be available at `http://localhost:7329`

## Usage

### Basic Audio Download

1. Paste a YouTube URL into the input field
2. Click the search icon to get video information
3. Choose your preferred download quality
4. Click "Download MP3 Audio" to download the file
5. Use the built-in player to preview the audio

### Stem Separation

1. After downloading an audio file, you'll see a "Stem Separation" section
2. Click "Separate into Stems" to start the AI processing
3. Wait 30-60 seconds for the separation to complete
4. Preview and download individual stems (vocals, drums, bass, etc.)

## API Endpoints

### Video Information

- `POST /api/video-info` - Get video metadata
- `POST /api/download` - Download video as MP3

### Stem Separation

- `POST /api/separate-stems` - Separate audio into stems

### File Management

- `GET /api/file/:filename` - Stream audio files
- `GET /api/download/:filename` - Download files
- `GET /api/downloads` - List all downloaded files

## How Stem Separation Works

The stem separation feature uses the [Fadr API](https://fadr.com/docs/api-stems-tutorial) which employs advanced AI models to:

1. **Upload** your audio file to Fadr's servers
2. **Analyze** the audio using machine learning models
3. **Separate** the audio into 5 primary stems:
   - 🎤 **Vocals** - Lead and backing vocals
   - 🥁 **Drums** - Drum kit and percussion
   - 🎸 **Bass** - Bass guitar and low-end instruments
   - 🎹 **Melodies** - Lead instruments and melodies
   - 🎼 **Instrumental** - Combined instrumental track
4. **Download** the separated stems back to your server

## Technical Stack

- **Frontend**: React 18+ with Vite (lightning-fast builds and HMR)
- **Backend**: Fastify (high-performance Node.js framework, 2-3x faster than Express)
- **Build Tool**: Vite (next-generation frontend tooling, replaces webpack)
- **Package Manager**: pnpm (fast, efficient, disk-space friendly)
- **Audio Processing**: yt-dlp for downloads, Fadr API for stem separation
- **Environment**: ES modules with dotenv for modern JavaScript standards

### Performance Benefits

- **⚡ Vite**: Sub-second cold starts, instant hot module replacement
- **🚀 Fastify**: ~65k requests/sec vs ~35k with Express
- **📦 pnpm**: Up to 2x faster installs, significant disk space savings
- **🏗️ ES Modules**: Native browser support, better tree-shaking

## Troubleshooting

### Stem Separation Not Available

- Ensure your `FADR_API_KEY` is correctly set in the `.env` file
- Check that the server console shows "Fadr API integration enabled"
- Verify your Fadr account has sufficient credits

### Download Issues

- Make sure `yt-dlp` is installed and available in your system PATH
- Try different video URLs if one doesn't work
- Check the server logs for detailed error messages

### Audio Playback Issues

- Ensure your browser supports MP3 playback
- Check that downloaded files exist in the `server/downloads/` directory
- Try refreshing the page if audio controls don't appear

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

MIT License - see LICENSE file for details

## Acknowledgments

- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for video downloading
- [Fadr](https://fadr.com) for AI-powered stem separation
- React and Node.js communities for excellent documentation
