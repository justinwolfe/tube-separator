const express = require('express');
const cors = require('cors');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 7329;

// Middleware
app.use(cors());
app.use(express.json());
// app.use(express.static(path.join(__dirname, '../client/build')));

// Create downloads directory if it doesn't exist
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Route to get video info
app.post('/api/video-info', async (req, res) => {
  const { url } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Get video info using yt-dlp
    const ytdlp = spawn('yt-dlp', ['--dump-json', '--no-download', url]);

    let data = '';
    let error = '';

    ytdlp.stdout.on('data', (chunk) => {
      data += chunk;
    });

    ytdlp.stderr.on('data', (chunk) => {
      error += chunk;
    });

    ytdlp.on('close', (code) => {
      if (code === 0) {
        try {
          const videoInfo = JSON.parse(data);
          res.json({
            title: videoInfo.title,
            duration: videoInfo.duration,
            uploader: videoInfo.uploader,
            thumbnail: videoInfo.thumbnail,
            formats:
              videoInfo.formats?.map((f) => ({
                format_id: f.format_id,
                ext: f.ext,
                quality: f.format_note,
                filesize: f.filesize,
              })) || [],
          });
        } catch (parseError) {
          res.status(500).json({ error: 'Failed to parse video info' });
        }
      } else {
        res.status(400).json({ error: error || 'Failed to get video info' });
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Route to download video
app.post('/api/download', async (req, res) => {
  const { url, format = 'bestaudio/best' } = req.body;

  if (!url) {
    return res.status(400).json({ error: 'URL is required' });
  }

  try {
    // Generate filename based on timestamp
    const timestamp = Date.now();
    const filename = `audio_${timestamp}`;

    // Download video using yt-dlp
    const ytdlp = spawn('yt-dlp', [
      '-f',
      format,
      '--extract-audio',
      '--audio-format',
      'mp3',
      '-o',
      path.join(downloadsDir, `${filename}.%(ext)s`),
      url,
    ]);

    let error = '';

    ytdlp.stderr.on('data', (chunk) => {
      error += chunk;
    });

    ytdlp.on('close', (code) => {
      if (code === 0) {
        // Find the downloaded file
        const files = fs.readdirSync(downloadsDir);
        const downloadedFile = files.find((file) => file.startsWith(filename));

        if (downloadedFile) {
          res.json({
            success: true,
            filename: downloadedFile,
            downloadUrl: `/api/file/${downloadedFile}`,
          });
        } else {
          res
            .status(500)
            .json({ error: 'Download completed but file not found' });
        }
      } else {
        res.status(400).json({ error: error || 'Download failed' });
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Route to serve downloaded files
app.get('/api/file/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(downloadsDir, filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Route to list downloaded files
app.get('/api/downloads', (req, res) => {
  try {
    const files = fs.readdirSync(downloadsDir);
    const fileList = files.map((file) => {
      const filePath = path.join(downloadsDir, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        created: stats.birthtime,
      };
    });
    res.json(fileList);
  } catch (err) {
    res.status(500).json({ error: 'Failed to list downloads' });
  }
});

// Serve React app for any non-API routes (disabled for development)
// app.get('*', (req, res) => {
//   res.sendFile(path.join(__dirname, '../client/build/index.html'));
// });

// Start server on all interfaces (0.0.0.0) to allow local network access
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server running on http://0.0.0.0:${PORT}`);
  console.log(`Access from local network at http://[YOUR_LOCAL_IP]:${PORT}`);
});
