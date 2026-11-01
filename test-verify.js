const http = require('http');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('--- RUNNING IDM CLONE VERIFICATION TESTS ---');

// 1. Verify Binaries
const ytdlp = path.join(__dirname, 'bin', 'yt-dlp.exe');
const ffmpeg = path.join(__dirname, 'bin', 'ffmpeg.exe');

if (!fs.existsSync(ytdlp)) throw new Error('yt-dlp.exe missing');
if (!fs.existsSync(ffmpeg)) throw new Error('ffmpeg.exe missing');

const ytVer = execSync(`"${ytdlp}" --version`).toString().trim();
console.log(`[PASS] yt-dlp binary verified: version ${ytVer}`);

const ffVer = execSync(`"${ffmpeg}" -version`).toString().split('\n')[0].trim();
console.log(`[PASS] ffmpeg binary verified: ${ffVer}`);

// 2. Verify Extension Manifest
const manifestPath = path.join(__dirname, 'extension', 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.manifest_version !== 3) throw new Error('Manifest version must be 3');
if (!fs.existsSync(path.join(__dirname, 'extension', 'content.js'))) throw new Error('content.js missing');
if (!fs.existsSync(path.join(__dirname, 'extension', 'content.css'))) throw new Error('content.css missing');
if (!fs.existsSync(path.join(__dirname, 'extension', 'icons', 'icon16.png'))) throw new Error('icon16.png missing');
console.log('[PASS] Extension files and Manifest V3 verified');

// 3. Verify Server Startup & Endpoints
require('./server.js');

setTimeout(async () => {
  const req = http.get('http://127.0.0.1:48912/api/status', (res) => {
    let body = '';
    res.on('data', chunk => body += chunk);
    res.on('end', () => {
      const data = JSON.parse(body);
      if (data.online && data.port === 48912) {
        console.log('[PASS] Server online & API status responding:', data);
        console.log('--- ALL VERIFICATION TESTS PASSED ---');
        process.exit(0);
      } else {
        console.error('[FAIL] Unexpected status payload', data);
        process.exit(1);
      }
    });
  });
  req.on('error', (err) => {
    console.error('[FAIL] HTTP request error:', err);
    process.exit(1);
  });
}, 1000);
