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

async function extractTempoAndKey(assetId) {
  try {
    // Get detailed asset information that includes musical analysis
    const response = await axios.get(`${FADR_API_URL}/assets/${assetId}`, {
      headers: fadrApiHeaders,
    });

    const asset = response.data.asset;

    const musicData = {
      tempo: null,
      key: null,
      keyConfidence: null,
      tempoConfidence: null,
    };

    // Extract tempo and key from metaData if available
    if (asset.metaData) {
      if (asset.metaData.bpm !== undefined) {
        musicData.tempo = asset.metaData.bpm;
      }
      if (asset.metaData.tempo !== undefined) {
        musicData.tempo = asset.metaData.tempo;
      }
      if (asset.metaData.key !== undefined) {
        musicData.key = asset.metaData.key;
      }
      if (asset.metaData.keyConfidence !== undefined) {
        musicData.keyConfidence = asset.metaData.keyConfidence;
      }
      if (asset.metaData.tempoConfidence !== undefined) {
        musicData.tempoConfidence = asset.metaData.tempoConfidence;
      }
    }

    // Check if the completed task has analysis data
    if (asset.analysis) {
      if (asset.analysis.tempo !== undefined) {
        musicData.tempo = asset.analysis.tempo;
      }
      if (asset.analysis.bpm !== undefined) {
        musicData.tempo = asset.analysis.bpm;
      }
      if (asset.analysis.key !== undefined) {
        musicData.key = asset.analysis.key;
      }
      if (asset.analysis.keyConfidence !== undefined) {
        musicData.keyConfidence = asset.analysis.keyConfidence;
      }
      if (asset.analysis.tempoConfidence !== undefined) {
        musicData.tempoConfidence = asset.analysis.tempoConfidence;
      }
    }

    return musicData;
  } catch (error) {
    console.warn(
      '⚠️  Could not extract tempo and key information:',
      error.response?.data || error.message
    );
    return {
      tempo: null,
      key: null,
      keyConfidence: null,
      tempoConfidence: null,
    };
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

  try {
    console.log('🎵 Starting stem separation for:', filename);

    // Step 1: Upload to Fadr
    console.log('📤 Uploading to Fadr...');
    const asset = await uploadToFadr(filePath, filename);

    // Step 2: Create stem task
    console.log('⚙️  Creating stem task...');
    const task = await createStemTask(asset._id);

    // Step 3: Poll for completion
    console.log('⏳ Waiting for stem separation to complete...');
    const completedTask = await pollTaskStatus(task._id);

    // Step 4: Extract tempo and key information
    console.log('🎼 Extracting tempo and key information...');

    // First try to extract from the completedTask.asset
    let musicAnalysis = {
      tempo: null,
      key: null,
      keyConfidence: null,
      tempoConfidence: null,
    };

    if (completedTask.asset.metaData) {
      if (completedTask.asset.metaData.bpm !== undefined) {
        musicAnalysis.tempo = completedTask.asset.metaData.bpm;
      }
      if (completedTask.asset.metaData.tempo !== undefined) {
        musicAnalysis.tempo = completedTask.asset.metaData.tempo;
      }
      if (completedTask.asset.metaData.key !== undefined) {
        musicAnalysis.key = completedTask.asset.metaData.key;
      }
    }

    if (completedTask.asset.analysis) {
      if (completedTask.asset.analysis.tempo !== undefined) {
        musicAnalysis.tempo = completedTask.asset.analysis.tempo;
      }
      if (completedTask.asset.analysis.bpm !== undefined) {
        musicAnalysis.tempo = completedTask.asset.analysis.bpm;
      }
      if (completedTask.asset.analysis.key !== undefined) {
        musicAnalysis.key = completedTask.asset.analysis.key;
      }
    }

    // If we didn't find data in completedTask, try the separate API call
    if (!musicAnalysis.tempo && !musicAnalysis.key) {
      console.log('🔍 No musical analysis in main asset, checking stems...');
      musicAnalysis = await extractTempoAndKey(completedTask.asset._id);
    }

    // Step 5: Get stem assets
    console.log('📥 Getting stem information...');
    const stemIds = completedTask.asset.stems;
    const stemResponses = await Promise.all(
      stemIds.map((id) =>
        axios.get(`${FADR_API_URL}/assets/${id}`, { headers: fadrApiHeaders })
      )
    );

    const stemAssets = stemResponses.map((response) => response.data.asset);

    // Check if any stems contain musical analysis data
    console.log('🔍 Debug: Checking stems for musical analysis data...');
    stemAssets.forEach((stem, index) => {
      console.log(`🔍 Debug: Stem ${index} (${stem.metaData?.stemType}):`);
      if (stem.metaData) {
        console.log(`  metaData:`, JSON.stringify(stem.metaData, null, 2));
      }
      if (stem.analysis) {
        console.log(`  analysis:`, JSON.stringify(stem.analysis, null, 2));
      }

      // Check for tempo/key in stem metadata
      if (stem.metaData?.tempo || stem.metaData?.bpm || stem.metaData?.key) {
        console.log(`🎵 Found musical data in stem ${index}:`, {
          tempo: stem.metaData.tempo,
          bpm: stem.metaData.bpm,
          key: stem.metaData.key,
        });

        // Use data from the first stem that has it
        if (
          !musicAnalysis.tempo &&
          (stem.metaData.tempo || stem.metaData.bpm)
        ) {
          musicAnalysis.tempo = stem.metaData.tempo || stem.metaData.bpm;
        }
        if (!musicAnalysis.key && stem.metaData.key) {
          musicAnalysis.key = stem.metaData.key;
        }
      }
    });

    // Try to create a separate musical analysis task if no data found
    if (!musicAnalysis.tempo && !musicAnalysis.key) {
      console.log('🔍 Debug: Trying to create musical analysis task...');
      try {
        // Try different analysis task types that might exist in Fadr API
        const analysisTaskTypes = [
          'music',
          'tempo',
          'key',
          'analyze',
          'musical',
        ];

        for (const taskType of analysisTaskTypes) {
          try {
            console.log(`🔍 Debug: Trying analysis task type: ${taskType}`);
            const analysisResponse = await axios.post(
              `${FADR_API_URL}/assets/analyze/${taskType}`,
              { _id: completedTask.asset._id },
              { headers: fadrApiHeaders }
            );
            console.log(`✅ Found working analysis endpoint: ${taskType}`);
            console.log(
              '🔍 Analysis response:',
              JSON.stringify(analysisResponse.data, null, 2)
            );
            break;
          } catch (error) {
            console.log(
              `❌ Analysis task type ${taskType} not available:`,
              error.response?.status
            );
          }
        }
      } catch (error) {
        console.log(
          '⚠️ Could not create musical analysis task:',
          error.response?.data || error.message
        );
      }
    }

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

    // Format key information for better readability
    const formatKey = (keyValue) => {
      if (keyValue === null || keyValue === undefined) return null;

      const keyNames = [
        'C',
        'C#/Db',
        'D',
        'D#/Eb',
        'E',
        'F',
        'F#/Gb',
        'G',
        'G#/Ab',
        'A',
        'A#/Bb',
        'B',
      ];

      if (typeof keyValue === 'number' && keyValue >= 0 && keyValue <= 11) {
        return keyNames[keyValue];
      }

      return keyValue; // Return as-is if it's already a string or unexpected format
    };

    res.json({
      success: true,
      originalFile: filename,
      stems: stemsInfo,
      musicAnalysis: {
        tempo: musicAnalysis.tempo
          ? Math.round(musicAnalysis.tempo * 10) / 10
          : null, // Round to 1 decimal place
        tempoConfidence: musicAnalysis.tempoConfidence,
        key: formatKey(musicAnalysis.key),
        keyConfidence: musicAnalysis.keyConfidence,
      },
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
