// Plugin Converter: foto → stiker (.webp), stiker → gambar (png)
const sharp = require('sharp');
const { errorHandler } = require('../utils/errorHandler');
const { tempPath, cleanTemp } = require('../utils/tempFile');
const db = require('../config/database');

function getRepliedMedia(ctx) {
  const m = ctx.message.reply_to_message;
  if (!m) return null;
  if (m.photo) return { fileId: m.photo[m.photo.length - 1].file_id, kind: 'photo' };
  if (m.sticker) return { fileId: m.sticker.file_id, kind: 'sticker', animated: m.sticker.is_animated, video: m.sticker.is_video };
  if (m.document?.mime_type?.startsWith('image/')) return { fileId: m.document.file_id, kind: 'photo' };
  return null;
}

// ---------- /sticker: reply foto → webp ----------
const toSticker = errorHandler(async (ctx) => {
  const media = getRepliedMedia(ctx);
  if (!media || media.kind !== 'photo') {
    return ctx.reply('🖼️ Reply foto atau gambar Menggunakan /sticker');
  }

  const wait = await ctx.reply('✂️ Membuat stiker, Tunggu bentar yaaa...');
  const fileLink = await ctx.telegram.getFileLink(media.fileId);
  const res = await fetch(fileLink);
  if (!res.ok) throw new Error('Download file gagal');
  const input = Buffer.from(await res.arrayBuffer());

  // Stiker Telegram: maks 512px di sisi terpanjang
  const webp = await sharp(input).resize(512, 512, { fit: 'inside', withoutEnlargement: true }).webp().toBuffer();
  const tmp = tempPath('sticker.webp');
  require('fs').writeFileSync(tmp, webp);
  try {
    await ctx.replyWithSticker({ source: tmp });
  } finally {
    cleanTemp(tmp);
  }
  await ctx.telegram.deleteMessage(wait.chat.id, wait.message_id).catch(() => { });
});

// ---------- /toimg: reply stiker → png ----------
const toImage = errorHandler(async (ctx) => {
  const media = getRepliedMedia(ctx);
  if (!media || media.kind !== 'sticker') {
    return ctx.reply('🏷️ Reply stiker Menggunakan /toimg');
  }
  if (media.animated) return ctx.reply('⚠️ Stiker animasi (TGS) belum didukung, coba stiker biasa.');

  const wait = await ctx.reply('🖼️ Mengubah jadi gambar...');
  const fileLink = await ctx.telegram.getFileLink(media.fileId);
  const res = await fetch(fileLink);
  const input = Buffer.from(await res.arrayBuffer());

  const isWebp = media.video || (input.subarray(0, 4).toString() === 'RIFF');
  const tmp = tempPath(media.video ? 'sticker.mp4' : 'image.png');
  if (isWebp && !media.video) {
    await sharp(input).png().toFile(tmp);
  } else {
    require('fs').writeFileSync(tmp, input); // video sticker / sudah png
  }
  try {
    await ctx.replyWithDocument({ source: tmp, filename: media.video ? 'sticker.mp4' : 'image.png' });
  } finally {
    cleanTemp(tmp);
  }
  await ctx.telegram.deleteMessage(wait.chat.id, wait.message_id).catch(() => { });
});

function register(bot) {
  bot.command('sticker', (ctx) => { db.trackCommand(ctx.from.id, '/sticker'); return toSticker(ctx); });
  bot.command('toimg', (ctx) => { db.trackCommand(ctx.from.id, '/toimg'); return toImage(ctx); });
}

module.exports = { register, toSticker, toImage };
