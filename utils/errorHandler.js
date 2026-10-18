// Error boundary: bungkus handler async supaya error tidak mematikan bot
function errorHandler(fn) {
  return async (ctx) => {
    try {
      await fn(ctx);
    } catch (err) {
      console.error('[ERROR]', err?.response?.data || err.message || err);
      try {
        await ctx.reply('⚠️ Terjadi kesalahan, coba lagi nanti.');
      } catch { /* abaikan kalau reply pun gagal */ }
    }
  };
}

module.exports = { errorHandler };
