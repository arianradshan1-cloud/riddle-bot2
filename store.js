// جایگزین ساده‌ی PropertiesService گوگل: یک فایل JSON روی دیسک که مثل key-value store کار می‌کند.
// توجه: روی پلن رایگان Render دیسک پایدار وجود ندارد، یعنی این فایل با هر ری‌استارت/دیپلوی
// جدید ریست می‌شود. برای یک ربات کوچک معمولاً مشکلی نیست؛ اگر بعداً داده‌ی ماندگارتر خواستی
// (آمار، امتیازها)، می‌شود این ماژول را با یک دیتابیس واقعی جایگزین کرد بدون تغییر بقیه‌ی کد.

const fs = require('fs');
const path = require('path');

const DATA_FILE = path.join(__dirname, 'data.json');

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    }
  } catch (err) {
    console.log('خطا در خواندن فایل ذخیره‌سازی: ' + err);
  }
  return {};
}

let data = loadData();
let writeQueue = Promise.resolve();

function persist() {
  writeQueue = writeQueue.then(function () {
    return new Promise(function (resolve) {
      fs.writeFile(DATA_FILE, JSON.stringify(data), function (err) {
        if (err) console.log('خطا در نوشتن فایل ذخیره‌سازی: ' + err);
        resolve();
      });
    });
  });
  return writeQueue;
}

module.exports = {
  getProperty: function (key) {
    return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null;
  },
  setProperty: function (key, value) {
    data[key] = value;
    persist();
  },
  deleteProperty: function (key) {
    delete data[key];
    persist();
  },
  getProperties: function () {
    return Object.assign({}, data);
  },
  flush: function () {
    return writeQueue;
  }
};
