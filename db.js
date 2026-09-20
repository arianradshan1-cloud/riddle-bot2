const fs = require('fs');
const path = require('path');

const DB_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DB_DIR, 'database.json');

function initDb() {
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }
  if (!fs.existsSync(DB_FILE)) {
    const initialData = {
      users: {},
      stats: {
        totalDownloads: 0,
        platforms: {
          instagram: 0,
          tiktok: 0,
          youtube: 0,
          twitter: 0,
          pinterest: 0,
          other: 0
        },
        startedAt: new Date().toISOString()
      }
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
  }
}

function readDb() {
  try {
    initDb();
    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch (err) {
    console.error('Error reading DB:', err.message);
    return { users: {}, stats: { totalDownloads: 0, platforms: {} } };
  }
}

function writeDb(data) {
  try {
    initDb();
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing DB:', err.message);
  }
}

function registerUser(from) {
  if (!from || !from.id) return;
  const db = readDb();
  const userId = String(from.id);
  const now = new Date().toISOString();

  if (!db.users[userId]) {
    db.users[userId] = {
      id: from.id,
      first_name: from.first_name || '',
      username: from.username || '',
      downloadsCount: 0,
      firstSeen: now,
      lastSeen: now
    };
  } else {
    db.users[userId].lastSeen = now;
    if (from.first_name) db.users[userId].first_name = from.first_name;
    if (from.username) db.users[userId].username = from.username;
  }
  writeDb(db);
}

function recordDownload(userId, platform) {
  const db = readDb();
  const platKey = (platform || 'other').toLowerCase();

  db.stats.totalDownloads = (db.stats.totalDownloads || 0) + 1;
  if (!db.stats.platforms) db.stats.platforms = {};
  db.stats.platforms[platKey] = (db.stats.platforms[platKey] || 0) + 1;

  if (userId && db.users[String(userId)]) {
    db.users[String(userId)].downloadsCount = (db.users[String(userId)].downloadsCount || 0) + 1;
  }
  writeDb(db);
}

function getStats() {
  const db = readDb();
  const userCount = Object.keys(db.users || {}).length;
  return {
    totalUsers: userCount,
    totalDownloads: db.stats.totalDownloads || 0,
    platforms: db.stats.platforms || {},
    startedAt: db.stats.startedAt
  };
}

function getAllUserIds() {
  const db = readDb();
  return Object.keys(db.users || {});
}

module.exports = {
  initDb,
  registerUser,
  recordDownload,
  getStats,
  getAllUserIds
};
