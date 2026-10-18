// Helper file sementara: bikin path unik + auto clean setelah dikirim
const fs = require('fs');
const path = require('path');
const { TEMP_DIR } = require('../config');

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

function tempPath(filename) {
  return path.join(TEMP_DIR, `${Date.now()}-${Math.random().toString(36).slice(2)}-${filename}`);
}

function cleanTemp(filePath) {
  try {
    if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (e) {
    console.error('[TEMP] gagal hapus:', e.message);
  }
}

// Bersihkan sisa file lebih dari 30 menit (jalankan tiap 10 menit)
function startAutoClean() {
  setInterval(() => {
    try {
      for (const f of fs.readdirSync(TEMP_DIR)) {
        const p = path.join(TEMP_DIR, f);
        if (Date.now() - fs.statSync(p).mtimeMs > 30 * 60_000) cleanTemp(p);
      }
    } catch { }
  }, 10 * 60_000);
}

module.exports = { tempPath, cleanTemp, startAutoClean };
