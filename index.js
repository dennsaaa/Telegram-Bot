// ============================================
// BOT TELEGRAM DennsaaXXX Multi Bot
// Entry point utama — daftarkan semua plugin di sini
// Jalankan: node index.js
// ============================================
require('dotenv').config();

const { Telegraf, Markup } = require('telegraf');
const { BOT_TOKEN, OWNER_NAME } = require('./config');
const db = require('./config/database');
const { errorHandler } = require('./utils/errorHandler');
const { rateLimiter } = require('./utils/rateLimiter');
const { startAutoClean } = require('./utils/tempFile');
const { isAdmin } = require('./plugins/admin');

if (!BOT_TOKEN) {
  console.error('❌ BOT_TOKEN belum diisi di .env! Copy .env.example jadi .env lalu isi token.');
  process.exit(1);
}

// handlerTimeout 3 menit: download video lambat tidak boleh dipotong di tengah proses
const bot = new Telegraf(BOT_TOKEN, { handlerTimeout: 180_000 });

// Penangkap error global: error apapun di handler tidak boleh mematikan bot
bot.catch((err, ctx) => {
  console.error('[GLOBAL ERROR]', err?.message || err);
  ctx?.reply?.('⚠️ Terjadi kesalahan, coba lagi nanti.').catch(() => { });
});

// ---------- Middleware global ----------
bot.use(async (ctx, next) => {
  if (ctx.from) db.registerUser(ctx.from); // catat user baru
  // Maintenance mode: hanya admin bisa pakai bot
  if (db.isMaintenance() && !isAdmin(ctx)) {
    return ctx.reply('🔧 Sedang maintenance. Coba lagi nanti ya!');
  }
  return rateLimiter(ctx, next);
});

// ---------- Definisi menu ----------
const MENU = {
  download: {
    title: '⬇️ *Downloader*',
    body: '• `/tt <link>` — TikTok no watermark\n• `/tta <link>` — TikTok only audio\n• `/ig <link>` — Instagram Reels/Post\n• `/pin <link>` — Pinterest\n\n💡 Send link only, bot will automatically suggest download options!',
  },
  converter: {
    title: '🔄 *Converter & Sticker*',
    body: '• Reply foto → `/sticker` — jadi stiker .webp\n• Reply stiker → `/toimg` — jadi gambar PNG',
  },
  utility: {
    title: '🧰 *Utility*',
    body: '• `/qr <teks>` — create QR code\n• `/short <link>` — shorten URL\n• `/ip <alamat>` — check IP/ISP info\n• `/mail` — create temporary email\n• `/mail cek` — check temporary email inbox',
  },
  about: {
    title: 'ℹ️ *About Bot*',
    body: 'DennsaaXXX Multi Bot\nCreated to make your work easier.\nOwner: ' + (OWNER_NAME || 'Dennsaaa') + '\n\n💡 This bot is open-source and free to use. You can contribute or report issues on GitHub.',
  },
};

const mainKeyboard = Markup.inlineKeyboard([
  [Markup.button.callback('⬇️ Downloader', 'menu:download')],
  [Markup.button.callback('🔄 Converter', 'menu:converter'), Markup.button.callback('🧰 Utility', 'menu:utility')],
  [Markup.button.callback('ℹ️ About Bot', 'menu:about')],
]);

const backKeyboard = Markup.inlineKeyboard([[Markup.button.callback('⬅️ Kembali ke Menu Utama', 'menu:main')]]);

function menuText(key) {
  return `${MENU[key].title}\n\n${MENU[key].body}\n\nGunakan tombol di bawah untuk navigasi.`;
}

// ---------- /start ----------
bot.start(errorHandler(async (ctx) => {
  db.trackCommand(ctx.from.id, '/start');
  const name = ctx.from.first_name || 'kawan';
  await ctx.reply(
    `✨ *Hellooo.., ${name}!* ✨\n\n` +
    `Wellcome to *DennsaaXXX Multi Bot* — Bot ini bisa jadi asisten pribadi kamu, pake aja sepuasnya..\n\n` +
    `⬇️ Download video · 🖼️ Bikin stiker\n🧰 QR, shortlink, temp mail, dan lainnya\n\n` +
    `Pilih kategori di bawah oyyy.. 👇`,
    { parse_mode: 'Markdown', ...mainKeyboard }
  );
}));

// ---------- Command Tambahan Sesuai BotFather ----------

// 1. /menu
bot.command('menu', errorHandler(async (ctx) => {
  db.trackCommand(ctx.from.id, '/menu');
  await ctx.reply('📋 *Main Menu*\n\nPilih kategori di bawah:', { parse_mode: 'Markdown', ...mainKeyboard });
}));

// 2. /fitur
bot.command('fitur', errorHandler(async (ctx) => {
  db.trackCommand(ctx.from.id, '/fitur');
  await ctx.reply(
    `✨ *Daftar Fitur Lengkap* ✨\n\n1. ⬇️ *Downloader*: TikTok, IG, Pinterest\n2. 🔄 *Converter*: Ubah foto ke stiker atau stiker ke gambar\n3. 🧰 *Utility*: Create QR Code, Shortlink, Cek IP, Temp Mail\n4. ⚡ *Lainnya*: Ketik perintah langsung atau gunakan tombol menu utama.`,
    { parse_mode: 'Markdown', ...mainKeyboard }
  );
}));

// 3. /ping (Cek Latency)
bot.command('ping', errorHandler(async (ctx) => {
  db.trackCommand(ctx.from.id, '/ping');
  const start = Date.now();
  const sent = await ctx.reply('🏓 Menghitung latensi...');
  const latency = Date.now() - start;
  await ctx.telegram.editMessageText(
    ctx.chat.id,
    sent.message_id,
    undefined,
    `🏓 *Pong!*\nLatensi: \`${latency}ms\`\nStatus Bot: 🟢 Aktif & Normal`,
    { parse_mode: 'Markdown' }
  );
}));

// 4. /profil
bot.command('profil', errorHandler(async (ctx) => {
  db.trackCommand(ctx.from.id, '/profil');
  await ctx.reply(
    `🤖 *Bot Profile*\n\n• Nama: DennsaaXXX Multi Bot\n• Owner: ${OWNER_NAME || 'Dennsaaa'}\n• Status Sistem: 🟢 Online\n• Basis: Node.js & Telegraf`,
    { parse_mode: 'Markdown' }
  );
}));

// 5. /creator
bot.command('creator', errorHandler(async (ctx) => {
  db.trackCommand(ctx.from.id, '/creator');
  await ctx.reply(
    `👨‍💻 *Creator Information*\n\n` +
    `dikembangkan dan dikelola oleh *${OWNER_NAME || 'Dennsaaa'}* sebagai asisten pribadiuntuk kebutuhan harian dan utilitas di Telegram! 🚀`,
    { parse_mode: 'Markdown' }
  );
}));

// ---------- /saran ----------
bot.command('saran', errorHandler(async (ctx) => {
  db.trackCommand(ctx.from.id, '/saran');
  const args = ctx.message.text.split(' ').slice(1).join(' ');
  
  if (!args) {
    return ctx.reply(
      `💡 *Cara Kirim Saran/Masukan*\n\nKetik pesan setelah perintah /saran.\nContoh: \`/saran tambahkan fitur Osint dong\`\n\nMasukanmu sangat berarti untuk pengembangan bot ini!`,
      { parse_mode: 'Markdown' }
    );
  }

  // 1. Kirim konfirmasi ke user bahwa saran berhasil dikirim
  await ctx.reply('✅ Terima kasih! Kritik dan saranmu sudah berhasil dikirim langsung ke pengembang.');

  // 2. Teruskan (Forward) atau kirim pesannya ke Admin (Anda)
  const { ADMIN_ID } = require('./config'); // Pastikan path config sesuai
  if (ADMIN_ID) {
    const userInfo = `📩 *Saran Baru Masuk!*\n\n` +
      `👤 Dari: ${ctx.from.first_name || 'Tanpa Nama'} (${ctx.from.username ? '@' + ctx.from.username : 'Tanpa Username'})\n` +
      `🆔 ID: \`${ctx.from.id}\`\n\n` +
      `💬 *Pesan:*\n${args}`;
      
    // Kirim pesan teks detail pengirim + sarannya langsung ke chat pribadi Admin
    await ctx.telegram.sendMessage(ADMIN_ID, userInfo, { parse_mode: 'Markdown' });
  }
}));

// ---------- Navigasi menu inline ----------
bot.action(/^menu:(.+)$/, errorHandler(async (ctx) => {
  const key = ctx.match[1];
  await ctx.answerCbQuery();
  if (key === 'main') {
    await ctx.editMessageText('🏠 *Main Menu*\n\nPilih kategori:', { parse_mode: 'Markdown', ...mainKeyboard });
  } else if (MENU[key]) {
    await ctx.editMessageText(menuText(key), { parse_mode: 'Markdown', ...backKeyboard });
  } else {
    await ctx.answerCbQuery('Menu tidak dikenal');
  }
}));

// ---------- /help ----------
bot.help(errorHandler(async (ctx) => {
  db.trackCommand(ctx.from.id, '/help');
  await ctx.reply(menuText('download'), { parse_mode: 'Markdown' });
}));

// ---------- Daftarkan semua plugin ----------
require('./plugins/downloader').register(bot);
require('./plugins/linkDetector').registerCallback(bot);
require('./plugins/converter').register(bot);
require('./plugins/utility').register(bot);
require('./plugins/admin').register(bot);

// ---------- Graceful shutdown ----------
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));

// ---------- Start ----------
startAutoClean();

console.log('⏳ Mengubungkan ke Telegram...');

// Cek koneksi ke Telegram terlebih dahulu, lalu jalankan bot
bot.telegram.getMe().then((botInfo) => {
  console.log(`✅ Bot @${botInfo.username} Allready running!`);
  console.log('💡 Biarkan terminal tetap terbuka. JANGAN tekan Ctrl+C kecuali ingin MEMATIKAN bot.');
  
  // Jalankan polling tanpa menahan console.log di dalam .then()
  bot.launch().catch((err) => {
    console.error('❌ Error runtime bot:', err.message);
  });
}).catch((err) => {
  console.error('❌ Gagal terhubung ke Telegram. Periksa token atau koneksi internet:', err.message);
});
