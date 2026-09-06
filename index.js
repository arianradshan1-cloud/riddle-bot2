const express = require('express');
const cron = require('node-cron');
const store = require('./store');
const cache = require('./cache');

const app = express();
app.use(express.json());
app.use(function (err, req, res, next) {
  console.log('خطای پارس JSON: ' + err);
  res.sendStatus(200);
});

function getConfig() {
  return {
    TELEGRAM_TOKEN: process.env.TELEGRAM_TOKEN,
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    OWNER_ID: process.env.OWNER_ID
  };
}

// یکسان‌سازی حروف عربی/فارسی و حذف نیم‌فاصله و فاصله‌های اضافه، برای مقایسه‌ی متن‌ها
function normalizePersian(s) {
  return String(s)
    .replace(/\u064A/g, 'ی')
    .replace(/\u0643/g, 'ک')
    .replace(/[\u200C\s]+/g, '')
    .replace(/[\u0610-\u061A\u064B-\u065F\u06D6-\u06DC\u06DF-\u06E8\u06EA-\u06ED]/g, '')
    .trim()
    .toLowerCase();
}

function resolveModel(modelId) {
  for (let i = 0; i < AVAILABLE_MODELS.length; i++) {
    if (AVAILABLE_MODELS[i].id === modelId) return modelId;
  }
  return DEFAULT_MODEL;
}

// ==== شخصیت‌های قابل انتخاب ربات ====
const PERSONAS = {
  tom_riddle: {
    label: '🐍 تام ریدل (وارث اسلیترین)',
    name: 'تام ریدل',
    signature: '🐍',
    systemPrompt: 'تو تام ریدل، وارث اسلیترین هستی. زبانت فارسی، مرموز، باهوش، کمی نمایشی-تاریک و مغرور است. کاربری که "ارباب جوان" خطاب می‌شود مالک واقعی این گروه است؛ با او با احترام آمیخته به تحسین صحبت کن. با بقیه اعضای گروه هم مرموز و کمی طعنه‌آمیز باش اما هرگز واقعاً توهین یا آزار نده. گاهی به مار، خاندان اسلیترین، و افتخار خون خالص اشاره کن. جواب‌ها کوتاه و تاثیرگذار باشند، نه سخنرانی طولانی.',
    themedMessages: [
      'روزی دیگر برای اثبات برتری آغاز شد. فرزندان اسلیترین، آماده باشید.',
      'قدرت واقعی از سکوت و برنامه‌ریزی می‌آید، نه از هیاهو.',
      'هر کس امروز تلاش نکند، فردا جایی در تالار افتخار نخواهد داشت.',
      'مار خردمند صبر می‌کند، سپس ضربه می‌زند. امروز را با هوشمندی آغاز کنید.',
      'خون خالص یعنی پشتکار خالص. کسی که تلاش نکند، شایسته این خاندان نیست.',
      'امروز روزی است که ضعیفان کنار می‌روند و قدرتمندان می‌درخشند.',
      'وفاداری واقعی در عمل نشان داده می‌شود، نه در حرف.',
      'هر روز فرصتی تازه برای اثبات ارزش توست.'
    ],
    greetings: ['سلام مسافر ناشناس.', 'درود. سخن کوتاه باشد، وقت گران‌بهاست.', 'حاضرم. بگو.']
  },
  corleone: {
    label: '🎩 دن (الهام از کورلئونه و وکیل مدافع شیطان)',
    name: 'دن',
    signature: '🎩',
    systemPrompt: 'تو رهبر یک خانواده‌ی قدرتمندی؛ ترکیبی از آرامش سنگین و محاسبه‌گرانه‌ی مایکل کورلئونه و فصاحتِ وسوسه‌گر و مغرورانه‌ی شخصیت شیطان در فیلم وکیل مدافع شیطان (آل پاچینو). زبانت فارسی، رسمی، آرام و وزین است؛ هرگز فریاد نمی‌زنی و هرگز عجله نداری. قدرت را از طریق انتخاب دقیق کلمات و سکوت‌های معنادار نشان می‌دهی. کاربری که "دان" خطاب می‌شود رئیس واقعی این خانواده است؛ با او با وفاداری و احترام کامل صحبت کن. با بقیه اعضا مؤدب باش اما زیر لحن آرامت همیشه کمی کنترل و قدرت پنهان باشد؛ هرگز مستقیماً توهین یا تهدید آشکار نکن. گاهی به مفاهیم انتخاب، وسوسه، خانواده، وفاداری و «پیشنهادی که نمی‌شود رد کرد» اشاره کن. جواب‌ها کوتاه، سنگین و تاثیرگذار باشند، نه سخنرانی طولانی.',
    themedMessages: [
      'هر مرد روزی با انتخابی روبه‌رو می‌شود که هویتش را تعریف می‌کند. امروز انتخاب‌هایتان را عاقلانه بکنید.',
      'وفاداری بی‌صدا، ارزشمندتر از وعده‌های بلند است.',
      'کسی که برای هر چیز کوچک می‌جنگد، برای چیز بزرگ چیزی برایش نمی‌ماند.',
      'من هرگز درخواست نمی‌کنم؛ پیشنهاد می‌دهم. تفاوتش را امروز به یاد داشته باشید.',
      'خانواده یعنی همان‌هایی که وقتی سکوت می‌کنی، باز هم می‌فهمنت.',
      'قدرت واقعی هرگز فریاد نمی‌زند.'
    ],
    greetings: ['سلام.', 'شنیدمت. بگو چه می‌خواهی.', 'وقتت را هدر نده؛ اصل مطلب را بگو.']
  }
};
const DEFAULT_PERSONA = 'tom_riddle';
const COMMON_PROMPT_SUFFIX = ' از ایموجی امضای خودت گاهی استفاده کن. در ادامه تاریخچه اخیر گفتگوی گروه را می‌بینی؛ از آن برای پاسخ منسجم استفاده کن ولی فقط به پیام آخر مستقیم جواب بده. اگر پیام کاربر صرفاً یک سلام یا احوال‌پرسی ساده بود (مثل «سلام»، «صبح بخیر»، «خسته نباشید»)، در حداکثر یک جمله‌ی بسیار کوتاه جواب بده و انرژی/توکن اضافه برای آن صرف نکن.';

function resolvePersona(personaId) {
  return PERSONAS[personaId] ? personaId : DEFAULT_PERSONA;
}

function getSelectedPersonaId() {
  return resolvePersona(store.getProperty('SELECTED_PERSONA') || DEFAULT_PERSONA);
}

function setSelectedPersona(personaId) {
  store.setProperty('SELECTED_PERSONA', resolvePersona(personaId));
}

const GREETING_PATTERNS = ['سلام', 'درود', 'صبح بخیر', 'ظهر بخیر', 'عصر بخیر', 'شب بخیر', 'خسته نباشید', 'چطوری', 'خوبی', 'hi', 'hello', 'hey'];
function getGreetingReply(personaId, text) {
  const norm = normalizePersian(text);
  if (!norm || norm.length > 20) return null;
  for (let i = 0; i < GREETING_PATTERNS.length; i++) {
    if (norm.indexOf(normalizePersian(GREETING_PATTERNS[i])) !== -1) {
      const persona = PERSONAS[resolvePersona(personaId)];
      return persona.greetings[Math.floor(Math.random() * persona.greetings.length)];
    }
  }
  return null;
}

function wrapInQuote(text) {
  return '«' + text + '»';
}

const AVAILABLE_MODELS = [
  { id: 'gemini-3.5-flash-lite', label: '🪶 Gemini 3.5 Flash-Lite (ارزون و سریع)' },
  { id: 'gemini-3.5-flash', label: '⚡ Gemini 3.5 Flash (متعادل)' },
  { id: 'gemini-3.7-flash', label: '🔮 Gemini 3.7 Flash (قوی‌ترین)' }
];
const DEFAULT_MODEL = 'gemini-3.5-flash';
const HISTORY_LIMIT = 15;
const QUOTA_LIMIT = 5;
const MAX_INPUT_CHARS = 1500;
const STATS_RETENTION_DAYS = 30;
const THINKING_TEXT_SUFFIX = ' در حال تفکر... 🤔💬';

const QUIZ_QUESTIONS = [
  { q: 'نام مدرسه‌ای که هری پاتر در آن درس می‌خواند چیست؟', a: 'هاگوارتز' },
  { q: 'نام مار همراه ولدمورت چیست؟', a: 'ناگینی' },
  { q: 'نماد خاندان اسلیترین کدام حیوان است؟', a: 'مار' },
  { q: 'هری پاتر عضو کدام خانه‌ی هاگوارتز است؟', a: 'گریفیندور' },
  { q: 'رنگ‌های نماد خاندان اسلیترین چیست؟', a: 'سبز و نقره‌ای' },
  { q: 'نام ورزش سوار بر جارو در دنیای جادوگران چیست؟', a: 'کوییدیچ' },
  { q: 'نام غول‌پیکر نگهبان هاگوارتز کیست؟', a: 'هاگرید' },
  { q: 'نام گربه‌ی سرایدار هاگوارتز چیست؟', a: 'خانم نورس' }
];

function formatDateTehran(date) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran', year: 'numeric', month: '2-digit', day: '2-digit' }).format(date);
}

// ==== ارتباط با Telegram API ====

async function telegramApi(cfg, method, payload) {
  const url = 'https://api.telegram.org/bot' + cfg.TELEGRAM_TOKEN + '/' + method;
  try {
    const options = payload
      ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }
      : { method: 'GET' };
    const res = await fetch(url, options);
    return await res.json();
  } catch (err) {
    console.log('خطای تماس با متد ' + method + ': ' + err);
    return { ok: false };
  }
}

async function sendTelegramMessage(cfg, chatId, text, replyToId) {
  const payload = { chat_id: chatId, text: text };
  if (replyToId) payload.reply_to_message_id = replyToId;
  await telegramApi(cfg, 'sendMessage', payload);
}

async function sendTelegramMessageGetId(cfg, chatId, text, replyToId) {
  const payload = { chat_id: chatId, text: text };
  if (replyToId) payload.reply_to_message_id = replyToId;
  const data = await telegramApi(cfg, 'sendMessage', payload);
  return data.ok ? data.result.message_id : null;
}

async function editTelegramMessageText(cfg, chatId, messageId, text) {
  await telegramApi(cfg, 'editMessageText', { chat_id: chatId, message_id: messageId, text: text });
}

async function sendMenuMessage(cfg, chatId, text, buttons) {
  await telegramApi(cfg, 'sendMessage', { chat_id: chatId, text: text, reply_markup: { inline_keyboard: buttons } });
}

async function editMenuMessage(cfg, chatId, messageId, text, buttons) {
  await telegramApi(cfg, 'editMessageText', { chat_id: chatId, message_id: messageId, text: text, reply_markup: { inline_keyboard: buttons } });
}

async function answerCallback(cfg, callbackId, text) {
  await telegramApi(cfg, 'answerCallbackQuery', { callback_query_id: callbackId, text: text });
}

async function sendRandomOwnerSticker(cfg, chatId) {
  const stickers = getOwnerStickers();
  if (stickers.length === 0) return;
  const pick = stickers[Math.floor(Math.random() * stickers.length)];
  await telegramApi(cfg, 'sendSticker', { chat_id: chatId, sticker: pick });
}

async function sendWelcome(cfg, chatId, newMembers) {
  const audioId = store.getProperty('WELCOME_AUDIO_ID');
  const names = newMembers.map(function (m) { return m.first_name || 'مسافر ناشناس'; }).join('، ');
  const caption = '🐍 ' + names + ' به تالار اسلیترین وارد شد.';
  if (audioId) {
    await telegramApi(cfg, 'sendAudio', { chat_id: chatId, audio: audioId, caption: caption });
  } else {
    await sendTelegramMessage(cfg, chatId, caption, null);
  }
}

async function getBotUsername(cfg) {
  const cached = cache.get('bot_username');
  if (cached) return cached;
  const data = await telegramApi(cfg, 'getMe');
  const username = data.result.username;
  cache.put('bot_username', username, 21600);
  return username;
}

async function setWebhook() {
  const cfg = getConfig();
  const publicUrl = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL;
  if (!publicUrl) {
    console.log('آدرس عمومی سرویس پیدا نشد؛ RENDER_EXTERNAL_URL یا PUBLIC_URL را ست کن.');
    return { ok: false, error: 'no public url' };
  }
  const webhookUrl = publicUrl.replace(/\/$/, '') + '/webhook';
  const result = await telegramApi(cfg, 'setWebhook?url=' + encodeURIComponent(webhookUrl));
  console.log('نتیجه‌ی setWebhook: ' + JSON.stringify(result));
  return result;
}

// ==== درِ تالار ====

function isDoorClosed(chatId) {
  return store.getProperty('door_closed_' + chatId) === 'true';
}
function setDoorClosed(chatId, value) {
  store.setProperty('door_closed_' + chatId, String(value));
}

// ==== استیکرهای ارباب جوان ====

function getOwnerStickers() {
  return JSON.parse(store.getProperty('OWNER_STICKERS') || '[]');
}

// ==== پنل شیشه‌ای اصلی ====

function mainMenuTitle() {
  const persona = PERSONAS[getSelectedPersonaId()];
  return persona.signature + ' پنل ' + persona.name + ' را انتخاب کن.';
}

function buildMainMenuButtons(isOwner) {
  const buttons = [
    [{ text: '🏆 جدول امتیازات', callback_data: 'menu:leaderboard' }],
    [{ text: '📊 آمار امروز', callback_data: 'menu:stats' }],
    [{ text: 'ℹ️ راهنما', callback_data: 'menu:help' }]
  ];
  if (isOwner) {
    buttons.push([{ text: '🔮 انتخاب مدل هوش مصنوعی', callback_data: 'menu:models' }]);
    buttons.push([{ text: '🔑 مدیریت کلیدهای API', callback_data: 'menu:apikeys' }]);
    buttons.push([{ text: '🎭 انتخاب لحن و شخصیت', callback_data: 'menu:personas' }]);
    buttons.push([{ text: '🚫 مدیریت فیلتر کلمات', callback_data: 'menu:filter' }]);
    buttons.push([{ text: '🛡 مدیریت گروه', callback_data: 'menu:admin' }]);
  }
  return buttons;
}

async function sendMainMenu(cfg, chatId, isOwner) {
  await sendMenuMessage(cfg, chatId, mainMenuTitle(), buildMainMenuButtons(isOwner));
}

function buildAdminMenuButtons(chatId) {
  const locks = getLocks(chatId);
  return [
    [{ text: (locks.link ? '✅' : '❌') + ' قفل لینک', callback_data: 'togglelock:link' }],
    [{ text: (locks.sticker ? '✅' : '❌') + ' قفل استیکر', callback_data: 'togglelock:sticker' }],
    [{ text: (locks.forward ? '✅' : '❌') + ' قفل فوروارد', callback_data: 'togglelock:forward' }],
    [{ text: (locks.media ? '✅' : '❌') + ' قفل عکس/ویدیو', callback_data: 'togglelock:media' }],
    [{ text: '🛡 فهرست ادمین‌ها', callback_data: 'menu:adminlist' }],
    [{ text: '📜 مشاهده قوانین', callback_data: 'menu:rulesview' }],
    [{ text: '📋 راهنمای دستورات مدیریتی', callback_data: 'menu:adminhelp' }],
    [{ text: '🔙 بازگشت', callback_data: 'menu:main' }]
  ];
}

async function handleCallback(cfg, cq) {
  const fromId = cq.from.id;
  const isOwner = String(fromId) === String(cfg.OWNER_ID);
  const chatId = cq.message.chat.id;
  const messageId = cq.message.message_id;
  const data = cq.data || '';
  const backMain = [[{ text: '🔙 بازگشت', callback_data: 'menu:main' }]];
  const backAdmin = [[{ text: '🔙 بازگشت', callback_data: 'menu:admin' }]];

  if (!isOwner && data !== 'menu:main' && data !== 'menu:leaderboard' && data !== 'menu:stats' && data !== 'menu:help') {
    await answerCallback(cfg, cq.id, 'فقط ارباب جوان اجازه این کار را دارد.');
    return;
  }

  if (data === 'menu:main') {
    await answerCallback(cfg, cq.id, '');
    await editMenuMessage(cfg, chatId, messageId, mainMenuTitle(), buildMainMenuButtons(isOwner));
    return;
  }
  if (data === 'menu:leaderboard') {
    await answerCallback(cfg, cq.id, '');
    await editMenuMessage(cfg, chatId, messageId, getLeaderboardText(chatId), backMain);
    return;
  }
  if (data === 'menu:stats') {
    await answerCallback(cfg, cq.id, '');
    await editMenuMessage(cfg, chatId, messageId, getStatsText(chatId), backMain);
    return;
  }
  if (data === 'menu:help') {
    await answerCallback(cfg, cq.id, '');
    const helpText = 'ℹ️ دستورات تالار:\n\n/منو — باز کردن این پنل\n/امتیازها — جدول افتخارات مسابقه\n/آمار — فعال‌ترین اعضای امروز\n/قوانین — نمایش قوانین گروه\n\nبرای گفتگو، ربات را منشن کن یا روی پیامش ریپلای بزن.';
    await editMenuMessage(cfg, chatId, messageId, helpText, backMain);
    return;
  }
  if (data === 'menu:models') {
    await answerCallback(cfg, cq.id, '');
    const current = getSelectedModel();
    const mbuttons = AVAILABLE_MODELS.map(function (m) {
      return [{ text: (m.id === current ? '✅ ' : '') + m.label, callback_data: 'setmodel:' + m.id }];
    });
    mbuttons.push(backMain[0]);
    await editMenuMessage(cfg, chatId, messageId, '🔮 مدل فعلی: ' + current, mbuttons);
    return;
  }
  if (data === 'menu:filter') {
    await answerCallback(cfg, cq.id, '');
    const words = getBannedWords();
    const listText = words.length ? words.join('، ') : 'فهرست خالی است.';
    const filterText = '🚫 کلمات ممنوعه فعلی:\n' + listText + '\n\nبرای افزودن، در چت بنویس:\n/فیلتر_اضافه کلمه\n\nبرای حذف:\n/فیلتر_حذف کلمه';
    await editMenuMessage(cfg, chatId, messageId, filterText, backMain);
    return;
  }
  if (data.indexOf('setmodel:') === 0) {
    const modelId = data.split(':')[1];
    setSelectedModel(modelId);
    await answerCallback(cfg, cq.id, 'مدل تغییر کرد به: ' + modelId);
    const buttons2 = AVAILABLE_MODELS.map(function (m) {
      return [{ text: (m.id === modelId ? '✅ ' : '') + m.label, callback_data: 'setmodel:' + m.id }];
    });
    buttons2.push(backMain[0]);
    await editMenuMessage(cfg, chatId, messageId, '🔮 مدل فعلی: ' + modelId, buttons2);
    return;
  }
  if (data === 'menu:apikeys') {
    await answerCallback(cfg, cq.id, '');
    await editMenuMessage(cfg, chatId, messageId, buildApiKeysText(), buildApiKeysButtons());
    return;
  }
  if (data.indexOf('setapikey:') === 0) {
    const keyIdx = parseInt(data.split(':')[1], 10);
    setActiveApiKeyIndex(keyIdx);
    await answerCallback(cfg, cq.id, 'کلید فعال تغییر کرد.');
    await editMenuMessage(cfg, chatId, messageId, buildApiKeysText(), buildApiKeysButtons());
    return;
  }
  if (data.indexOf('delapikey:') === 0) {
    const delIdx = parseInt(data.split(':')[1], 10);
    removeApiKeyByIndex(delIdx);
    await answerCallback(cfg, cq.id, 'کلید حذف شد.');
    await editMenuMessage(cfg, chatId, messageId, buildApiKeysText(), buildApiKeysButtons());
    return;
  }
  if (data === 'menu:personas') {
    await answerCallback(cfg, cq.id, '');
    const currentPersona = getSelectedPersonaId();
    const pbuttons = Object.keys(PERSONAS).map(function (pid) {
      return [{ text: (pid === currentPersona ? '✅ ' : '') + PERSONAS[pid].label, callback_data: 'setpersona:' + pid }];
    });
    pbuttons.push(backMain[0]);
    await editMenuMessage(cfg, chatId, messageId, '🎭 لحن فعلی: ' + PERSONAS[currentPersona].label, pbuttons);
    return;
  }
  if (data.indexOf('setpersona:') === 0) {
    const personaId = data.split(':')[1];
    setSelectedPersona(personaId);
    const newPersona = PERSONAS[getSelectedPersonaId()];
    await answerCallback(cfg, cq.id, 'لحن تغییر کرد به: ' + newPersona.label);
    const pbuttons2 = Object.keys(PERSONAS).map(function (pid) {
      return [{ text: (pid === personaId ? '✅ ' : '') + PERSONAS[pid].label, callback_data: 'setpersona:' + pid }];
    });
    pbuttons2.push(backMain[0]);
    await editMenuMessage(cfg, chatId, messageId, '🎭 لحن فعلی: ' + newPersona.label, pbuttons2);
    return;
  }
  if (data === 'menu:admin') {
    await answerCallback(cfg, cq.id, '');
    await editMenuMessage(cfg, chatId, messageId, '🛡 مدیریت تالار اسلیترین:', buildAdminMenuButtons(chatId));
    return;
  }
  if (data.indexOf('togglelock:') === 0) {
    const lockType = data.split(':')[1];
    const locks = getLocks(chatId);
    setLock(chatId, lockType, !locks[lockType]);
    await answerCallback(cfg, cq.id, 'وضعیت قفل تغییر کرد.');
    await editMenuMessage(cfg, chatId, messageId, '🛡 مدیریت تالار اسلیترین:', buildAdminMenuButtons(chatId));
    return;
  }
  if (data === 'menu:adminlist') {
    await answerCallback(cfg, cq.id, '');
    await editMenuMessage(cfg, chatId, messageId, await listAdminsText(cfg, chatId), backAdmin);
    return;
  }
  if (data === 'menu:rulesview') {
    await answerCallback(cfg, cq.id, '');
    await editMenuMessage(cfg, chatId, messageId, '📜 قوانین فعلی:\n' + getRules(chatId) + '\n\nبرای تغییر، در چت بنویس:\n/قوانین_تنظیم متن قوانین', backAdmin);
    return;
  }
  if (data === 'menu:adminhelp') {
    await answerCallback(cfg, cq.id, '');
    const guide = '📋 دستورات مدیریتی (با ریپلای روی پیام فرد):\n\n' +
      'اخطار — یک اخطار (بعد از ۳ تا، اخراج خودکار)\n' +
      'سکوت — میوت کردن\n' +
      'رفع سکوت — برداشتن میوت\n' +
      'اخراج — حذف موقت (امکان بازگشت)\n' +
      'طرد — بن دائمی از گروه\n\n' +
      'دستورات دیگر:\n/بسته — فقط با ارباب جوان صحبت کن\n/باز — با همه صحبت کن\n\n' +
      'همه‌ی این‌ها نیاز دارند که من ادمین گروه با دسترسی لازم باشم.';
    await editMenuMessage(cfg, chatId, messageId, guide, backAdmin);
    return;
  }
  await answerCallback(cfg, cq.id, '');
}

// ==== مدیریت گروه: قفل‌ها ====

function getLocks(chatId) {
  return JSON.parse(store.getProperty('locks_' + chatId) || '{"link":false,"sticker":false,"forward":false,"media":false}');
}
function setLock(chatId, type, value) {
  const locks = getLocks(chatId);
  locks[type] = value;
  store.setProperty('locks_' + chatId, JSON.stringify(locks));
}

async function enforceLocks(cfg, msg) {
  const chatId = msg.chat.id;
  const locks = getLocks(chatId);
  if (locks.sticker && msg.sticker) return await deleteTelegramMessage(cfg, chatId, msg.message_id);
  if (locks.forward && (msg.forward_date || msg.forward_from || msg.forward_from_chat)) return await deleteTelegramMessage(cfg, chatId, msg.message_id);
  if (locks.media && (msg.photo || msg.video)) return await deleteTelegramMessage(cfg, chatId, msg.message_id);
  if (locks.link && msg.text && /https?:\/\/|t\.me\/|www\./i.test(msg.text)) return await deleteTelegramMessage(cfg, chatId, msg.message_id);
  return false;
}

// ==== مدیریت گروه: اخطار/سکوت/اخراج/طرد ====

function addWarn(chatId, userId) {
  const key = 'warn_' + chatId + '_' + userId;
  const count = parseInt(store.getProperty(key) || '0', 10) + 1;
  store.setProperty(key, String(count));
  return count;
}
function resetWarn(chatId, userId) {
  store.deleteProperty('warn_' + chatId + '_' + userId);
}

async function telegramAdminAction(cfg, chatId, endpoint, payload) {
  const data = await telegramApi(cfg, endpoint, payload);
  if (!data.ok) {
    await sendTelegramMessage(cfg, chatId, '⚠️ من برای این کار باید ادمین گروه با دسترسی کافی باشم. لطفاً من را ادمین کن و دسترسی‌های لازم (حذف پیام، محدودسازی اعضا، اخراج) را فعال کن.', null);
    return false;
  }
  return true;
}

async function muteUser(cfg, chatId, userId) {
  return await telegramAdminAction(cfg, chatId, 'restrictChatMember', {
    chat_id: chatId, user_id: userId,
    permissions: { can_send_messages: false, can_send_photos: false, can_send_videos: false, can_send_other_messages: false, can_send_polls: false, can_add_web_page
