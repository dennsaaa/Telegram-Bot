// Plugin Downloader: TikTok, Instagram, Pinterest + auto-detect link
const axios = require('axios');
const fs = require('fs');
const { errorHandler } = require('../utils/errorHandler');
const { tempPath, cleanTemp } = require('../utils/tempFile');
const db = require('../config/database');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

// ---------- Deteksi platform dari URL ----------
function detectPlatform(url) {
  const u = url.toLowerCase();
  if (u.includes('tiktok.com')) return 'tiktok';
  if (u.includes('instagram.com')) return 'instagram';
  if (u.includes('pinterest.com') || u.includes('pin.it')) return 'pinterest';
  return null;
}

// ---------- TikTok ----------
async function tiktok(url, audioOnly = false) {
  const { data } = await axios.get('https://www.tikwm.com/api/', {
    params: { url, hd: 1 },
    timeout: 30_000,
    headers: { 'User-Agent': UA },
  });
  if (data.code !== 0) throw new Error(data.msg || 'TikTok processing failed');
  const d = data.data;
  const play = audioOnly ? d.music : (d.hdplay || d.play);
  return { type: audioOnly ? 'audio' : 'video', url: play, title: d.title, author: d.author?.nickname };
}

// ---------- Instagram ----------
function decodePacker(html) {
  const start = html.indexOf('}(');
  if (start === -1) return html;
  const argsStr = html.slice(start + 2).replace(/\)+$/, '');
  const m = argsStr.match(/^"([\s\S]*)",(\d+),"([^"]*)",(-?\d+),(\d+),(\d+)$/);
  if (!m) throw new Error('format packer tidak dikenal');
  const [, h, , n, tS, eS] = m;
  const t = +tS, e = +eS;
  const ALPHA = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ+/';
  const decodeRadix = (s, from, to) => {
    const fromA = ALPHA.slice(0, from), toA = ALPHA.slice(0, to);
    let j = 0;
    [...s].reverse().forEach((ch, idx) => {
      const p = fromA.indexOf(ch);
      if (p !== -1) j += p * Math.pow(from, idx);
    });
    let k = '';
    while (j > 0) { k = toA[j % to] + k; j = Math.floor(j / to); }
    return k || '0';
  };
  let out = '';
  for (let i = 0; i < h.length;) {
    let seg = '';
    while (i < h.length && h[i] !== n[e]) { seg += h[i]; i++; }
    i++;
    n.split('').forEach((ch, j) => { seg = seg.split(ch).join(String(j)); });
    out += String.fromCharCode(parseInt(decodeRadix(seg, e, 10)) - t);
  }
  return decodeURIComponent(out);
}

function jwtPayload(token) {
  return JSON.parse(Buffer.from(token.split('.')[1], 'base64').toString());
}

async function instagram(url) {
  const headers = {
    'User-Agent': UA,
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': 'https://snapinsta.to/en46',
    'Origin': 'https://snapinsta.to',
    'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
  };

  const { data: v } = await axios.post('https://snapinsta.to/api/userverify', new URLSearchParams({ url }), { headers, timeout: 30_000 });
  if (!v?.token) throw new Error('Instagram verification failed');

  const { data: s } = await axios.post('https://snapinsta.to/api/ajaxSearch',
    new URLSearchParams({ q: url, t: 'media', v: 'v2', lang: 'en', cftoken: v.token, html: '' }),
    { headers, timeout: 30_000 });
  if (s?.status !== 'ok' || !s.data) throw new Error(s?.mess || 'Instagram processing failed');
  if (/private/i.test(s.data)) throw new Error('Instagram account is private, cannot be downloaded');

  const decoded = decodePacker(s.data);
  const dlToken = decoded.match(/dl\.snapcdn\.app\/get\?token=([^"']+)/)?.[1];
  if (!dlToken) throw new Error('Instagram Media not found (post might be private)');
  const realUrl = jwtPayload(dlToken).url;

  return { type: 'video', url: realUrl, title: 'Instagram Media' };
}

// ---------- Pinterest (Multi-Pattern & Direct CDN Fallback) ----------
async function pinterest(url) {
  let targetUrl = url;
  let html = '';

  try {
    const res = await axios.get(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      timeout: 20_000,
      maxRedirects: 10,
    });
    targetUrl = res.request?.res?.responseUrl || res.config?.url || url;
    html = typeof res.data === 'string' ? res.data : JSON.stringify(res.data);
  } catch (err) {
    if (err.response?.data) {
      html = typeof err.response.data === 'string' ? err.response.data : JSON.stringify(err.response.data);
    }
  }

  // 1. Ekstrak Video jika tersedia
  let videoUrl = html.match(/content=["'](https:\/\/[^"']+\.mp4[^"']*)["']/i)?.[1] ||
                 html.match(/["']v720P["']:\s*\{\s*["']url["']:\s*["']([^"']+)["']/i)?.[1] ||
                 html.match(/https:\/\/v1\.pinimg\.com\/videos\/[^\s"'<>\\]+/i)?.[0];

  if (videoUrl) {
    videoUrl = videoUrl.replace(/\\u0026/g, '&').replace(/\\/g, '');
    return { type: 'video', url: videoUrl, title: 'Pinterest Video' };
  }

  // 2. Ekstrak Foto (Flexible Meta Matching)
  let imageUrl = html.match(/<(?:meta)\s+[^>]*content=["']([^"']+)["'][^>]*og:image/i)?.[1] ||
                  html.match(/<(?:meta)\s+[^>]*og:image[^>]*content=["']([^"']+)["']/i)?.[1] ||
                  html.match(/<(?:meta)\s+[^>]*property=["']og:image["'][^>]*content=["']([^"']+)["']/i)?.[1] ||
                  html.match(/<(?:meta)\s+[^>]*content=["']([^"']+)["'][^>]*property=["']og:image["']/i)?.[1];

  // 3. Fallback: Ambil URL CDN Gambar Resolusi Tinggi Langsung dari String HTML
  if (!imageUrl) {
    const cdnMatch = html.match(/https:\/\/i\.pinimg\.com\/originals\/[^\s"'<>\\]+/i) ||
                     html.match(/https:\/\/i\.pinimg\.com\/736x\/[^\s"'<>\\]+/i) ||
                     html.match(/https:\/\/i\.pinimg\.com\/564x\/[^\s"'<>\\]+/i);
    if (cdnMatch) imageUrl = cdnMatch[0];
  }

  if (imageUrl) {
    imageUrl = imageUrl.replace(/\\u0026/g, '&').replace(/\\/g, '');
    return { type: 'photo', url: imageUrl, title: 'Pinterest Photo' };
  }

  throw new Error('Pinterest media not found');
}

// ---------- Kirim hasil ke user ----------
async function deliver(ctx, result) {
  if (result.type === 'photo') {
    return ctx.replyWithPhoto({ url: result.url });
  }
  if (result.type === 'audio') {
    return ctx.replyWithAudio({ url: result.url });
  }
  const tmp = tempPath('dl.mp4');
  const res = await axios.get(result.url, {
    responseType: 'arraybuffer',
    timeout: 120_000,
    headers: { 'User-Agent': UA },
    maxContentLength: 200 * 1024 * 1024,
  });
  fs.writeFileSync(tmp, res.data);
  try {
    await ctx.replyWithVideo({ source: tmp });
  } finally {
    cleanTemp(tmp);
  }
}

// ---------- Handler command ----------
async function handleCommand(ctx, platform, opts = {}) {
  let url = opts.url;
  if (!url) {
    const text = ctx.message?.text || ctx.message?.caption || '';
    const match = text.match(/https?:\/\/[^\s]+/i);
    url = match ? match[0] : null;
  }

  if (!url) {
    return ctx.reply(`❓ Contoh: \`/${platform} https://...\``, { parse_mode: 'Markdown' });
  }

  const wait = await ctx.reply('⏳ Downloading, Tunggu bentar yaaa...');
  let result;
  if (platform === 'tiktok') result = await tiktok(url, opts.audioOnly);
  else if (platform === 'instagram') result = await instagram(url);
  else if (platform === 'pinterest') result = await pinterest(url);
  else throw new Error('Platform tidak dikenal');

  if (!result) throw new Error('Media tidak ditemukan');

  await deliver(ctx, result);
  await ctx.deleteMessage(wait.message_id).catch(() => { });
}

// ---------- Register commands + auto-detect ----------
function register(bot) {
  const track = (name) => (ctx) => { db.trackCommand(ctx.from.id, name); };

  bot.command('tt', errorHandler(async (ctx) => { track('/tt')(ctx); await handleCommand(ctx, 'tiktok'); }));
  bot.command('tta', errorHandler(async (ctx) => { track('/tta')(ctx); await handleCommand(ctx, 'tiktok', { audioOnly: true }); }));
  bot.command('ig', errorHandler(async (ctx) => { track('/ig')(ctx); await handleCommand(ctx, 'instagram'); }));
  bot.command('pin', errorHandler(async (ctx) => { track('/pin')(ctx); await handleCommand(ctx, 'pinterest'); }));

  bot.on(message('text'), require('./linkDetector').middleware);
}

const { message } = require('telegraf/filters');

module.exports = { register, detectPlatform, handleCommand };