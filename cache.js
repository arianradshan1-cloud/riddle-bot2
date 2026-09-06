// جایگزین ساده‌ی CacheService گوگل: یک Map در حافظه با انقضای زمانی.
// فقط برای داده‌ی کوتاه‌مدت (جلوگیری از پردازش تکراری آپدیت، کش نام کاربری ربات) لازم است.

const store = new Map();

function put(key, value, ttlSeconds) {
  const expiresAt = Date.now() + ttlSeconds * 1000;
  store.set(key, { value: value, expiresAt: expiresAt });
}

function get(key) {
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.value;
}

module.exports = { put: put, get: get };
