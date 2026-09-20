const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');

function getYtDlpPath() {
  const localBin = path.join(__dirname, 'yt-dlp');
  if (fs.existsSync(localBin)) return localBin;
  return 'yt-dlp';
}

function getCookieFilePath() {
  const cookieFile = path.join(__dirname, 'cookies.txt');
  if (process.env.YOUTUBE_COOKIES && process.env.YOUTUBE_COOKIES.trim()) {
    try {
      fs.writeFileSync(cookieFile, process.env.YOUTUBE_COOKIES.trim());
      return cookieFile;
    } catch (e) {
      console.warn('Failed to write cookies from env:', e.message);
    }
  }
  if (fs.existsSync(cookieFile)) return cookieFile;
  return null;
}

function extractStreamUrl(item) {
  if (!item) return null;
  if (item.url) return item.url;
  if (Array.isArray(item.formats) && item.formats.length > 0) {
    const combined = item.formats
      .filter(f => f.url && f.vcodec !== 'none' && f.acodec !== 'none')
      .sort((a, b) => (b.height || 0) - (a.height || 0));
    if (combined.length > 0) {
      const p720 = combined.find(f => (f.height || 0) <= 720) || combined[0];
      return p720.url;
    }
    const anyVid = item.formats
      .filter(f => f.url && f.vcodec !== 'none')
      .sort((a, b) => (b.height || 0) - (a.height || 0));
    if (anyVid.length > 0) return anyVid[0].url;

    const any = item.formats.filter(f => f.url);
    if (any.length > 0) return any[0].url;
  }
  return null;
}

function runYtDlpJson(url, extraArgs = []) {
  return new Promise((resolve) => {
    const bin = getYtDlpPath();
    const cookiePath = getCookieFilePath();
    const args = [
      '-j',
      '--no-playlist',
      '--no-warnings',
      '--socket-timeout', '20',
      '-f', 'b[ext=mp4]/best[ext=mp4]/best',
      '--extractor-args', 'youtube:player_client=ios,android,web',
      ...(cookiePath ? ['--cookies', cookiePath] : []),
      ...extraArgs,
      url
    ];
    execFile(
      bin,
      args,
      { timeout: 45000, maxBuffer: 15 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err || !stdout) {
          if (stderr) console.warn('[yt-dlp stderr]:', stderr.slice(0, 300));
          return resolve(null);
        }
        try {
          const lines = stdout.trim().split('\n');
          const results = lines.map(line => {
            try { return JSON.parse(line); } catch (e) { return null; }
          }).filter(Boolean);
          resolve(results.length > 1 ? results : (results[0] || null));
        } catch (e) {
          resolve(null);
        }
      }
    );
  });
}

// 1. TikTok Downloader (TikWM API)
async function downloadTikTok(url) {
  try {
    const apiUrl = `https://www.tikwm.com/api/?url=${encodeURIComponent(url)}`;
    const res = await fetch(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    if (data && data.code === 0 && data.data) {
      const d = data.data;
      if (d.images && d.images.length > 0) {
        return {
          platform: 'tiktok',
          type: 'carousel',
          title: d.title || 'TikTok Slideshow',
          author: d.author ? d.author.nickname : 'TikTok User',
          photos: d.images,
          audioUrl: d.music
        };
      }
      return {
        platform: 'tiktok',
        type: 'video',
        title: d.title || 'TikTok Video',
        author: d.author ? d.author.nickname : 'TikTok User',
        videoUrl: d.play || d.wmplay,
        audioUrl: d.music,
        cover: d.cover
      };
    }
  } catch (err) {
    console.error('TikWM error:', err.message);
  }

  // Fallback to yt-dlp
  const ytdl = await runYtDlpJson(url);
  if (ytdl && ytdl.url) {
    return {
      platform: 'tiktok',
      type: 'video',
      title: ytdl.title || 'TikTok Video',
      author: ytdl.uploader || 'TikTok',
      videoUrl: ytdl.url,
      cover: ytdl.thumbnail
    };
  }
  return null;
}

// 2. Twitter / X Downloader (FxTwitter API)
async function downloadTwitter(url) {
  try {
    const match = url.match(/(?:twitter\.com|x\.com)\/([a-zA-Z0-9_]+)\/status\/(\d+)/i);
    if (match) {
      const user = match[1];
      const id = match[2];
      const fxUrl = `https://api.fxtwitter.com/${user}/status/${id}`;
      const res = await fetch(fxUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      const data = await res.json();

      if (data && data.tweet) {
        const tweet = data.tweet;
        if (tweet.media && tweet.media.videos && tweet.media.videos.length > 0) {
          const vid = tweet.media.videos[0];
          return {
            platform: 'twitter',
            type: 'video',
            title: tweet.text || 'Twitter / X Video',
            author: tweet.author ? tweet.author.name : user,
            videoUrl: vid.url,
            cover: vid.thumbnail_url
          };
        } else if (tweet.media && tweet.media.photos && tweet.media.photos.length > 0) {
          return {
            platform: 'twitter',
            type: 'photos',
            title: tweet.text || 'Twitter / X Photos',
            author: tweet.author ? tweet.author.name : user,
            photos: tweet.media.photos.map(p => p.url)
          };
        }
      }
    }
  } catch (err) {
    console.error('FxTwitter error:', err.message);
  }

  // Fallback to yt-dlp
  const ytdl = await runYtDlpJson(url);
  if (ytdl && ytdl.url) {
    return {
      platform: 'twitter',
      type: 'video',
      title: ytdl.title || 'Twitter / X Video',
      author: ytdl.uploader || 'Twitter User',
      videoUrl: ytdl.url,
      cover: ytdl.thumbnail
    };
  }
  return null;
}

// 3. Instagram Downloader
async function downloadInstagram(url) {
  // First attempt: yt-dlp (Most reliable for Instagram reels/carousels on Render)
  const ytdl = await runYtDlpJson(url);
  if (ytdl) {
    if (Array.isArray(ytdl)) {
      const photos = [];
      const videos = [];
      for (const item of ytdl) {
        const streamUrl = extractStreamUrl(item);
        if (streamUrl) {
          const isVid = item.vcodec && item.vcodec !== 'none';
          if (isVid) videos.push(streamUrl);
          else photos.push(streamUrl);
        }
      }
      if (photos.length > 0 || videos.length > 0) {
        return {
          platform: 'instagram',
          type: 'carousel',
          title: (ytdl[0] && ytdl[0].title) || 'Instagram Carousel',
          author: (ytdl[0] && ytdl[0].uploader) || 'Instagram User',
          photos: photos,
          videos: videos
        };
      }
    } else {
      const streamUrl = extractStreamUrl(ytdl);
      if (streamUrl) {
        const isVideo = (ytdl.vcodec && ytdl.vcodec !== 'none') || (ytdl.ext === 'mp4');
        return {
          platform: 'instagram',
          type: isVideo ? 'video' : 'photo',
          title: ytdl.description || ytdl.title || 'Instagram Post',
          author: ytdl.uploader || 'Instagram User',
          videoUrl: isVideo ? streamUrl : null,
          photoUrl: !isVideo ? streamUrl : null,
          cover: ytdl.thumbnail
        };
      }
    }
  }

  // Second attempt: Public API
  try {
    const apiUrl = `https://api.vkrdownloader.com/server?vkr=${encodeURIComponent(url)}`;
    const res = await fetch(apiUrl, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const data = await res.json();
    if (data && data.data && data.data.downloads) {
      const dls = data.data.downloads;
      const vid = dls.find(d => d.format_id && d.format_id.includes('mp4')) || dls[0];
      if (vid && vid.url) {
        return {
          platform: 'instagram',
          type: 'video',
          title: data.data.title || 'Instagram Reel',
          author: data.data.source || 'Instagram',
          videoUrl: vid.url
        };
      }
    }
  } catch (err) {
    console.error('VKR Instagram error:', err.message);
  }

  return null;
}

// 4. YouTube Downloader (Shorts & Videos)
async function downloadYouTube(url) {
  // First attempt: yt-dlp with direct extraction
  const ytdl = await runYtDlpJson(url);
  if (ytdl) {
    const streamUrl = extractStreamUrl(ytdl);
    if (streamUrl) {
      return {
        platform: 'youtube',
        type: 'video',
        title: ytdl.title || 'YouTube Video',
        author: ytdl.uploader || 'YouTube Channel',
        videoUrl: streamUrl,
        cover: ytdl.thumbnail,
        duration: ytdl.duration
      };
    }
  }

  // Second attempt: Invidious API
  try {
    let videoId = null;
    const m1 = url.match(/(?:watch\?v=|shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    if (m1) videoId = m1[1];

    if (videoId) {
      const inviousInstances = [
        'https://inv.nadeko.net',
        'https://invidious.nerdvpn.de',
        'https://yewtu.be'
      ];

      for (const instance of inviousInstances) {
        try {
          const res = await fetch(`${instance}/api/v1/videos/${videoId}`, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
            signal: AbortSignal.timeout(6000)
          });
          const data = await res.json();
          if (data && data.formatStreams && data.formatStreams.length > 0) {
            // Find 720p or 360p video
            const stream = data.formatStreams.find(s => s.resolution === '720p') || data.formatStreams[0];
            return {
              platform: 'youtube',
              type: 'video',
              title: data.title || 'YouTube Video',
              author: data.author || 'YouTube Channel',
              videoUrl: stream.url,
              cover: data.videoThumbnails ? data.videoThumbnails[0].url : null
            };
          }
        } catch (e) {
          continue;
        }
      }
    }
  } catch (err) {
    console.error('YouTube Invidious error:', err.message);
  }

  return null;
}

// 5. Pinterest Downloader
async function downloadPinterest(url) {
  const ytdl = await runYtDlpJson(url);
  if (ytdl && ytdl.url) {
    const isVideo = ytdl.vcodec && ytdl.vcodec !== 'none';
    return {
      platform: 'pinterest',
      type: isVideo ? 'video' : 'photo',
      title: ytdl.title || 'Pinterest Media',
      author: ytdl.uploader || 'Pinterest',
      videoUrl: isVideo ? ytdl.url : null,
      photoUrl: !isVideo ? ytdl.url : null,
      cover: ytdl.thumbnail
    };
  }
  return null;
}

// Generic Dispatcher
async function downloadMedia(url) {
  const cleanUrl = url.trim();

  if (/(?:tiktok\.com|douyin\.com)/i.test(cleanUrl)) {
    return downloadTikTok(cleanUrl);
  }
  if (/(?:twitter\.com|x\.com)/i.test(cleanUrl)) {
    return downloadTwitter(cleanUrl);
  }
  if (/(?:instagram\.com)/i.test(cleanUrl)) {
    return downloadInstagram(cleanUrl);
  }
  if (/(?:youtube\.com|youtu\.be)/i.test(cleanUrl)) {
    return downloadYouTube(cleanUrl);
  }
  if (/(?:pinterest\.com|pin\.it)/i.test(cleanUrl)) {
    return downloadPinterest(cleanUrl);
  }

  // Generic fallback with yt-dlp
  const ytdl = await runYtDlpJson(cleanUrl);
  if (ytdl && ytdl.url) {
    const isVideo = ytdl.vcodec && ytdl.vcodec !== 'none';
    return {
      platform: 'generic',
      type: isVideo ? 'video' : 'photo',
      title: ytdl.title || 'Downloaded Media',
      author: ytdl.uploader || 'Web',
      videoUrl: isVideo ? ytdl.url : null,
      photoUrl: !isVideo ? ytdl.url : null,
      cover: ytdl.thumbnail
    };
  }

  return null;
}

module.exports = {
  downloadMedia,
  downloadTikTok,
  downloadTwitter,
  downloadInstagram,
  downloadYouTube,
  downloadPinterest
};
