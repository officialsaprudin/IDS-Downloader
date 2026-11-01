// IDM YouTube Video Downloader Content Script
(function () {
  const SERVER_URL = 'http://127.0.0.1:48912';
  let isServerOnline = false;

  async function checkServer() {
    try {
      chrome.runtime.sendMessage({ type: 'CHECK_STATUS' }, (res) => {
        if (chrome.runtime.lastError || !res || !res.success) {
          isServerOnline = false;
          updateBadge(false);
        } else {
          isServerOnline = true;
          updateBadge(true);
        }
      });
    } catch (e) {
      isServerOnline = false;
      updateBadge(false);
    }
  }

  function updateBadge(online) {
    const badge = document.querySelector('.idm-server-badge');
    if (badge) {
      badge.textContent = online ? 'IDM Online' : 'IDM Offline';
      badge.className = `idm-server-badge ${online ? 'online' : ''}`;
    }
  }

  function showToast(message, type = 'success') {
    let toast = document.getElementById('idm-toast-popup');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'idm-toast-popup';
      document.body.appendChild(toast);
    }
    toast.className = `idm-toast-popup ${type} show`;
    toast.innerHTML = `<span>${type === 'success' ? '⚡' : '⚠️'}</span><span>${message}</span>`;
    setTimeout(() => {
      toast.className = 'idm-toast-popup';
    }, 4500);
  }

  function injectIDMButton() {
    // Check if we are on a watch page
    if (!location.pathname.includes('/watch') && !location.pathname.includes('/shorts')) {
      const existing = document.getElementById('idm-yt-floating-container');
      if (existing) existing.remove();
      return;
    }

    if (document.getElementById('idm-yt-floating-container')) {
      return; // Already injected
    }

    // Try finding YouTube player container
    const player = document.getElementById('movie_player') ||
                   document.querySelector('.html5-video-player') ||
                   document.getElementById('player-container');

    if (!player) return;

    const container = document.createElement('div');
    container.id = 'idm-yt-floating-container';

    container.innerHTML = `
      <button id="idm-yt-download-btn" title="Unduh Video Ini dengan IDM">
        <svg viewBox="0 0 24 24"><path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM17 13l-5 5-5-5h3V9h4v4h3z"/></svg>
        <span>Unduh Video Ini</span>
      </button>
      <div id="idm-yt-dropdown">
        <div class="idm-dropdown-header">
          <span>PILIH FORMAT</span>
          <span class="idm-server-badge">Checking...</span>
        </div>
        <div class="idm-dropdown-subheading">VIDEO (MP4)</div>
        <div class="idm-resolution-item" data-res="1080p">
          <span>🎬 1080p Full HD</span>
          <span class="idm-res-badge">MP4</span>
        </div>
        <div class="idm-resolution-item" data-res="720p">
          <span>🎬 720p HD</span>
          <span class="idm-res-badge">MP4</span>
        </div>
        <div class="idm-resolution-item" data-res="480p">
          <span>🎬 480p Standar</span>
          <span class="idm-res-badge">MP4</span>
        </div>
        <div class="idm-resolution-item" data-res="360p">
          <span>🎬 360p Ringan</span>
          <span class="idm-res-badge">MP4</span>
        </div>
        <div class="idm-dropdown-subheading">AUDIO / MUSIK (MP3)</div>
        <div class="idm-resolution-item" data-res="mp3">
          <span>🎵 Audio Kualitas Tinggi (320kbps)</span>
          <span class="idm-res-badge audio">MP3</span>
        </div>
        <div class="idm-resolution-item" data-res="mp3-std">
          <span>🎵 Audio Standar (128kbps)</span>
          <span class="idm-res-badge audio">MP3</span>
        </div>
        <div class="idm-resolution-item" data-res="m4a">
          <span>🎵 Audio AAC Asli YouTube</span>
          <span class="idm-res-badge audio">M4A</span>
        </div>
        <div class="idm-resolution-item" data-res="wav">
          <span>🎵 Audio Lossless</span>
          <span class="idm-res-badge audio">WAV</span>
        </div>
      </div>
    `;

    player.appendChild(container);

    const btn = container.querySelector('#idm-yt-download-btn');
    const dropdown = container.querySelector('#idm-yt-dropdown');

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.toggle('show');
      checkServer();
    });

    document.addEventListener('click', (e) => {
      if (!container.contains(e.target)) {
        dropdown.classList.remove('show');
      }
    });

    const resItems = container.querySelectorAll('.idm-resolution-item');
    resItems.forEach(item => {
      item.addEventListener('click', async (e) => {
        e.stopPropagation();
        dropdown.classList.remove('show');
        const resolution = item.getAttribute('data-res');
        await triggerDownload(resolution);
      });
    });

    checkServer();
  }

  async function triggerDownload(resolution) {
    const videoUrl = window.location.href;
    const titleEl = document.querySelector('h1.ytd-watch-metadata yt-formatted-string, #title h1 yt-formatted-string, h1.title');
    const title = titleEl ? titleEl.textContent.trim() : document.title.replace(' - YouTube', '').trim();

    showToast(`Mengirim ${resolution} ke aplikasi IDM...`);

    const payload = { url: videoUrl, resolution, title };

    try {
      chrome.runtime.sendMessage({ type: 'DOWNLOAD', payload }, (res) => {
        if (chrome.runtime.lastError || !res || !res.success) {
          showToast('⚠️ IDM Desktop belum berjalan! Buka start.bat terlebih dahulu.', 'error');
        } else {
          showToast(`✅ Berhasil ditambahkan ke IDM! Resolusi: ${resolution}`, 'success');
        }
      });
    } catch (err) {
      showToast('⚠️ IDM Desktop belum berjalan! Buka start.bat terlebih dahulu.', 'error');
    }
  }

  // Handle YouTube SPA page transitions
  window.addEventListener('yt-navigate-finish', injectIDMButton);
  window.addEventListener('load', injectIDMButton);
  setInterval(injectIDMButton, 2000);
})();
