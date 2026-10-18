// Rate limiter sederhana: max N request per window per user
const { RATE_LIMIT } = require('../config');

const hits = new Map(); // userId -> [timestamps]

function isLimited(userId) {
  const now = Date.now();
  const arr = (hits.get(userId) || []).filter((t) => now - t < RATE_LIMIT.windowMs);
  arr.push(now);
  hits.set(userId, arr);

  if (arr.length > RATE_LIMIT.max) return true;
  return false;
}

// Middleware Telegraf
function rateLimiter(ctx, next) {
  const id = ctx.from?.id;
  if (!id) return next();

  // Admin bebas limit
  const { ADMIN_ID } = require('../config');
  if (id === ADMIN_ID) return next();

  if (isLimited(id)) {
    return ctx.reply('🚫 Terlalu banyak permintaan! Tunggu beberapa detik lagi ya.');
  }
  return next();
}

module.exports = { rateLimiter, isLimited };
