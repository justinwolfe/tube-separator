require('dotenv').config({ path: '../.env' });
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const { setTimeout } = require('timers/promises');

const app = express();
const PORT = process.env.PORT || 7329;
const FADR_API_KEY = process.env.FADR_API_KEY;
const FADR_API_URL = 'https://api.fadr.com';

if (!FADR_API_KEY) {
  console.warn(
    '⚠️  Warning: FADR_API_KEY not found in environment variables. Stem separation will not work.'
  );
}

// Middleware
app.use(cors());
app.use(express.json());
// app.use(express.static(path.join(__dirname, '../client/build')));

// Create downloads directory if it doesn't exist
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Create metadata storage directory if it doesn't exist
const metadataDir = path.join(__dirname, 'metadata');
if (!fs.existsSync(metadataDir)) {
  fs.mkdirSync(metadataDir, { recursive: true });
}

// Helper function to save metadata
function saveMetadata(filename, data) {
  try {
    const metadataFile = path.join(metadataDir, `${filename}.json`);
    // Use atomic write to prevent partial writes that might trigger nodemon
    const tempFile = metadataFile + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2));
    fs.renameSync(tempFile, metadataFile);
  } catch (error) {
    console.error('Error saving metadata:', error);
  }
}

// Helper function to load metadata
function loadMetadata(filename) {
  try {
    const metadataFile = path.join(metadataDir, `${filename}.json`);
    if (fs.existsSync(metadataFile)) {
      return JSON.parse(fs.readFileSync(metadataFile, 'utf8'));
    }
  } catch (error) {
    console.error('Error loading metadata:', error);
  }
  return null;
}

// Helper function to get base filename without stem suffix
function getBaseFilename(filename) {
  return filename.replace(
    /_(vocals|drums|bass|instrumental|melodies|other)\.mp3$/,
    '.mp3'
  );
}

// Helper function for Fadr API requests
const fadrApiHeaders = {
  Authorization: `Bearer ${FADR_API_KEY}`,
};

// Fadr API helper functions
async function uploadToFadr(filePath, filename) {
  try {
    // Step 1: Create presigned upload URL
    const uploadResponse = await axios.post(
      `${FADR_API_URL}/assets/upload2`,
      {
        name: filename,
        extension: path.extname(filename).substring(1),
      },
      { headers: fadrApiHeaders }
    );

    const { url: uploadUrl, s3Path } = uploadResponse.data;

    // Step 2: Upload file to S3
    const fileBuffer = fs.readFileSync(filePath);
    await axios.put(uploadUrl, fileBuffer, {
      headers: { 'Content-Type': 'audio/mpeg' },
    });

    // Step 3: Create asset
    const assetResponse = await axios.post(
      `${FADR_API_URL}/assets`,
      {
        name: filename,
        extension: path.extname(filename).substring(1),
        group: `${filename}-group`,
        s3Path: s3Path,
      },
      { headers: fadrApiHeaders }
    );

    return assetResponse.data.asset;
  } catch (error) {
    console.error(
      'Error uploading to Fadr:',
      error.response?.data || error.message
    );
    throw error;
  }
}

async function createStemTask(assetId) {
  try {
    const response = await axios.post(
      `${FADR_API_URL}/assets/analyze/stem`,
      {
        _id: assetId,
      },
      { headers: fadrApiHeaders }
    );

    return response.data.task;
  } catch (error) {
    console.error(
      'Error creating stem task:',
      error.response?.data || error.message
    );
    throw error;
  }
}

async function pollTaskStatus(taskId, maxAttempts = 60) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const response = await axios.post(
        `${FADR_API_URL}/tasks/query`,
        {
          _ids: [taskId],
        },
        { headers: fadrApiHeaders }
      );

      const task = response.data.tasks[0];

      if (task.asset.stems?.length > 0) {
        return task;
      }

      if (task.status.complete && !task.asset.stems?.length) {
        throw new Error('Task completed but no stems were generated');
      }

      console.log(
        `Polling attempt ${attempt + 1}: ${task.status.msg} (${
          task.status.progress
        }%)`
      );
      await setTimeout(5000); // Wait 5 seconds before next poll
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        throw error;
      }
      await setTimeout(5000);
    }
  }
  throw new Error('Timeout waiting for stem separation to complete');
}

async function downloadStem(assetId, outputPath) {
  try {
    // Get download URL
    const response = await axios.get(
      `${FADR_API_URL}/assets/download/${assetId}/hq`,
      {
        headers: fadrApiHeaders,
      }
    );

    const downloadUrl = response.data.url;

    // Download the file
    const fileResponse = await axios.get(downloadUrl, {
      responseType: 'stream',
    });
    const writer = fs.createWriteStream(outputPath);

    return new Promise((resolve, reject) => {
      fileResponse.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    console.error(
      'Error downloading stem:',
      error.response?.data || error.message
    );
    throw error;
  }
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
    // First get video info to store metadata
    const ytdlpInfo = spawn('yt-dlp', ['--dump-json', '--no-download', url]);
    let videoInfoData = '';
    let infoError = '';

    ytdlpInfo.stdout.on('data', (chunk) => {
      videoInfoData += chunk;
    });

    ytdlpInfo.stderr.on('data', (chunk) => {
      infoError += chunk;
    });

    ytdlpInfo.on('close', (infoCode) => {
      if (infoCode !== 0) {
        return res
          .status(400)
          .json({ error: infoError || 'Failed to get video info' });
      }

      // Parse video info
      let videoInfo;
      try {
        videoInfo = JSON.parse(videoInfoData);
      } catch (parseError) {
        return res.status(500).json({ error: 'Failed to parse video info' });
      }

      // Generate filename based on video title and timestamp
      const timestamp = Date.now();
      const sanitizedTitle = videoInfo.title
        .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '_') // Replace spaces with underscores
        .substring(0, 50); // Limit length
      const filename = `${sanitizedTitle}_${timestamp}`;

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
          const downloadedFile = files.find((file) =>
            file.startsWith(filename)
          );

          if (downloadedFile) {
            // Save metadata
            const metadata = {
              originalUrl: url,
              title: videoInfo.title,
              uploader: videoInfo.uploader,
              duration: videoInfo.duration,
              thumbnail: videoInfo.thumbnail,
              downloadedAt: new Date().toISOString(),
              filename: downloadedFile,
              stems: [], // Will be populated when stems are separated
            };

            saveMetadata(downloadedFile, metadata);

            res.json({
              success: true,
              filename: downloadedFile,
              streamUrl: `/api/file/${downloadedFile}`,
              downloadUrl: `/api/download/${downloadedFile}`,
              canSeparateStems: !!FADR_API_KEY, // Include stem separation capability
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
    });
  } catch (err) {
    res.status(500).json({ error: 'Server error: ' + err.message });
  }
});

// Route to separate stems using Fadr API
app.post('/api/separate-stems', async (req, res) => {
  const { filename } = req.body;

  if (!filename) {
    return res.status(400).json({ error: 'Filename is required' });
  }

  if (!FADR_API_KEY) {
    return res.status(400).json({ error: 'Fadr API key not configured' });
  }

  const filePath = path.join(downloadsDir, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'File not found' });
  }

  // Set a longer timeout for this route
  req.setTimeout(300000); // 5 minutes
  res.setTimeout(300000); // 5 minutes

  try {
    console.log('🎵 Starting stem separation for:', filename);

    // Step 1: Upload to Fadr
    console.log('📤 Uploading to Fadr...');
    const asset = await uploadToFadr(filePath, filename);
    console.log('✅ Upload completed, asset ID:', asset._id);

    // Step 2: Create stem task
    console.log('⚙️  Creating stem task...');
    const task = await createStemTask(asset._id);
    console.log('✅ Stem task created, task ID:', task._id);

    // Step 3: Poll for completion
    console.log('⏳ Waiting for stem separation to complete...');
    const completedTask = await pollTaskStatus(task._id);
    console.log('✅ Stem separation completed');

    // Skip musical analysis - not reliable

    // Step 5: Get stem assets
    console.log('📥 Getting stem information...');
    const stemIds = completedTask.asset.stems;
    const stemResponses = await Promise.all(
      stemIds.map((id) =>
        axios.get(`${FADR_API_URL}/assets/${id}`, { headers: fadrApiHeaders })
      )
    );

    const stemAssets = stemResponses.map((response) => response.data.asset);

    // Step 6: Download stems
    console.log('💾 Downloading stems...');
    const stemsInfo = [];

    for (const stemAsset of stemAssets) {
      const stemType = stemAsset.metaData.stemType;
      const stemFilename = `${path.parse(filename).name}_${stemType}.mp3`;
      const stemPath = path.join(downloadsDir, stemFilename);

      await downloadStem(stemAsset._id, stemPath);

      stemsInfo.push({
        type: stemType,
        filename: stemFilename,
        streamUrl: `/api/file/${stemFilename}`,
        downloadUrl: `/api/download/${stemFilename}`,
      });
    }

    console.log('✅ Stem separation completed successfully!');

    // Update metadata with stems info
    const existingMetadata = loadMetadata(filename);
    if (existingMetadata) {
      existingMetadata.stems = stemsInfo;
      existingMetadata.stemsProcessedAt = new Date().toISOString();
      saveMetadata(filename, existingMetadata);
    }

    res.json({
      success: true,
      originalFile: filename,
      stems: stemsInfo,
      message: 'Stem separation completed successfully',
    });
  } catch (error) {
    console.error('❌ Error in stem separation:', error);
    res.status(500).json({
      error:
        'Stem separation failed: ' +
        (error.response?.data?.error || error.message),
    });
  }
});

// Route to serve downloaded files (for streaming/playing)
app.get('/api/file/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(downloadsDir, filename);

  if (fs.existsSync(filePath)) {
    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const range = req.headers.range;

    // Support range requests for audio streaming
    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      const chunksize = end - start + 1;
      const file = fs.createReadStream(filePath, { start, end });
      const head = {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunksize,
        'Content-Type': 'audio/mpeg',
      };
      res.writeHead(206, head);
      file.pipe(res);
    } else {
      const head = {
        'Content-Length': fileSize,
        'Content-Type': 'audio/mpeg',
      };
      res.writeHead(200, head);
      fs.createReadStream(filePath).pipe(res);
    }
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Route to download files (force download)
app.get('/api/download/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(downloadsDir, filename);

  if (fs.existsSync(filePath)) {
    res.download(filePath);
  } else {
    res.status(404).json({ error: 'File not found' });
  }
});

// Route to get saved files with metadata
app.get('/api/saved-files', (req, res) => {
  try {
    const files = fs.readdirSync(downloadsDir);

    // Group files by their base filename (original + stems)
    const fileGroups = {};

    files.forEach((file) => {
      const baseFilename = getBaseFilename(file);
      if (!fileGroups[baseFilename]) {
        fileGroups[baseFilename] = {
          original: null,
          stems: [],
          metadata: null,
        };
      }

      if (file === baseFilename) {
        // This is the original file
        const filePath = path.join(downloadsDir, file);
        const stats = fs.statSync(filePath);
        fileGroups[baseFilename].original = {
          filename: file,
          size: stats.size,
          created: stats.birthtime,
          streamUrl: `/api/file/${file}`,
          downloadUrl: `/api/download/${file}`,
        };

        // Load metadata for this file
        fileGroups[baseFilename].metadata = loadMetadata(file);
      } else {
        // This is a stem file
        const filePath = path.join(downloadsDir, file);
        const stats = fs.statSync(filePath);
        const stemType = file.match(
          /_(vocals|drums|bass|instrumental|melodies|other)\.mp3$/
        )?.[1];

        fileGroups[baseFilename].stems.push({
          filename: file,
          type: stemType,
          size: stats.size,
          created: stats.birthtime,
          streamUrl: `/api/file/${file}`,
          downloadUrl: `/api/download/${file}`,
        });
      }
    });

    // Convert to array and filter out groups without original files
    const savedFiles = Object.values(fileGroups)
      .filter((group) => group.original !== null)
      .map((group) => ({
        ...group,
        // Sort stems by type for consistent ordering
        stems: group.stems.sort((a, b) => {
          const order = [
            'vocals',
            'drums',
            'bass',
            'instrumental',
            'melodies',
            'other',
          ];
          return order.indexOf(a.type) - order.indexOf(b.type);
        }),
      }))
      .sort(
        (a, b) => new Date(b.original.created) - new Date(a.original.created)
      ); // Sort by newest first

    res.json(savedFiles);
  } catch (err) {
    console.error('Error getting saved files:', err);
    res.status(500).json({ error: 'Failed to get saved files' });
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
  console.log(`🚀 Server running on http://0.0.0.0:${PORT}`);
  console.log(`📱 Access from local network at http://[YOUR_LOCAL_IP]:${PORT}`);
  if (FADR_API_KEY) {
    console.log('🎵 Fadr API integration enabled - stem separation available');
  } else {
    console.log('⚠️  Fadr API key not configured - stem separation disabled');
  }
});
