const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn, exec } = require('child_process');
const { URL } = require('url');

const PORT = 48912;
const DEFAULT_DOWNLOAD_DIR = path.join(os.homedir(), 'Downloads');
let downloadDir = fs.existsSync(DEFAULT_DOWNLOAD_DIR)
  ? DEFAULT_DOWNLOAD_DIR
  : path.join(__dirname, 'downloads');

const BIN_DIR = path.join(__dirname, 'bin');
const YTDLP_PATH = path.join(BIN_DIR, 'yt-dlp.exe');
const FFMPEG_PATH = path.join(BIN_DIR, 'ffmpeg.exe');

// In-memory downloads store
const downloads = [];
const sseClients = new Set();

function broadcastSSE(data) {
  const msg = `data: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(msg);
    } catch (e) {
      sseClients.delete(client);
    }
  }
}

// Periodically broadcast updates
setInterval(() => {
  if (sseClients.size > 0 && downloads.length > 0) {
    broadcastSSE({
      type: 'progress',
      downloads: downloads.map(d => ({
        id: d.id,
        title: d.title,
        url: d.url,
        resolution: d.resolution,
        status: d.status,
        progress: d.progress,
        speed: d.speed,
        size: d.size,
        eta: d.eta,
        filePath: d.filePath,
        error: d.error,
        createdAt: d.createdAt
      }))
    });
  }
}, 400);

function isYouTubeUrl(url) {
  try {
    const parsed = new URL(url);
    return parsed.hostname.includes('youtube.com') || parsed.hostname.includes('youtu.be');
  } catch (e) {
    return false;
  }
}

function startYouTubeDownload(item) {
  const formatMap = {
    '1080p': 'bestvideo[height<=1080]+bestaudio/best[height<=1080]',
    '720p': 'bestvideo[height<=720]+bestaudio/best[height<=720]',
    '480p': 'bestvideo[height<=480]+bestaudio/best[height<=480]',
    '360p': 'bestvideo[height<=360]+bestaudio/best[height<=360]',
    'best': 'bestvideo+bestaudio/best'
  };

  const isAudio = item.resolution === 'audio' ||
                  item.resolution === 'mp3' ||
                  item.resolution === 'mp3-high' ||
                  item.resolution === 'mp3-std' ||
                  item.resolution === 'm4a' ||
                  item.resolution === 'wav';

  const outTemplate = path.join(downloadDir, '%(title)s.%(ext)s');

  const args = [
    '--no-playlist',
    '--newline',
    '--ffmpeg-location', BIN_DIR,
    '-o', outTemplate,
    item.url
  ];

  if (isAudio) {
    let audioFormat = 'mp3';
    let quality = '0'; // best 320kbps

    if (item.resolution === 'm4a') {
      audioFormat = 'm4a';
    } else if (item.resolution === 'wav') {
      audioFormat = 'wav';
    } else if (item.resolution === 'mp3-std') {
      audioFormat = 'mp3';
      quality = '5'; // 128kbps
    } else {
      audioFormat = 'mp3';
      quality = '0';
    }

    args.push('-x', '--audio-format', audioFormat);
    if (audioFormat === 'mp3') {
      args.push('--audio-quality', quality);
    }
  } else {
    const chosenFormat = formatMap[item.resolution] || 'bestvideo+bestaudio/best';
    args.push('-f', chosenFormat, '--merge-output-format', 'mp4');
  }

  const child = spawn(YTDLP_PATH, args, { windowsHide: true });
  item.process = child;
  item.status = 'downloading';

  let lastLine = '';

  child.stdout.on('data', (chunk) => {
    const text = chunk.toString();
    const lines = text.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      lastLine = trimmed;

      // Extract filename: [download] Destination: ... or [Merger] Merging formats into "..."
      if (trimmed.includes('Destination: ')) {
        const p = trimmed.split('Destination: ')[1];
        if (p) item.filePath = p.trim().replace(/^"/, '').replace(/"$/, '');
      } else if (trimmed.includes('Merging formats into "')) {
        const match = trimmed.match(/Merging formats into "(.*?)"/);
        if (match && match[1]) item.filePath = match[1];
      } else if (trimmed.includes('[ExtractAudio] Destination: ')) {
        item.filePath = trimmed.split('[ExtractAudio] Destination: ')[1].trim();
      }

      // Progress line format: [download]  45.2% of ~  24.12MiB at  3.50MiB/s ETA 00:04
      const dlMatch = trimmed.match(/\[download\]\s+([\d\.]+)%\s+of\s+~?([^\s]+)\s+at\s+([^\s]+)\s+ETA\s+([^\s]+)/i);
      if (dlMatch) {
        item.progress = parseFloat(dlMatch[1]);
        item.size = dlMatch[2];
        item.speed = dlMatch[3];
        item.eta = dlMatch[4];
      } else {
        const simpleMatch = trimmed.match(/\[download\]\s+([\d\.]+)%/);
        if (simpleMatch) {
          item.progress = parseFloat(simpleMatch[1]);
        }
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    console.error(`yt-dlp stderr [${item.id}]:`, chunk.toString());
  });

  child.on('close', (code) => {
    item.process = null;
    if (code === 0) {
      item.progress = 100;
      item.status = 'completed';
      item.speed = 'Selesai';
      item.eta = '00:00';
      if (!item.filePath) {
        item.filePath = path.join(downloadDir, `${item.title || 'video'}.mp4`);
      }
    } else {
      if (item.status !== 'cancelled' && item.status !== 'paused') {
        item.status = 'error';
        item.error = lastLine || `Proses gagal dengan kode ${code}`;
      }
    }
  });

  child.on('error', (err) => {
    item.process = null;
    item.status = 'error';
    item.error = err.message;
  });
}

function startDirectDownload(item) {
  const protocol = item.url.startsWith('https:') ? require('https') : require('http');
  const parsed = new URL(item.url);
  const rawFileName = path.basename(parsed.pathname) || `download_${Date.now()}`;
  const targetFile = path.join(downloadDir, rawFileName);
  item.filePath = targetFile;
  item.title = item.title || rawFileName;
  item.status = 'downloading';

  const fileStream = fs.createWriteStream(targetFile);

  const req = protocol.get(item.url, (res) => {
    if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
      item.url = res.headers.location;
      startDirectDownload(item);
      return;
    }

    const totalBytes = parseInt(res.headers['content-length'] || '0', 10);
    let downloadedBytes = 0;
    let lastTime = Date.now();
    let bytesSinceLast = 0;

    res.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      bytesSinceLast += chunk.length;
      fileStream.write(chunk);

      const now = Date.now();
      const elapsed = (now - lastTime) / 1000;
      if (elapsed >= 0.5) {
        const speedBps = bytesSinceLast / elapsed;
        item.speed = `${(speedBps / (1024 * 1024)).toFixed(2)} MB/s`;
        if (totalBytes > 0) {
          item.progress = parseFloat(((downloadedBytes / totalBytes) * 100).toFixed(1));
          item.size = `${(totalBytes / (1024 * 1024)).toFixed(1)} MB`;
          const remaining = (totalBytes - downloadedBytes) / speedBps;
          item.eta = `${Math.round(remaining)}s`;
        } else {
          item.size = `${(downloadedBytes / (1024 * 1024)).toFixed(1)} MB`;
        }
        lastTime = now;
        bytesSinceLast = 0;
      }
    });

    res.on('end', () => {
      fileStream.end();
      item.progress = 100;
      item.status = 'completed';
      item.speed = 'Selesai';
    });
  });

  req.on('error', (err) => {
    fileStream.close();
    item.status = 'error';
    item.error = err.message;
  });

  item.req = req;
}

// HTTP Server
const server = http.createServer((req, res) => {
  // Setup CORS & Private Network Access (PNA)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Access-Control-Request-Private-Network');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = parsedUrl.pathname;

  // SSE Events stream
  if (pathname === '/api/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    });
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  // API: Get Status
  if (pathname === '/api/status' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      online: true,
      port: PORT,
      downloadDir: downloadDir,
      hasYtDlp: fs.existsSync(YTDLP_PATH),
      hasFFmpeg: fs.existsSync(FFMPEG_PATH),
      totalDownloads: downloads.length,
      activeDownloads: downloads.filter(d => d.status === 'downloading').length
    }));
    return;
  }

  // API: List Downloads
  if (pathname === '/api/downloads' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(downloads.map(d => ({
      id: d.id,
      title: d.title,
      url: d.url,
      resolution: d.resolution,
      status: d.status,
      progress: d.progress,
      speed: d.speed,
      size: d.size,
      eta: d.eta,
      filePath: d.filePath,
      error: d.error,
      createdAt: d.createdAt
    }))));
    return;
  }

  // API: Add Download
  if (pathname === '/api/download' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (!data.url) {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: false, error: 'URL diperlukan' }));
          return;
        }

        const id = `dl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        const newItem = {
          id: id,
          title: data.title || 'Video Unduhan',
          url: data.url,
          resolution: data.resolution || '720p',
          status: 'pending',
          progress: 0,
          speed: '0 KB/s',
          size: 'Menghitung...',
          eta: '--:--',
          filePath: null,
          error: null,
          createdAt: new Date().toISOString()
        };

        downloads.unshift(newItem);

        if (isYouTubeUrl(data.url)) {
          startYouTubeDownload(newItem);
        } else {
          startDirectDownload(newItem);
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, download: { id: newItem.id, title: newItem.title } }));
      } catch (err) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message }));
      }
    });
    return;
  }

  // API: Actions (open folder, open file, cancel, delete)
  if (pathname === '/api/action' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try {
        const { action, id } = JSON.parse(body);
        const item = downloads.find(d => d.id === id);

        if (action === 'open-folder') {
          const folder = (item && item.filePath && fs.existsSync(item.filePath))
            ? path.dirname(item.filePath)
            : downloadDir;
          exec(`explorer.exe "${folder}"`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        if (action === 'open-file' && item && item.filePath && fs.existsSync(item.filePath)) {
          exec(`start "" "${item.filePath}"`);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        if (action === 'cancel' && item) {
          if (item.process) {
            item.process.kill();
          }
          if (item.req) {
            item.req.abort();
          }
          item.status = 'cancelled';
          item.speed = 'Dibatalkan';
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        if (action === 'delete' && item) {
          if (item.process) item.process.kill();
          const idx = downloads.indexOf(item);
          if (idx !== -1) downloads.splice(idx, 1);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
          return;
        }

        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: 'Aksi tidak valid' }));
      } catch (e) {
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: e.message }));
      }
    });
    return;
  }

  // Static files in /public
  let filePath = path.join(__dirname, 'public', pathname === '/' ? 'index.html' : pathname);
  if (!fs.existsSync(filePath)) {
    filePath = path.join(__dirname, 'public', 'index.html');
  }

  const ext = path.extname(filePath).toLowerCase();
  const mimeMap = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.json': 'application/json'
  };

  fs.readFile(filePath, (err, content) => {
    if (err) {
      res.writeHead(404);
      res.end('File not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': mimeMap[ext] || 'text/plain' });
    res.end(content);
  });
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`  IDS Downloader Server berjalan di:`);
  console.log(`  http://127.0.0.1:${PORT}`);
  console.log(`  Folder Unduhan: ${downloadDir}`);
  console.log(`====================================================`);
});
