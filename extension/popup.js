const SERVER_URL = 'http://127.0.0.1:48912';

const statusBadge = document.getElementById('status-badge');
const quickUrlInput = document.getElementById('quick-url');
const quickResSelect = document.getElementById('quick-res');
const btnQuickDownload = document.getElementById('btn-quick-download');
const resultMsg = document.getElementById('result-msg');

async function checkServer() {
  try {
    const res = await fetch(`${SERVER_URL}/api/status`);
    if (res.ok) {
      statusBadge.textContent = 'Online';
      statusBadge.className = 'badge online';
    } else {
      statusBadge.textContent = 'Offline';
      statusBadge.className = 'badge offline';
    }
  } catch (e) {
    statusBadge.textContent = 'Offline';
    statusBadge.className = 'badge offline';
  }
}

// Prefill URL if currently on a YouTube tab
async function checkCurrentTab() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.url && (tab.url.includes('youtube.com/watch') || tab.url.includes('youtube.com/shorts'))) {
      quickUrlInput.value = tab.url;
    }
  } catch (e) {
    // Tab query optional
  }
}

btnQuickDownload.addEventListener('click', async () => {
  const url = quickUrlInput.value.trim();
  const resolution = quickResSelect.value;

  if (!url) {
    showMsg('Masukkan URL terlebih dahulu!', false);
    return;
  }

  showMsg('Mengirim unduhan ke IDS Desktop...', true);

  try {
    const res = await fetch(`${SERVER_URL}/api/download`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, resolution })
    });

    const data = await res.json();
    if (res.ok && data.success) {
      showMsg('✅ Berhasil dikirim ke IDS Desktop!', true);
    } else {
      showMsg(`❌ Gagal: ${data.error || 'Server error'}`, false);
    }
  } catch (e) {
    showMsg('⚠️ Gagal terhubung ke IDS Desktop! Pastikan aplikasi IDS aktif.', false);
  }
});

function showMsg(text, isSuccess) {
  resultMsg.textContent = text;
  resultMsg.className = `result-msg ${isSuccess ? 'success' : 'error'}`;
}

checkServer();
checkCurrentTab();
