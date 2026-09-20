const http = require('http');
const TelegramBot = require('./telegram');
const downloader = require('./downloader');
const db = require('./db');

// Environment Configuration
const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.error('CRITICAL ERROR: TELEGRAM_TOKEN environment variable is not defined.');
  process.exit(1);
}
const REQUIRED_CHANNEL = process.env.REQUIRED_CHANNEL || '@rad_protocol';
const CHANNEL_LINK = process.env.CHANNEL_LINK || 'https://t.me/rad_protocol';
const SUPPORT_GROUP = process.env.SUPPORT_GROUP || 'https://t.me/radprotocoll';
const ADMIN_IDS = (process.env.ADMIN_ID || '').split(',').map(s => s.trim()).filter(Boolean);
const PORT = process.env.PORT || 3000;

const bot = new TelegramBot(TELEGRAM_TOKEN);

// Initialize Database
db.initDb();

// Helper: Check if user is admin
function isAdmin(userId) {
  return ADMIN_IDS.includes(String(userId));
}

// Helper: Check Channel Membership
async function isChannelMember(userId) {
  if (isAdmin(userId)) return true; // Admins bypass join check
  try {
    const res = await bot.getChatMember(REQUIRED_CHANNEL, userId);
    if (!res || !res.ok) {
      console.warn(`Could not verify membership for ${userId} in ${REQUIRED_CHANNEL}:`, res && res.description);
      return false;
    }
    const status = res.result.status;
    return ['creator', 'administrator', 'member', 'restricted'].includes(status);
  } catch (err) {
    console.error('Error in isChannelMember:', err.message);
    return false;
  }
}

// UI: Force-Join Message
function getJoinMarkup() {
  return {
    inline_keyboard: [
      [
        { text: '📢 عضویت در کانال RadProtocol', url: CHANNEL_LINK }
      ],
      [
        { text: '✅ تایید عضویت', callback_data: 'verify_join' }
      ],
      [
        { text: '👥 گروه پشتیبانی و گفتگو', url: SUPPORT_GROUP }
      ]
    ]
  };
}

function getJoinMessage(name) {
  return (
    `سلام <b>${name || 'کاربر گرامی'}</b> عزیز! 🌹\n\n` +
    `🔒 <b>برای استفاده از امکانات ربات دانلودر و دسترسی رایگان، ابتدا باید در کانال رسمی ما عضو شوید:</b>\n\n` +
    `📢 <b>کانال:</b> ${REQUIRED_CHANNEL}\n\n` +
    `👇 پس از عضویت در کانال، روی دکمه‌ی <b>«تایید عضویت ✅»</b> کلیک کنید:`
  );
}

// UI: Main Menu
function getMainMenuMarkup() {
  return {
    inline_keyboard: [
      [
        { text: '📥 راهنمای دانلود رسانه‌ها', callback_data: 'help_menu' },
        { text: '📊 آمار و وضعیت سرویس', callback_data: 'stats_menu' }
      ],
      [
        { text: '📢 کانال رسمی', url: CHANNEL_LINK },
        { text: '👥 گروه گفتگو', url: SUPPORT_GROUP }
      ]
    ]
  };
}

function getStartMessage(name) {
  return (
    `👋 درود <b>${name || 'دوست من'}</b>، به ربات دانلودر خوش اومدی! ⚡️\n\n` +
    `من یه ابزار سریع و کاملاً رایگان برای دانلود از شبکه‌های اجتماعی هستم:\n\n` +
    `• 📱 <b>اینستاگرام</b> (پست، ریلز، اسلایدری، استوری)\n` +
    `• 🎵 <b>تیک‌تاک</b> (بدون واترمارک + صوت MP3)\n` +
    `• 🎬 <b>یوتیوب</b> (Shorts و ویدیوهای باکیفیت)\n` +
    `• 🐦 <b>توییتر / X</b> (ویدیوها و تصاویر با بالاترین رزولوشن)\n` +
    `• 📌 <b>پینترست</b> (عکس‌ها و ویدیوهای باکیفیت)\n\n` +
    `💡 <b>کافیه فقط لینک هر پستی که می‌خوای رو برام بفرستی تا در چند ثانیه فایل کاملش رو برات بفرستم!</b>`
  );
}

// Handle Incoming Updates
async function handleUpdate(update) {
  try {
    // 1. Handle Callback Queries (Button Clicks)
    if (update.callback_query) {
      const cq = update.callback_query;
      const userId = cq.from.id;
      const data = cq.data;
      const chatId = cq.message ? cq.message.chat.id : userId;
      const messageId = cq.message ? cq.message.message_id : null;

      db.registerUser(cq.from);

      if (data === 'verify_join') {
        const joined = await isChannelMember(userId);
        if (joined) {
          await bot.answerCallbackQuery(cq.id, {
            text: 'عضویت شما با موفقیت تأیید شد! خوش آمدید 🎉',
            show_alert: true
          });
          if (messageId) {
            await bot.editMessageText(chatId, messageId, getStartMessage(cq.from.first_name), {
              reply_markup: getMainMenuMarkup()
            });
          } else {
            await bot.sendMessage(chatId, getStartMessage(cq.from.first_name), {
              reply_markup: getMainMenuMarkup()
            });
          }
        } else {
          await bot.answerCallbackQuery(cq.id, {
            text: '❌ شما هنوز عضو کانال نشده‌اید! لطفاً ابتدا عضو شوید.',
            show_alert: true
          });
        }
        return;
      }

      if (data === 'help_menu') {
        await bot.answerCallbackQuery(cq.id);
        const helpText = (
          `📖 <b>راهنمای استفاده از ربات:</b>\n\n` +
          `1️⃣ وارد اپلیکیشن (اینستاگرام، تیک‌تاک، یوتیوب و... ) شوید.\n` +
          `2️⃣ روی دکمه Share یا کپی لینک (Copy Link) پست مورد نظر بزنید.\n` +
          `3️⃣ لینک را در همین چت ارسال کنید.\n` +
          `4️⃣ ربات به صورت خودکار رسانه را استخراج و برای شما ارسال می‌کند!\n\n` +
          `📢 کانال ما: ${REQUIRED_CHANNEL}`
        );
        await bot.sendMessage(chatId, helpText, { reply_markup: getMainMenuMarkup() });
        return;
      }

      if (data === 'stats_menu') {
        await bot.answerCallbackQuery(cq.id);
        const stats = db.getStats();
        const statsText = (
          `📊 <b>وضعیت سامانه دانلودر:</b>\n\n` +
          `👥 تعداد کاربران: <b>${stats.totalUsers}</b> نفر\n` +
          `📥 تعداد کل دانلودها: <b>${stats.totalDownloads}</b> فایل\n` +
          `🟢 وضعیت سرور: <b>آنلاین و پرسرعت (Render Cloud)</b>\n\n` +
          `📢 اسپانسر: ${REQUIRED_CHANNEL}`
        );
        await bot.sendMessage(chatId, statsText, { reply_markup: getMainMenuMarkup() });
        return;
      }

      // Audio download button for TikTok
      if (data.startsWith('audio_')) {
        const audioUrl = Buffer.from(data.replace('audio_', ''), 'base64').toString('utf-8');
        await bot.answerCallbackQuery(cq.id, { text: 'در حال ارسال فایل صوتی...' });
        await bot.sendAudio(chatId, audioUrl, {
          caption: `🎵 فایل صوتی استخراج‌شده\n📢 ${REQUIRED_CHANNEL}`
        });
        return;
      }
    }

    // 2. Handle Text Messages
    if (update.message && update.message.text) {
      const msg = update.message;
      const chatId = msg.chat.id;
      const userId = msg.from.id;
      const text = msg.text.trim();

      db.registerUser(msg.from);

      // Channel Membership Check
      const joined = await isChannelMember(userId);
      if (!joined) {
        await bot.sendMessage(chatId, getJoinMessage(msg.from.first_name), {
          reply_markup: getJoinMarkup()
        });
        return;
      }

      // Command: /start
      if (text === '/start') {
        await bot.sendMessage(chatId, getStartMessage(msg.from.first_name), {
          reply_markup: getMainMenuMarkup()
        });
        return;
      }

      // Command: /help
      if (text === '/help') {
        const helpText = (
          `📖 <b>راهنمای استفاده از ربات:</b>\n\n` +
          `کافیست لینک هر ویدیو، عکس یا موزیک از اینستاگرام، تیک‌تاک، یوتیوب، توییتر یا پینترست را بفرستید.\n\n` +
          `📢 ${REQUIRED_CHANNEL}`
        );
        await bot.sendMessage(chatId, helpText, { reply_markup: getMainMenuMarkup() });
        return;
      }

      // Admin Command: /admin or /stats
      if ((text === '/admin' || text === '/stats') && isAdmin(userId)) {
        const stats = db.getStats();
        const uptimeH = (process.uptime() / 3600).toFixed(1);
        const adminText = (
          `👑 <b>پنل مدیریت ربات (RadProtocol)</b>\n\n` +
          `👥 کل کاربران ثبت‌شده: <b>${stats.totalUsers}</b>\n` +
          `📥 کل دانلودهای موفق: <b>${stats.totalDownloads}</b>\n\n` +
          `📱 <b>آمار به تفکیک پلتفرم:</b>\n` +
          `• تیک‌تاک: <b>${stats.platforms.tiktok || 0}</b>\n` +
          `• اینستاگرام: <b>${stats.platforms.instagram || 0}</b>\n` +
          `• یوتیوب: <b>${stats.platforms.youtube || 0}</b>\n` +
          `• توییتر: <b>${stats.platforms.twitter || 0}</b>\n` +
          `• پینترست: <b>${stats.platforms.pinterest || 0}</b>\n` +
          `• سایر: <b>${stats.platforms.other || 0}</b>\n\n` +
          `⏱ آپ‌تایم سرور: <b>${uptimeH} ساعت</b>\n` +
          `📢 پیام همگانی: <code>/broadcast متن پیام</code>`
        );
        await bot.sendMessage(chatId, adminText);
        return;
      }

      // Admin Command: /broadcast <text>
      if (text.startsWith('/broadcast') && isAdmin(userId)) {
        const broadcastText = text.replace('/broadcast', '').trim();
        if (!broadcastText) {
          await bot.sendMessage(chatId, 'لطفاً متن پیام همگانی را بعد از دستور وارد کنید:\n<code>/broadcast سلام دوستان...</code>');
          return;
        }

        const users = db.getAllUserIds();
        await bot.sendMessage(chatId, `⏳ ارسال پیام به ${users.length} کاربر آغاز شد...`);
        let successCount = 0;

        for (const uid of users) {
          try {
            await bot.sendMessage(uid, broadcastText);
            successCount++;
            await new Promise(r => setTimeout(r, 40)); // Rate limit protection
          } catch (e) {
            // User may have blocked bot
          }
        }
        await bot.sendMessage(chatId, `✅ پیام همگانی با موفقیت به ${successCount} نفر از ${users.length} کاربر ارسال شد.`);
        return;
      }

      // URL Detection & Media Download
      const urlRegex = /(https?:\/\/[^\s]+)/gi;
      const urls = text.match(urlRegex);

      if (urls && urls.length > 0) {
        const targetUrl = urls[0];

        // Send processing status
        const statusMsg = await bot.sendMessage(chatId, '⏳ <b>در حال پردازش و دریافت رسانه... لطفاً چند لحظه صبر کنید.</b>');
        const statusMsgId = statusMsg && statusMsg.ok ? statusMsg.result.message_id : null;

        try {
          const result = await downloader.downloadMedia(targetUrl);

          if (!result) {
            if (statusMsgId) {
              await bot.editMessageText(
                chatId,
                statusMsgId,
                '❌ <b>متأسفانه امکان دریافت این رسانه وجود نداشت.</b>\n\n' +
                'لطفاً بررسی کنید پیج یا پست عمومی (Public) باشد و لینک به درستی کپی شده باشد.'
              );
            }
            return;
          }

          // Format Platform Badge
          const badges = {
            tiktok: '🎵 تیک‌تاک (TikTok)',
            instagram: '📱 اینستاگرام (Instagram)',
            youtube: '🎬 یوتیوب (YouTube)',
            twitter: '🐦 توییتر (Twitter / X)',
            pinterest: '📌 پینترست (Pinterest)',
            generic: '🌐 وب'
          };
          const badge = badges[result.platform] || '⚡️ رسانه';

          let caption = (
            `🎬 <b>${(result.title || 'رسانه دانلودی').slice(0, 100)}</b>\n\n` +
            `👤 <b>سازنده:</b> ${result.author || 'ناشناس'}\n` +
            `⚡️ <b>پلتفرم:</b> ${badge}\n\n` +
            `💎 <b>دانلود رایگان با ربات اختصاصی:</b>\n` +
            `📢 <b>کانال ما:</b> ${REQUIRED_CHANNEL}\n` +
            `👥 <b>گروه:</b> ${SUPPORT_GROUP}`
          );

          // Inline buttons for additional options (e.g. MP3 for TikTok)
          let replyMarkup = null;
          if (result.audioUrl && result.audioUrl.length < 50) {
            const b64 = Buffer.from(result.audioUrl).toString('base64');
            replyMarkup = {
              inline_keyboard: [
                [{ text: '🎵 دریافت فایل صوتی (MP3)', callback_data: `audio_${b64}` }]
              ]
            };
          }

          // Send Video
          if (result.type === 'video' && result.videoUrl) {
            const sendRes = await bot.sendVideo(chatId, result.videoUrl, {
              caption: caption,
              reply_markup: replyMarkup
            });

            if (sendRes && sendRes.ok) {
              db.recordDownload(userId, result.platform);
              if (statusMsgId) await bot.deleteMessage(chatId, statusMsgId);
              return;
            }
          }

          // Send Photo
          if (result.type === 'photo' && result.photoUrl) {
            const sendRes = await bot.sendPhoto(chatId, result.photoUrl, {
              caption: caption
            });

            if (sendRes && sendRes.ok) {
              db.recordDownload(userId, result.platform);
              if (statusMsgId) await bot.deleteMessage(chatId, statusMsgId);
              return;
            }
          }

          // Send Photos Carousel
          if (result.type === 'carousel' || result.type === 'photos') {
            const mediaList = [];
            const photos = result.photos || [];

            for (let i = 0; i < Math.min(photos.length, 10); i++) {
              mediaList.push({
                type: 'photo',
                media: photos[i],
                caption: i === 0 ? caption : undefined,
                parse_mode: 'HTML'
              });
            }

            if (mediaList.length > 0) {
              await bot.sendMediaGroup(chatId, mediaList);
              db.recordDownload(userId, result.platform);
              if (statusMsgId) await bot.deleteMessage(chatId, statusMsgId);
              return;
            }
          }

          // If send failed
          if (statusMsgId) {
            await bot.editMessageText(
              chatId,
              statusMsgId,
              '❌ <b>خطا در ارسال فایل.</b> ممکن است حجم فایل بیش از حد مجاز تلگرام باشد یا لینک منقضی شده باشد.'
            );
          }
        } catch (err) {
          console.error('Download processing error:', err.message);
          if (statusMsgId) {
            await bot.editMessageText(chatId, statusMsgId, '❌ در پردازش این لینک خطایی رخ داد.');
          }
        }
        return;
      }

      // Default response if message is not a command or URL
      await bot.sendMessage(
        chatId,
        '💡 <b>لطفاً لینک ویدیوی مورد نظرتان را ارسال کنید!</b>\n\n' +
        'پشتیبانی از: اینستاگرام، تیک‌تاک، یوتیوب، توییتر و پینترست.',
        { reply_markup: getMainMenuMarkup() }
      );
    }
  } catch (err) {
    console.error('Global handleUpdate error:', err);
  }
}

// HTTP Server (Native Node.js - Zero External Dependencies)
const server = http.createServer(async (req, res) => {
  const parsedUrl = (req.url || '/').split('?')[0];

  if (req.method === 'GET' && (parsedUrl === '/' || parsedUrl === '/health')) {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({
      status: 'online',
      service: 'RadProtocol Downloader Bot',
      version: '2.0.0',
      uptime: `${Math.floor(process.uptime())}s`
    }));
  }

  if (req.method === 'GET' && parsedUrl === '/test-dl') {
    const rawUrl = req.url.includes('url=') ? decodeURIComponent(req.url.split('url=')[1]) : 'https://www.youtube.com/watch?v=vbW6W9cKM84';
    const client = req.url.includes('client=') ? req.url.split('client=')[1].split('&')[0] : 'android';
    const { exec } = require('child_process');
    exec(`./yt-dlp -j --no-playlist -f "b[ext=mp4]/best[ext=mp4]/best" --extractor-args "youtube:player_client=${client}" "${rawUrl}"`, { timeout: 35000 }, (err, stdout, stderr) => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        client,
        err: err ? err.message : null,
        stderr: stderr || null,
        stdoutLen: (stdout || '').length,
        stdoutSample: (stdout || '').slice(0, 500)
      }));
    });
    return;
  }

  if (req.method === 'POST' && parsedUrl === '/webhook') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
      try {
        if (body && body.trim()) {
          const update = JSON.parse(body);
          handleUpdate(update);
        }
      } catch (err) {
        console.error('Invalid webhook JSON payload:', err.message);
      }
    });
    return;
  }

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not Found');
});

// Start Service
server.listen(PORT, async () => {
  console.log(`🚀 Server listening on port ${PORT}`);

  const botInfo = await bot.getMe();
  if (botInfo && botInfo.ok) {
    console.log(`🤖 Logged in as @${botInfo.result.username} (${botInfo.result.first_name})`);
  } else {
    console.error('❌ Failed to login to Telegram with provided token!');
  }

  // Setup Webhook on Render
  const renderUrl = process.env.RENDER_EXTERNAL_URL || process.env.WEBHOOK_URL;
  if (renderUrl) {
    const webhookUrl = `${renderUrl.replace(/\/$/, '')}/webhook`;
    console.log(`🔗 Setting Telegram Webhook to: ${webhookUrl}`);
    const whRes = await bot.setWebhook(webhookUrl);
    console.log('Webhook result:', whRes);

    // Self-Ping Keep-Alive to prevent Render free-tier sleep
    initKeepAlive(renderUrl);
  } else {
    console.log('⚡️ No Webhook URL detected; starting long polling mode...');
    startPolling();
  }
});

// Self-Ping to prevent Render free-tier from sleeping (Pings every 10 minutes)
function initKeepAlive(url) {
  const targetUrl = url.replace(/\/$/, '') + '/';
  const INTERVAL_MS = 10 * 60 * 1000; // 10 minutes
  console.log(`⏱ Keep-Alive system active: Pinging ${targetUrl} every 10 minutes`);
  setInterval(async () => {
    try {
      const res = await fetch(targetUrl);
      console.log(`[Keep-Alive] Ping to ${targetUrl} successful (Status: ${res.status})`);
    } catch (err) {
      console.warn(`[Keep-Alive] Ping failed: ${err.message}`);
    }
  }, INTERVAL_MS);
}

// Fallback Long Polling (for local dev / non-webhook environments)
async function startPolling() {
  await bot.deleteWebhook();
  let offset = 0;
  while (true) {
    try {
      const updates = await bot.getUpdates(offset, 25);
      if (updates && updates.ok && Array.isArray(updates.result)) {
        for (const update of updates.result) {
          offset = update.update_id + 1;
          handleUpdate(update);
        }
      }
    } catch (e) {
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}
