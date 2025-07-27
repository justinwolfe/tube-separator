# 📱 YouTube Downloader

A modern, mobile-friendly web application for downloading YouTube videos using youtube-dlp. Built with React frontend and Node.js backend, designed to work seamlessly on your local network and mobile devices.

## ✨ Features

- 🎯 **Simple Interface**: Clean, modern UI optimized for mobile devices
- 📱 **Mobile-Friendly**: Responsive design that works great on iOS and Android
- 🌐 **Local Network Access**: Access from any device on your local network
- 🔍 **Video Preview**: Get video information before downloading
- 📥 **Multiple Formats**: Choose from various video quality options
- ⚡ **Fast Downloads**: Powered by youtube-dlp for reliable downloads
- 🎨 **Beautiful UI**: Modern glassmorphism design with smooth animations

## 🛠️ Prerequisites

Before running this application, make sure you have:

1. **Node.js** (v14 or higher) - [Download here](https://nodejs.org/)
2. **youtube-dlp** - Install using one of these methods:

### Installing youtube-dlp

**On macOS (using Homebrew):**

```bash
brew update
brew install yt-dlp
```

**On macOS (using pip - Recommended):**

```bash
pip3 install yt-dlp
```

**On Linux:**

```bash
sudo apt update
sudo apt install yt-dlp
# or
pip3 install yt-dlp
```

**On Windows:**

- Download from [yt-dlp releases](https://github.com/yt-dlp/yt-dlp/releases)
- Or use pip: `pip install yt-dlp`

## 🚀 Quick Start

1. **Clone or download this project**

2. **Install all dependencies:**

   ```bash
   npm run install-all
   ```

3. **Start the development server:**

   ```bash
   npm run dev
   ```

4. **Access the app:**
   - Locally: `http://localhost:3000`
   - From other devices: `http://[YOUR-LOCAL-IP]:5000`

## 📖 Usage

1. **Get your local IP address:**

   ```bash
   # On macOS/Linux
   ifconfig | grep "inet " | grep -v 127.0.0.1

   # On Windows
   ipconfig | findstr "IPv4"
   ```

2. **Open the app on your mobile device:**

   - Enter `http://[YOUR-LOCAL-IP]:5000` in your mobile browser
   - For example: `http://192.168.1.100:5000`

3. **Download videos:**
   - Paste a YouTube URL in the input field
   - Tap the search button (🔍) to get video info
   - Choose your preferred download quality
   - Tap download and wait for completion
   - Download the file to your device

## 🏗️ Project Structure

```
youtube-downloader/
├── package.json          # Main project config
├── server/               # Backend (Node.js/Express)
│   ├── package.json
│   ├── index.js         # Main server file
│   └── downloads/       # Downloaded files (created automatically)
├── client/              # Frontend (React)
│   ├── package.json
│   ├── public/
│   │   ├── index.html
│   │   └── manifest.json
│   └── src/
│       ├── App.js       # Main React component
│       ├── App.css      # Styles
│       ├── index.js     # React entry point
│       └── index.css    # Global styles
└── README.md
```

## 🔧 Configuration

### Server Configuration

The server runs on port 5000 by default and binds to all network interfaces (`0.0.0.0`) to allow local network access.

To change the port, set the `PORT` environment variable:

```bash
PORT=8080 npm run dev
```

### Client Configuration

The React client runs on port 3000 in development mode and proxies API requests to the backend.

## 📱 Mobile Optimization

This app is specifically optimized for mobile devices:

- **Responsive Design**: Adapts to different screen sizes
- **Touch-Friendly**: Large buttons and touch targets
- **iOS Safari Support**: Prevents zoom on input focus
- **Fast Loading**: Optimized assets and code splitting
- **PWA Features**: Can be added to home screen on mobile

## 🎛️ API Endpoints

- `POST /api/video-info` - Get video information
- `POST /api/download` - Download video
- `GET /api/file/:filename` - Serve downloaded files
- `GET /api/downloads` - List downloaded files

## 🔒 Security Note

This application is designed for local network use only. Do not expose it to the public internet without proper security measures.

## 🐛 Troubleshooting

### Common Issues

1. **"yt-dlp not found" error:**

   - Make sure yt-dlp is installed and in your PATH
   - Try reinstalling: `pip3 install --upgrade yt-dlp`

2. **Can't access from mobile device:**

   - Ensure both devices are on the same network
   - Check firewall settings
   - Try accessing via the server's IP: `http://[LOCAL-IP]:5000`

3. **Download fails:**

   - Check if the URL is valid
   - Some videos may be restricted or private
   - Update yt-dlp: `pip3 install --upgrade yt-dlp`

4. **Port already in use:**
   - Change the port: `PORT=8080 npm run dev`
   - Kill existing processes on the port

### Getting Your Local IP

**macOS/Linux:**

```bash
ifconfig en0 | grep inet | head -1 | awk '{print $2}'
```

**Windows:**

```cmd
for /f "tokens=2 delims=:" %i in ('ipconfig ^| findstr "IPv4"') do echo %i
```

## 📦 Production Build

To build for production:

```bash
# Build the React app
npm run build

# Start production server
npm start
```

The production build will serve the React app from the Express server.

## 🤝 Contributing

Feel free to submit issues, fork the repository, and create pull requests for improvements.

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

---

**⚠️ Disclaimer:** This tool is for personal use only. Please respect YouTube's Terms of Service and copyright laws. Only download videos you have permission to download.
