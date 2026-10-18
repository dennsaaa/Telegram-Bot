// Plugin Admin: broadcast, stats, maintenance, users, clearcache — Only ADMIN_ID
const fs = require('fs');
const path = require('path');
const { ADMIN_ID } = require('../config');
const db = require('../config/database');
const { errorHandler } = require('../utils/errorHandler');

function isAdmin(ctx) {
  return ctx.from?.id === ADMIN_ID;
}

// ---------- /bc <pesan> ----------
const broadcast = errorHandler(async (ctx) => {
  if (!isAdmin(ctx)) return;
  const text = (ctx.message.text || '').replace(/^\/bc\s*/i, '').trim();
  if (!text) return ctx.reply('❓ Contoh: `/bc Halo semua, ada fitur baru!`', { parse_mode: 'Markdown' });

  const ids = db.getAllUserIds();
  const wait = await ctx.reply(`📡 Broadcast ke ${ids.length} pengguna...`);
  let ok = 0, fail = 0;
  const blocked = [];

  for (const id of ids) {
    try {
      await ctx.telegram.sendMessage(id, `📢 *Pengumuman Woyy*\n\n${text}`, { parse_mode: 'Markdown' });
      ok++;
    } catch (e) {
      fail++;
      if (e.description?.includes('blocked')) blocked.push(id);
      await new Promise((r) => setTimeout(r, 50)); // hindari flood limit Telegram
    }
  }
  await ctx.telegram.editMessageText(wait.chat.id, wait.message_id, undefined,
    `✅ Broadcast completed.\nTerkirim: ${ok} · Gagal: ${fail}`);
  if (blocked.length) console.log('[BC] blocked users:', blocked);
});

// ---------- /stats ----------
const stats = errorHandler(async (ctx) => {
  if (!isAdmin(ctx)) return;
  const s = db.getStats();
  const top = s.topCommands.length
    ? s.topCommands.map(([cmd, n], i) => `  ${i + 1}. \`${cmd}\` — ${n}x`).join('\n')
    : '  (belum ada)';
  await ctx.reply(
    `📊 *Bot Stats*\n\n👥 Users total: *${s.totalUsers}*\n🔥 Total usage: *${s.totalHits}*\n\n*Popular commands:*\n${top}`,
    { parse_mode: 'Markdown' }
  );
});

// ---------- /maintenance on|off ----------
const maintenance = errorHandler(async (ctx) => {
  if (!isAdmin(ctx)) return;
  const arg = (ctx.message.text || '').split(/\s+/)[1]?.toLowerCase();
  if (arg !== 'on' && arg !== 'off') {
    return ctx.reply(`🔧 Mode maintenance saat ini: *${db.isMaintenance() ? 'ON' : 'OFF'}*\n\nUsage: \`/maintenance on\` atau \`/maintenance off\``, { parse_mode: 'Markdown' });
  }
  db.setMaintenance(arg === 'on');
  await ctx.reply(`🔧 Mode maintenance: *${arg.toUpperCase()}*`, { parse_mode: 'Markdown' });
});

// ---------- /users (Daftar Pengguna) ----------
const listUsers = errorHandler(async (ctx) => {
  if (!isAdmin(ctx)) return;
  const ids = db.getAllUserIds();
  const sample = ids.slice(-10).join(', '); // Ambil 10 ID user terakhir
  await ctx.reply(
    `👥 *Users Information*\n\nTotal User Registered: *${ids.length}*\n10 Last Telegram IDs: \`${sample || 'Not available'}\``,
    { parse_mode: 'Markdown' }
  );
});

// ---------- /clearcache (Pembersih File Temp Server) ----------
const clearCache = errorHandler(async (ctx) => {
  if (!isAdmin(ctx)) return;
  const tempDir = path.join(__dirname, '../temp');
  if (!fs.existsSync(tempDir)) {
    return ctx.reply('📂 Temp directory is already clean.');
  }
  
  let count = 0;
  fs.readdirSync(tempDir).forEach((file) => {
    const filePath = path.join(tempDir, file);
    if (fs.lstatSync(filePath).isFile()) {
      fs.unlinkSync(filePath);
      count++;
    }
  });
  
  await ctx.reply(`🧹 Successfully cleaned *${count}* temporary files from the server.`);
});

// ---------- Daftarkan Command Admin ----------
function register(bot) {
  bot.command('bc', broadcast);
  bot.command('stats', stats);
  bot.command('maintenance', maintenance);
  bot.command('users', listUsers);
  bot.command('clearcache', clearCache);
}

module.exports = { register, isAdmin };