const express = require("express");
const app = express();
const axios = require("axios"); // تأكد من تثبيته: npm install axios
const dns = require('dns');     // هذه وحدة مضمنة في Node.js
const requestIp = require('request-ip'); // قم بتثبيت هذه المكتبة: npm install request-ip

// --- إعدادات التهيئة ---
// يمكنك نقل هذه إلى ملف .env أو ملف config.js لمرونة أفضل
const PORT = process.env.PORT || 3000;

// عناوين URL المستهدفة. يمكن تعيينها كمتغيرات بيئة.
const SAFE_PAGE = process.env.SAFE_PAGE || "https://treesaudia.wixstudio.com/website/blank-4"; // صفحة آمنة للروبوتات
const GRAY_PAGE = process.env.GRAY_PAGE || "https://treesaudia.wixstudio.com/website";       // صفحة رمادية للزوار الحقيقيين

// قائمة موسعة بالكلمات المفتاحية للروبوتات الشائعة، وبرامج الزحف، وخدمات المراقبة
const BOT_KEYWORDS = [
  "adsbot", "googlebot", "mediapartners-google", "bingbot", "yandexbot", "baiduspider",
  "crawler", "spider", "render", "wget", "curl", "python-requests", "node-fetch",
  "monitor", "uptimerobot", "pingdom", "gtmetrix", "lighthouse",
  "facebookexternalhit", "slackbot", "telegrambot", "discordbot", "preview",
  "ahrefsbot", "semrushbot", "mj12bot", "dotbot", "petalbot", "rogerbot", "exabot",
  "sitecheckerbot", "screaming frog", "netcraftsurvey", "prerender", "headlesschrome",
  "go-http-client", "okhttp", "urllib", "python", "java", "ruby", "perl", "php" // إضافة بعض اللغات الشائعة للمكتبات
];

// --- دوال الكشف عن الروبوتات ---

// دالة مساعدة لإجراء بحث DNS العكسي للتحقق من Googlebot
async function isGooglebotIP(ip) {
  return new Promise(resolve => {
    if (!ip) return resolve(false);

    // Node's dns.reverse يمكنها التعامل مع IPv4 و IPv6.
    // للتحقق الدقيق من Googlebot، نحتاج إلى التأكد من أن بحث DNS العكسي يطابق
    // نطاق googlebot.com أو google.com (لخدمات Google).
    dns.reverse(ip, (err, hostnames) => {
      if (err) {
        // console.error(`Reverse DNS error for ${ip}:`, err.message); // قم بإلغاء التعليق للتصحيح
        return resolve(false);
      }
      const isGoogle = hostnames.some(hostname =>
        hostname.endsWith('.googlebot.com') || hostname.endsWith('.google.com')
      );
      resolve(isGoogle);
    });
  });
}

// دالة لتحديد ما إذا كان الزائر روبوتًا
async function isBot(req) {
  const ua = (req.headers['user-agent'] || "").toLowerCase();
  const ip = req.ip; // استخدم IP الذي تم الحصول عليه بواسطة request-ip

  // 1. فحص سلسلة وكيل المستخدم (User-Agent)
  const isUserAgentBot = BOT_KEYWORDS.some(bot => ua.includes(bot));
  if (isUserAgentBot) return true;

  // 2. بحث DNS العكسي عن Googlebot (مؤشر قوي لـ Google)
  const isReverseDNSGoogle = await isGooglebotIP(ip);
  if (isReverseDNSGoogle) return true;

  // 3. فحص الرؤوس المشتركة التي قد يفتقدها الروبوت (مثل المتصفحات بلا رأس)
  // كن حذرًا هنا، قد يفتقر بعض المستخدمين الشرعيين إلى بعض هذه الرؤوس.
  // يمكن استخدام هذا كعلامة ثانوية.
  const commonHeadersPresent = (
    req.headers['accept'] &&
    req.headers['accept-language'] &&
    req.headers['accept-encoding']
  );
  if (isUserAgentBot === false && !commonHeadersPresent) {
    // console.log(`Potential bot: Missing common headers for IP: ${ip}, UA: ${ua}`); // قم بإلغاء التعليق للتصحيح
    // return true; // قم بإلغاء التعليق إذا كنت تريد أن يكون هذا مؤشراً قوياً جداً
  }

  return false; // لم يتم الكشف عنه كروبوت بهذه الطرق
}

// دالة بسيطة للتحقق من تلميحات أخرى (مثل الزوار من معاينات Facebook أو Telegram)
function isSuspiciousTraffic(req) {
  const referer = (req.headers['referer'] || "").toLowerCase();
  // غالبًا ما تستخدم هذه من قبل روبوتات معاينة وسائل التواصل الاجتماعي أو ماسحات الروابط.
  return referer.includes("facebook.com") || referer.includes("t.co") || referer.includes("telegram") || referer.includes("linkedin.com");
}

// --- دالة وكيل المحتوى (Proxy) ---

// دالة لجلب المحتوى من عنوان URL مستهدف وتوجيهه إلى الاستجابة
async function proxyContent(targetUrl, req, res) {
  try {
    // قم ببناء الرؤوس لتميرها إلى الخادم الهدف
    const headersToForward = {
      'User-Agent': req.headers['user-agent'],
      'Accept': req.headers['accept'],
      'Accept-Encoding': req.headers['accept-encoding'],
      'Accept-Language': req.headers['accept-language'],
      // 'Cookie': req.headers['cookie'] // قم بإزالة أو تصفية الكوكيز إذا لم تكن ضرورية
                                     // تمرير الكوكيز قد يؤدي إلى سلوك غير متوقع أو مشكلات خصوصية
    };

    // إعدادات axios للوكالة (Proxy)
    const axiosConfig = {
      method: req.method, // استخدم طريقة الطلب الأصلية (GET, POST, etc.)
      url: targetUrl + req.url, // قم بتمرير مسار URL الأصلي
      responseType: 'stream',   // للحصول على استجابة كـ stream
      headers: headersToForward, // الرؤوس التي سيتم تمريرها
      validateStatus: status => true // لا تلقي خطأ على رموز حالة HTTP غير الناجحة (مثل 404، 500)
    };

    // إذا كان الطلب يتضمن Body (مثل POST أو PUT)، قم بتضمينه
    if (req.method === 'POST' || req.method === 'PUT' || req.method === 'PATCH') {
      axiosConfig.data = req.body; // تأكد أن middleware لتحليل الـ body مُفعل
    }

    const response = await axios(axiosConfig);

    // انسخ الرؤوس الأساسية من استجابة الهدف إلى استجابتك
    for (const key in response.headers) {
      const value = response.headers[key];
      // استبعد رؤوس النقل التي لا تتعلق باستجابة العميل
      if (!['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    // قم بتعيين رمز حالة مناسب (على سبيل المثال، 200 OK، 404 Not Found، إلخ)
    res.status(response.status);

    // قم بتوجيه البيانات مباشرة إلى الاستجابة
    response.data.pipe(res);

  } catch (error) {
    console.error(`Error proxying content from ${targetUrl}:`, error.message);
    if (error.response) {
        // إذا كان هناك استجابة من الخادم الهدف، استخدم رمز الحالة الخاص بها
        res.status(error.response.status).send(`Error: Could not load content from ${targetUrl}`);
    } else {
        // خطأ عام في الشبكة أو axios
        res.status(500).send("Error loading page. Please try again later.");
    }
  }
}

// --- إعدادات Express Middleware ---

// Middleware لتحديد IP العميل بشكل موثوق (يدعم X-Forwarded-For و Cloudflare)
app.use(requestIp.mw());

// Middleware لتحليل JSON bodies (مهم لطلبات POST/PUT)
app.use(express.json());
// Middleware لتحليل URL-encoded bodies (مهم لطلبات POST/PUT من النماذج)
app.use(express.urlencoded({ extended: true }));

// --- مسار معالجة الطلبات ---

// استخدم '*' للتعامل مع جميع المسارات والطلبات القادمة إلى الخادم الخاص بك
app.all("*", async (req, res) => { // استخدم app.all للتعامل مع جميع طرق HTTP (GET, POST, PUT, DELETE, إلخ)
  const ua = req.headers['user-agent'] || "no-agent";
  const ip = req.ip || "no-ip"; // IP من request-ip middleware
  const method = req.method;
  const path = req.originalUrl;

  console.log(`[${new Date().toISOString()}] Method: ${method} | Path: ${path} | User-Agent: ${ua} | IP: ${ip}`);

  // قم بإدخال تأخير عشوائي لمحاكاة سلوك التصفح البشري.
  // اجعله قصيرًا بما يكفي لعدم التسبب في انتهاء المهلة لبرامج الزحف الشرعية.
  await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 500) + 100)); // بين 100 مللي ثانية و 600 مللي ثانية

  // حدد ما إذا كان روبوتًا أو حركة مرور مشبوهة
  const isDetectedBot = await isBot(req); // انتظر نتيجة الدالة غير المتزامنة
  const isDetectedSuspiciousTraffic = isSuspiciousTraffic(req);

  if (isDetectedBot || isDetectedSuspiciousTraffic) {
    console.log("🛡️ تم اكتشاف روبوت/حركة مرور مشبوهة - وكالة صفحة SAFE");
    await proxyContent(SAFE_PAGE, req, res); // وكالة الصفحة الآمنة
  } else {
    console.log("👤 مستخدم بشري - وكالة صفحة GRAY");
    await proxyContent(GRAY_PAGE, req, res); // وكالة الصفحة الرمادية
  }
});

// --- بدء الخادم ---
app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
  console.log(`صفحة الروبوتات (SAFE_PAGE): ${SAFE_PAGE}`);
  console.log(`صفحة الزوار (GRAY_PAGE): ${GRAY_PAGE}`);
});
