// Plugin Utility: QR code, shortlink, cek IP, temp mail
const axios = require('axios');
const QRCode = require('qrcode');
const { errorHandler } = require('../utils/errorHandler');
const { tempPath, cleanTemp } = require('../utils/tempFile');
const db = require('../config/database');

// ---------- /qr <teks/link> ----------
const qr = errorHandler(async (ctx) => {
  const text = (ctx.message.text || '').replace(/^\/qr\s*/i, '').trim();
  if (!text) return ctx.reply('❓ Contoh: `/qr https://example.com`', { parse_mode: 'Markdown' });

  const tmp = tempPath('qr.png');
  await QRCode.toFile(tmp, text, { width: 512, margin: 2 });
  try {
    await ctx.replyWithPhoto({ source: tmp }, { caption: `🔎 QR untuk: ${text.slice(0, 100)}` });
  } finally {
    cleanTemp(tmp);
  }
});

// ---------- /short <link> ----------
const short = errorHandler(async (ctx) => {
  const url = (ctx.message.text || '').split(/\s+/)[1];
  if (!url || !/^https?:\/\//i.test(url)) {
    return ctx.reply('❓ Contoh: `/short https://link-panjang.com/abc`', { parse_mode: 'Markdown' });
  }
  const wait = await ctx.reply('🔗 Creating short link...');
  try {
    // Menggunakan is.gd yang lebih toleran terhadap URL panjang/query parameters
    const { data } = await axios.get(`https://is.gd/create.php`, {
      params: { format: 'json', url: url },
      timeout: 15_000
    });
    
    if (data && data.shorturl) {
      await ctx.telegram.editMessageText(wait.chat.id, wait.message_id, undefined, `✅ Short link:\n${data.shorturl}`);
    } else {
      throw new Error('Gagal memproses URL');
    }
  } catch (err) {
    console.error('[SHORT ERROR]', err.message);
    await ctx.telegram.editMessageText(wait.chat.id, wait.message_id, undefined, '❌ Gagal membuat shortlink. Pastikan format URL valid.');
  }
});

// ---------- /ip <alamat> ----------
const ipCheck = errorHandler(async (ctx) => {
  const ip = (ctx.message.text || '').split(/\s+/)[1];
  if (!ip) return ctx.reply('❓ Contoh: `/ip 8.8.8.8`', { parse_mode: 'Markdown' });
  if (!/^[\d.:a-fA-F]+$/.test(ip)) return ctx.reply('⚠️ Invalid Ip Address.');

  // Deteksi IP lokal / private range
  if (
    ip.startsWith('192.168.') || 
    ip.startsWith('10.') || 
    ip.startsWith('127.') || 
    /^172\.(1[6-9]|2[0-9]|3[1-1])\./.test(ip)
  ) {
    return ctx.reply('⚠️ This is a **Local / Private Network** IP (within your router). Public IP tracking services cannot track local IPs. Please use a public IP like `8.8.8.8`.', { parse_mode: 'Markdown' });
  }

  const wait = await ctx.reply('🌐 Checking IP...');
  try {
    const { data } = await axios.get(`http://ip-api.com/json/${encodeURIComponent(ip)}`, {
      timeout: 15_000, params: { fields: 'status,message,country,regionName,city,isp,org,as,query' },
    });
    if (data.status !== 'success') throw new Error(data.message || 'IP not found');
    const msg =
      `🔎 IP Info *${data.query}*\n\n` +
      `🌍 Negara: ${data.country}\n` +
      `🏙️ Kota: ${data.city},${data.regionName}\n` +
      `📡 ISP: ${data.isp}\n` +
      `🏢 Org: ${data.org}\n` +
      `🔗 AS: ${data.as}`;
    await ctx.telegram.editMessageText(wait.chat.id, wait.message_id, undefined, msg, { parse_mode: 'Markdown' });
  } catch (err) {
    console.error('[IP ERROR]', err.message);
    await ctx.telegram.editMessageText(wait.chat.id, wait.message_id, undefined, '❌ Failed to check IP. Please ensure the public IP you entered is correct.');
  }
});

// ---------- Temp Mail ----------
const mailAccounts = new Map(); // userId -> {address, token}

const tempMail = errorHandler(async (ctx) => {
  const sub = (ctx.message.text || '').split(/\s+/)[1] || '';
  const uid = ctx.from.id;

  if (sub === 'cek') return checkInbox(ctx, uid);
  if (mailAccounts.has(uid) && !sub) {
    const acc = mailAccounts.get(uid);
    return ctx.reply(
      `📧 Your temporary email (still active):\n\`${acc.address}\`\n\n` +
      `Check inbox: /mail cek`,
      { parse_mode: 'Markdown' }
    );
  }

  const wait = await ctx.reply('📧 Creating temporary email...');
  try {
    const domains = await axios.get('https://api.mail.tm/domains', { timeout: 15_000 });
    const domain = domains.data['hydra:member']?.[0]?.domain;
    if (!domain) throw new Error('temporary email domain is not available');

    const address = `bot${Math.random().toString(36).slice(2, 10)}@${domain}`;
    const password = 'P@ss' + Math.random().toString(36).slice(2, 12);
    await axios.post('https://api.mail.tm/accounts', { address, password }, { timeout: 15_000 });
    const token = (await axios.post('https://api.mail.tm/token', { address, password }, { timeout: 15_000 })).data.token;

    mailAccounts.set(uid, { address, token });
    await ctx.telegram.editMessageText(
      wait.chat.id, wait.message_id, undefined,
      `✅ Your temporary email:\n\`${address}\`\n\nAfter using it, check your inbox: \`/mail cek\``,
      { parse_mode: 'Markdown' }
    );
  } catch (err) {
    console.error('[MAIL ERROR]', err.message);
    await ctx.telegram.editMessageText(wait.chat.id, wait.message_id, undefined, '❌ Failed to create temporary email. The mail.tm service is currently busy.');
  }
});

async function checkInbox(ctx, uid) {
  const acc = mailAccounts.get(uid);
  if (!acc) return ctx.reply('ℹ️ You don\'t have a temporary email yet. Please type /mail first.');

  try {
    const { data } = await axios.get('https://api.mail.tm/messages', {
      timeout: 15_000, headers: { Authorization: `Bearer ${acc.token}` },
    });
    const msgs = data['hydra:member'] || [];
    if (!msgs.length) return ctx.reply('📭 Inbox is still empty, please wait a moment and try /mail cek again.');

    for (const m of msgs.slice(0, 5)) {
      const detail = await axios.get(`https://api.mail.tm/messages/${m.id}`, {
        timeout: 15_000, headers: { Authorization: `Bearer ${acc.token}` },
      });
      const body = (detail.data.text || detail.data.html?.[0]?.replace(/<[^>]+>/g, ' ') || '').slice(0, 1500);
      await ctx.reply(`📬 *From:* ${m.from?.address}\n*Subject:* ${m.subject || '(no subject)'}\n\n${body}`, { parse_mode: 'Markdown' });
    }
  } catch (err) {
    console.error('[INBOX ERROR]', err.message);
    await ctx.reply('⚠️ Failed to check email inbox.');
  }
}

function register(bot) {
  bot.command('qr', (ctx) => { db.trackCommand(ctx.from.id, '/qr'); return qr(ctx); });
  bot.command('short', (ctx) => { db.trackCommand(ctx.from.id, '/short'); return short(ctx); });
  bot.command('ip', (ctx) => { db.trackCommand(ctx.from.id, '/ip'); return ipCheck(ctx); });
  bot.command('mail', (ctx) => { db.trackCommand(ctx.from.id, '/mail'); return tempMail(ctx); });
}

module.exports = { register, qr, short, ipCheck, tempMail };