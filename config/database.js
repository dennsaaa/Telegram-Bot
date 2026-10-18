const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'database.json');

// Struktur data: { users: {id: {name, joined, counts}}, totals: {command: n} }
let data = { users: {}, totals: {} };

function load() {
  try {
    data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
  } catch {
    data = { users: {}, totals: {} };
  }
}

let saveTimer = null;
function save() {
  clearTimeout(saveTimer); // debounce biar gak nulis file tiap pesan
  saveTimer = setTimeout(() => {
    try {
      fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
    } catch (e) {
      console.error('[DB] gagal simpan:', e.message);
    }
  }, 500);
}

function registerUser(user) {
  if (!data.users[user.id]) {
    data.users[user.id] = {
      name: user.first_name || 'User',
      username: user.username || '',
      joined: new Date().toISOString(),
      counts: {},
    };
    save();
  }
}

function trackCommand(userId, command) {
  if (data.users[userId]) {
    const u = data.users[userId];
    u.counts[command] = (u.counts[command] || 0) + 1;
  }
  data.totals[command] = (data.totals[command] || 0) + 1;
  save();
}

function getUserCount() {
  return Object.keys(data.users).length;
}

function getStats() {
  const users = Object.values(data.users);
  return {
    totalUsers: users.length,
    totalHits: Object.values(data.totals).reduce((a, b) => a + b, 0),
    topCommands: Object.entries(data.totals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5),
  };
}

function getAllUserIds() {
  return Object.keys(data.users).map(Number);
}

function setMaintenance(on) {
  data.maintenance = on;
  save();
}

function isMaintenance() {
  return !!data.maintenance;
}

load();

module.exports = {
  registerUser, trackCommand, getUserCount, getStats, getAllUserIds,
  setMaintenance, isMaintenance,
};
