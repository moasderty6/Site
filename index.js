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

// --- دوال الكشف عن الروبوتات ---

async function isBot(req) {
  const ua = (req.headers['user-agent'] || "").toLowerCase();
  const ip = req.ip;

  // سجل الـ User-Agent عشان نشوفه
  console.log(`[DEBUG] isBot check: User-Agent = ${ua}`);

  // 1. فحص شامل لوكيل المستخدم لأي كلمة مفتاحية تدل على روبوت
  const isUserAgentBot = BOT_KEYWORDS.some(bot => ua.includes(bot));
  if (isUserAgentBot) {
    console.log(`[DEBUG] isBot detected: By User-Agent keyword (${ua})`);
    return true; // أي روبوت تم الكشف عنه بواسطة User-Agent
  }

  // 2. فحص الرؤوس المشتركة (مؤشر ضعيف، ولكن يمكن استخدامه كطبقة إضافية)
  const commonHeadersPresent = (
    req.headers['accept'] &&
    req.headers['accept-language'] &&
    req.headers['accept-encoding']
  );
  if (!commonHeadersPresent) {
    console.log(`[DEBUG] isBot detected: Missing common headers. Accept: ${!!req.headers['accept']}, Language: ${!!req.headers['accept-language']}, Encoding: ${!!req.headers['accept-encoding']}`);
    return true;
  }
  
  // نضيف طبقة DNS العكسي عشان لو في روبوتات متخفية
  // (ده كان موجود في النسخ اللي فاتت، ممكن يكون له استخدام هنا برضه)
  const isGoogleRelated = await isGoogleRelatedIP(ip); // دالة isGoogleRelatedIP من الكود السابق
  if (isGoogleRelated) {
    console.log(`[DEBUG] isBot detected: IP is Google-related (${ip})`);
    return true;
  }

  console.log(`[DEBUG] isBot: No bot detected for UA: ${ua}, IP: ${ip}`);
  return false; // لم يتم الكشف عنه كروبوت بهذه الطرق
}

// دالة isGoogleRelatedIP (نقلها من مكانها الأصلي لو كانت موجودة في مكان تاني)
async function isGoogleRelatedIP(ip) {
  return new Promise(resolve => {
    if (!ip) return resolve(false);
    dns.reverse(ip, (err, hostnames) => {
      if (err) {
        return resolve(false);
      }
      const isGoogle = hostnames.some(hostname =>
        hostname.endsWith('.googlebot.com') ||
        hostname.endsWith('.google.com') ||
        hostname.endsWith('.googleusercontent.com')
      );
      resolve(isGoogle);
    });
  });
}


// دالة الوكيل (Proxy)
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

  console.log(`[DEBUG] GeoIP lookup result: IP=${ip}, Country Code=${countryCode}`);

  // فحص ما إذا كان IP من الإمارات
  const isFromUAE = countryCode === UAE_COUNTRY_CODE;

  // فحص ما إذا كان الزائر روبوتًا
  const isDetectedBot = await isBot(req); // استخدم الدالة المحدثة مع الـ logs

  if (isFromUAE && !isDetectedBot) { // إذا كان من الإمارات ولم يتم الكشف عنه كروبوت
    console.log("👤 مستخدم بشري من الإمارات - وكالة صفحة GRAY");
    await proxyContent(GRAY_PAGE, req, res);
  } else { // إذا لم يكن من الإمارات أو كان روبوتًا حتى داخل الإمارات
    console.log("🛡️ غير من الإمارات أو روبوت - وكالة صفحة SAFE");
    await proxyContent(SAFE_PAGE, req, res);
  }
});

// --- بدء الخادم ---
app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
  console.log(`صفحة الإمارات (GRAY_PAGE): ${GRAY_PAGE}`);
  console.log(`صفحة باقي الدول/الروبوتات (SAFE_PAGE): ${SAFE_PAGE}`);
  console.log("تذكر: هذا الإعداد قد يؤدي إلى مخالفة سياسات جوجل للـ 'Cloaking'.");
});
