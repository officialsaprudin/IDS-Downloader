// IDM Pro Desktop Client Controller
let downloads = [];
let currentFilter = 'all';
let searchQuery = '';

const downloadsListEl = document.getElementById('downloads-list');
const emptyStateEl = document.getElementById('empty-state');
const countAllEl = document.getElementById('count-all');
const countDownloadingEl = document.getElementById('count-downloading');
const countCompletedEl = document.getElementById('count-completed');
const countErrorEl = document.getElementById('count-error');

// Modal Elements
const addModal = document.getElementById('add-modal');
const extModal = document.getElementById('ext-modal');
const inputUrl = document.getElementById('input-url');
const selectRes = document.getElementById('select-res');
const searchInput = document.getElementById('search-input');
const toastEl = document.getElementById('toast');

function showToast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), 3500);
}

// Fetch initial downloads
async function loadDownloads() {
  try {
    const res = await fetch('/api/downloads');
    if (res.ok) {
      downloads = await res.json();
      render();
    }
  } catch (e) {
    console.error('Failed to load downloads', e);
  }
}

// Setup Server-Sent Events (SSE) for zero-latency live updates
function initSSE() {
  const evtSource = new EventSource('/api/events');
  evtSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      if (data.type === 'progress' && Array.isArray(data.downloads)) {
        downloads = data.downloads;
        render();
      }
    } catch (e) {}
  };
  evtSource.onerror = () => {
    // Fallback to polling if SSE disconnected
    setTimeout(loadDownloads, 2000);
  };
}

function updateCounts() {
  countAllEl.textContent = downloads.length;
  countDownloadingEl.textContent = downloads.filter(d => d.status === 'downloading').length;
  countCompletedEl.textContent = downloads.filter(d => d.status === 'completed').length;
  countErrorEl.textContent = downloads.filter(d => d.status === 'error' || d.status === 'cancelled').length;
}

function render() {
  updateCounts();

  let filtered = downloads.filter(d => {
    if (currentFilter === 'downloading') return d.status === 'downloading';
    if (currentFilter === 'completed') return d.status === 'completed';
    if (currentFilter === 'error') return d.status === 'error' || d.status === 'cancelled';
    return true;
  });

  if (searchQuery) {
    const q = searchQuery.toLowerCase();
    filtered = filtered.filter(d =>
      (d.title && d.title.toLowerCase().includes(q)) ||
      (d.url && d.url.toLowerCase().includes(q))
    );
  }

  if (filtered.length === 0) {
    downloadsListEl.innerHTML = '';
    emptyStateEl.style.display = 'flex';
    return;
  }

  emptyStateEl.style.display = 'none';

  downloadsListEl.innerHTML = filtered.map(item => {
    const isCompleted = item.status === 'completed';
    const isError = item.status === 'error' || item.status === 'cancelled';
    const isDownloading = item.status === 'downloading';

    let statusText = 'Mengunduh...';
    if (isCompleted) statusText = 'Selesai';
    if (item.status === 'cancelled') statusText = 'Dibatalkan';
    if (item.status === 'error') statusText = 'Gagal';

    const progressVal = Math.min(100, Math.max(0, item.progress || 0)).toFixed(1);

    return `
      <div class="download-card" data-id="${item.id}">
        <div class="card-header">
          <div class="file-info">
            <div class="file-icon">
              ${['audio', 'mp3', 'mp3-high', 'mp3-std', 'm4a', 'wav'].includes(item.resolution) ? '🎵' : '🎬'}
            </div>
            <div class="file-titles">
              <div class="file-title" title="${escapeHtml(item.title || '')}">${escapeHtml(item.title || 'Video Unduhan')}</div>
              <div class="file-url" title="${escapeHtml(item.url || '')}">${escapeHtml(item.url || '')}</div>
            </div>
          </div>
          <span class="res-tag">${item.resolution ? item.resolution.toUpperCase() : 'VIDEO'}</span>
        </div>

        <div class="progress-track">
          <div class="progress-bar ${isCompleted ? 'completed' : isError ? 'error' : ''}" style="width: ${progressVal}%;"></div>
        </div>

        <div class="card-footer">
          <div class="stats-group">
            <span class="stat-item"><strong>${progressVal}%</strong></span>
            <span class="stat-item">${escapeHtml(item.size || '--')}</span>
            <span class="stat-item">⚡ ${escapeHtml(item.speed || '--')}</span>
            ${isDownloading ? `<span class="stat-item">⏳ Sisa: ${escapeHtml(item.eta || '--')}</span>` : ''}
            <span class="stat-item" style="color: ${isCompleted ? '#34d399' : isError ? '#f87171' : '#38bdf8'}; font-weight: 600;">
              ${statusText}
            </span>
          </div>

          <div class="card-actions">
            ${isCompleted ? `
              <button class="btn-card" onclick="triggerAction('open-file', '${item.id}')">Buka File</button>
              <button class="btn-card" onclick="triggerAction('open-folder', '${item.id}')">Buka Folder</button>
            ` : ''}
            ${isDownloading ? `
              <button class="btn-card danger" onclick="triggerAction('cancel', '${item.id}')">Batalkan</button>
            ` : ''}
            <button class="btn-card danger" onclick="triggerAction('delete', '${item.id}')">Hapus</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function triggerAction(action, id) {
  try {
    const res = await fetch('/api/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id })
    });
    if (res.ok) {
      if (action === 'delete') {
        downloads = downloads.filter(d => d.id !== id);
        render();
      } else {
        loadDownloads();
      }
    }
  } catch (e) {
    console.error(e);
  }
}

// Nav filters
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.getAttribute('data-filter');
    render();
  });
});

// Search
searchInput.addEventListener('input', (e) => {
  searchQuery = e.target.value.trim();
  render();
});

// Modals
document.getElementById('btn-show-add-modal').addEventListener('click', () => {
  addModal.classList.add('show');
  inputUrl.focus();
});
document.getElementById('btn-close-add-modal').addEventListener('click', () => addModal.classList.remove('show'));
document.getElementById('btn-cancel-add').addEventListener('click', () => addModal.classList.remove('show'));

document.getElementById('btn-show-ext-modal').addEventListener('click', () => extModal.classList.add('show'));
document.getElementById('btn-close-ext-modal').addEventListener('click', () => extModal.classList.remove('show'));
document.getElementById('btn-close-ext-guide').addEventListener('click', () => extModal.classList.remove('show'));

document.getElementById('btn-open-folder').addEventListener('click', async () => {
  await fetch('/api/action', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'open-folder' })
  });
});

// Add download form submit
document.getElementById('btn-submit-download').addEventListener('click', async () => {
  const url = inputUrl.value.trim();
  const resolution = selectRes.value;

  if (!url) {
    showToast('Masukkan URL terlebih dahulu!');
    return;
  }

  addModal.classList.remove('show');
  inputUrl.value = '';
  showToast('Memulai unduhan...');

  try {
    const res = await fetch('/api/download', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, resolution })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      showToast('Unduhan berhasil ditambahkan!');
      loadDownloads();
    } else {
      showToast(`Gagal: ${data.error || 'Terjadi kesalahan'}`);
    }
  } catch (e) {
    showToast('Gagal menghubungkan ke server unduhan.');
  }
});

// Start
loadDownloads();
initSSE();
