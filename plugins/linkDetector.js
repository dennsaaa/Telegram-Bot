// Auto-detect link sosmed di pesan biasa → tampilkan inline keyboard pilihan download
const { detectPlatform } = require('./downloader');
const { errorHandler } = require('../utils/errorHandler');

const URL_RE = /https?:\/\/[^\s]+/i;

const pending = new Map(); // key -> { url, action }
let seq = 0;

function makeKey(url, action) {
  seq = (seq + 1) % 100000;
  const key = `${Date.now().toString(36)}${seq}`;
  pending.set(key, { url, action });
  if (pending.size > 500) {
    const cutoff = Date.now() - 3_600_000;
    for (const [k, v] of pending) {
      if (parseInt(k, 36) < cutoff) pending.delete(k);
    }
  }
  return key;
}

function middleware(ctx, next) {
  const text = ctx.message?.text || ctx.message?.caption || '';
  if (text.startsWith('/')) return next();
  const match = text.match(URL_RE);
  const platform = match && detectPlatform(match[0]);
  if (!platform) return next();

  const url = match[0];
  const labels = {
    tiktok: '🎵 TikTok',
    instagram: '📸 Instagram',
    pinterest: '📌 Pinterest',
  };

  const buttons = [];
  if (platform === 'tiktok') {
    buttons.push([{ text: '⬇️ Video Download (No WM)', callback_data: `dl:tt:${makeKey(url, 'tt')}` }]);
    buttons.push([{ text: '🎧 Only Audio', callback_data: `dl:tta:${makeKey(url, 'tta')}` }]);
  } else {
    buttons.push([{ text: `⬇️ Download ${labels[platform]}`, callback_data: `dl:${platform}:${makeKey(url, platform === 'instagram' ? 'ig' : 'pin')}` }]);
  }
  buttons.push([{ text: '❌ Close', callback_data: 'dl:close' }]);

  return ctx.reply(`🔗 Link ${labels[platform]} detected! Pilih format:`, {
    reply_markup: { inline_keyboard: buttons },
  });
}

// Handler callback → jalankan download sesuai pilihan
function registerCallback(bot) {
  const { handleCommand } = require('./downloader');

  bot.action(/^dl:(.+?):(.+)$/, errorHandler(async (ctx) => {
    const [, action, key] = ctx.match;
    await ctx.answerCbQuery().catch(() => { });

    const entry = pending.get(key);
    if (!entry) {
      return ctx.editMessageText('⚠️ The option has expired, please resend the link.').catch(() => { });
    }
    pending.delete(key);

    await ctx.deleteMessage().catch(() => { });

    const platform = {
      tt: 'tiktok',
      tta: 'tiktok',
      ig: 'instagram',
      pin: 'pinterest',
    }[entry.action];

    const opts = {
      audioOnly: entry.action === 'tta',
      url: entry.url,
    };

    await handleCommand(ctx, platform, opts);
  }));

  bot.action('dl:close', async (ctx) => {
    await ctx.answerCbQuery().catch(() => { });
    await ctx.deleteMessage().catch(() => { });
  });
}

module.exports = { middleware, registerCallback };