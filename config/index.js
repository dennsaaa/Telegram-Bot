require('dotenv').config();

module.exports = {
  BOT_TOKEN: process.env.BOT_TOKEN,
  ADMIN_ID: process.env.ADMIN_ID ? Number(process.env.ADMIN_ID) : 0,
  OWNER_NAME: process.env.OWNER_NAME || 'Owner',
  PORT: Number(process.env.PORT) || 3000,

  RATE_LIMIT: { max: 3, windowMs: 10_000 },
  TEMP_DIR: 'temp',
};
