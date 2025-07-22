const express = require("express");
const app = express();
const axios = require("axios");
const dns = require('dns');
const requestIp = require('request-ip');
const geoip = require('geoip-lite'); // إضافة مكتبة GeoIP

// --- إعدادات التهيئة ---
const PORT = process.env.PORT || 3000;

// عناوين URL المستهدفة.
const SAFE_PAGE = process.env.SAFE_PAGE || "https://treesaudia.wixstudio.com/website/blank-4"; // لباقي الدول والروبوتات
const GRAY_PAGE = process.env.GRAY_PAGE || "https://treesaudia.wixstudio.com/website";       // للإمارات فقط

// كود دولة الإمارات
const UAE_COUNTRY_CODE = "AE";

// --- دوال الكشف عن الروبوتات (يمكننا تبسيطها الآن لأن كل شيء خارج الإمارات سيكون safe_page) ---

// لن نحتاج لإجراء فحص معقد للروبوتات لأننا سنعتمد على GeoIP
// ولكن يمكن الاحتفاظ بها كطبقة إضافية إذا أردت التأكد من أن الزائر ليس روبوتًا حتى داخل الإمارات
async function isBot(req) {
  const ua = (req.headers['user-agent'] || "").toLowerCase();
  // قائمة الكلمات المفتاحية للروبوتات، يمكنك تخصيصها إذا كنت تريد حظر أنواع معينة من الروبوتات
  // حتى داخل الإمارات
  const BOT_KEYWORDS = [
    "adsbot", "googlebot", "mediapartners-google", "bingbot", "yandexbot", "baiduspider",
    "crawler", "spider", "render", "wget", "curl", "python-requests", "node-fetch",
    "monitor", "uptimerobot", "pingdom", "gtmetrix", "lighthouse",
    "facebookexternalhit", "slackbot", "telegrambot", "discordbot", "preview",
    "ahrefsbot", "semrushbot", "mj12bot", "dotbot", "petalbot", "rogerbot", "exabot",
    "sitecheckerbot", "screaming frog", "netcraftsurvey", "prerender", "headlesschrome",
    "bot", "scanner", "analyzer", "validator", "parser", "scraper"
  ];

  return BOT_KEYWORDS.some(bot => ua.includes(bot));
}


// دالة الوكيل (Proxy) تبقى كما هي
async function proxyContent(targetUrl, req, res) {
  try {
    const headersToForward = {
      'User-Agent': req.headers['user-agent'],
      'Accept': req.headers['accept'],
      'Accept-Encoding': req.headers['accept-encoding'],
      'Accept-Language': req.headers['accept-language'],
    };

    const axiosConfig = {
      method: req.method,
      url: targetUrl + req.url,
      responseType: 'stream',
      headers: headersToForward,
      validateStatus: status => true
    };

    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      axiosConfig.data = req.body;
    }

    const response = await axios(axiosConfig);

    for (const key in response.headers) {
      const value = response.headers[key];
      if (!['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    res.status(response.status);
    response.data.pipe(res);

  } catch (error) {
    console.error(`Error proxying content from ${targetUrl}:`, error.message);
    if (error.response) {
        res.status(error.response.status).send(`Error: Could not load content from ${targetUrl}`);
    } else {
        res.status(500).send("Error loading page. Please try again later.");
    }
  }
}

// --- إعدادات Express Middleware ---

app.use(requestIp.mw());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- مسار معالجة الطلبات ---

app.all("*", async (req, res) => {
  const ua = req.headers['user-agent'] || "no-agent";
  const ip = req.ip || "no-ip";
  const method = req.method;
  const path = req.originalUrl;

  console.log(`[${new Date().toISOString()}] Method: ${method} | Path: ${path} | User-Agent: ${ua} | IP: ${ip}`);

  await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 500) + 100));

  // تحديد الموقع الجغرافي
  const geo = geoip.lookup(ip);
  const countryCode = geo ? geo.country : null;

  // فحص ما إذا كان IP من الإمارات
  const isFromUAE = countryCode === UAE_COUNTRY_CODE;

  // فحص ما إذا كان الزائر روبوتًا (هذا الفحص يمكن استخدامه لـ *تحديد* أي روبوت حتى داخل الإمارات)
  const isDetectedBot = await isBot(req);

  if (isFromUAE && !isDetectedBot) { // إذا كان من الإمارات ولم يتم الكشف عنه كروبوت
    console.log("👤 مستخدم بشري من الإمارات - وكالة صفحة GRAY");
    await proxyContent(GRAY_PAGE, req, res);
  } else { // إذا لم يكن من الإمارات (بما في ذلك روبوتات جوجل والفاحصين) أو كان روبوتًا حتى داخل الإمارات
    console.log("🛡️ غير من الإمارات أو روبوت - وكالة صفحة SAFE");
    await proxyContent(SAFE_PAGE, req, res);
  }
});

// --- بدء الخادم ---
app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
  console.log(`صفحة الإمارات (GRAY_PAGE): ${GRAY_PAGE}`);
  console.log(`صفحة باقي الدول/الروبوتات (SAFE_PAGE): ${SAFE_PAGE}`);
  console.log("تحذير: هذا الإعداد يستخدم التحديد الجغرافي وقد يؤدي إلى مخالفة سياسات جوجل للـ 'Cloaking' بشكل مباشر.");
});
