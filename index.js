const express = require("express");
const app = express();
const axios = require("axios"); // قم بتثبيت هذه المكتبة: npm install axios
const dns = require('dns');     // هذه وحدة مضمنة في Node.js لعمليات بحث DNS

const PORT = process.env.PORT || 3000;

// عناوين URL المستهدفة
const SAFE_PAGE = "https://treesaudia.wixstudio.com/website/blank-4"; // صفحة آمنة للروبوتات
const GRAY_PAGE = "https://treesaudia.wixstudio.com/website";       // صفحة رمادية للزوار الحقيقيين

// قائمة موسعة بالكلمات المفتاحية للروبوتات الشائعة، وبرامج الزحف، وخدمات المراقبة
const BOT_KEYWORDS = [
  "adsbot", "googlebot", "mediapartners-google", "bingbot", "yandexbot", "baiduspider",
  "crawler", "spider", "render", "wget", "curl", "python-requests", "node-fetch",
  "monitor", "uptimerobot", "pingdom", "gtmetrix", "lighthouse",
  "facebookexternalhit", "slackbot", "telegrambot", "discordbot", "preview",
  "ahrefsbot", "semrushbot", "mj12bot", "dotbot", "petalbot", "rogerbot", "exabot",
  "sitecheckerbot", "screaming frog", "netcraftsurvey", "prerender", "headlesschrome" // تمت إضافة مؤشرات المتصفحات بلا رأس
];

// دالة مساعدة لإجراء بحث DNS العكسي للتحقق من Googlebot
async function isGooglebotIP(ip) {
  return new Promise(resolve => {
    // حاول فقط إجراء بحث DNS العكسي لـ IPv4، DNS العكسي لـ IPv6 مختلف
    if (!ip || !ip.includes('.')) { // تحقق أساسي لـ IPv4
        return resolve(false);
    }
    // محاولة تطبيع عناوين IPv6 إذا لزم الأمر، ولكن للتبسيط ركز على روبوتات IPv4 الشائعة
    const parts = ip.split(':');
    const actualIp = parts[parts.length - 1]; // احصل على الجزء الأخير إذا كان IPv6 مع منفذ

    dns.reverse(actualIp, (err, hostnames) => {
      if (err) {
        // console.error(`خطأ في DNS العكسي لـ ${actualIp}:`, err.message);
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
  // احصل على عنوان IP الأكثر موثوقية، مع الأخذ في الاعتبار الخوادم الوكيلة (x-forwarded-for)
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || "";

  // 1. فحص سلسلة وكيل المستخدم
  const isUserAgentBot = BOT_KEYWORDS.some(bot => ua.includes(bot));
  if (isUserAgentBot) return true;

  // 2. بحث DNS العكسي عن Googlebot (مؤشر قوي لـ Google)
  // هذه الدالة غير متزامنة، لذا انتظر نتيجتها.
  const isReverseDNSGoogle = await isGooglebotIP(ip);
  if (isReverseDNSGoogle) return true;

  // يمكنك إضافة المزيد من الفحوصات هنا، على سبيل المثال، فقدان رؤوس المتصفح الشائعة،
  // أو أنماط مشبوهة أخرى. كن حذرًا لعدم حظر المستخدمين الشرعيين.

  return false; // لم يتم الكشف عنه كروبوت بهذه الطرق
}

// دالة بسيطة للتحقق من تلميحات أخرى (مثل الزوار من معاينات Facebook أو Telegram)
function isSuspiciousTraffic(req) {
  const referer = (req.headers['referer'] || "").toLowerCase();
  // غالبًا ما تستخدم هذه من قبل روبوتات معاينة وسائل التواصل الاجتماعي أو ماسحات الروابط.
  return referer.includes("facebook.com") || referer.includes("t.co") || referer.includes("telegram");
}

// دالة لجلب المحتوى من عنوان URL مستهدف وتوجيهه إلى الاستجابة
async function proxyContent(targetUrl, req, res) {
  try {
    const headersToForward = {
      'User-Agent': req.headers['user-agent'],
      'Accept': req.headers['accept'],
      'Accept-Encoding': req.headers['accept-encoding'],
      'Accept-Language': req.headers['accept-language'],
      'Cookie': req.headers['cookie'] // قم بإعادة توجيه ملفات تعريف الارتباط إذا لزم الأمر، ولكن كن حذرًا بشأن الخصوصية
    };

    const response = await axios.get(targetUrl, {
      responseType: 'stream',
      headers: headersToForward, // قم بإعادة توجيه الرؤوس ذات الصلة إلى الهدف
      maxRedirects: 0 // منع axios من اتباع تحويلات المسار بنفسه
    });

    // انسخ الرؤوس الأساسية من استجابة الهدف إلى استجابتك
    for (const key in response.headers) {
      const value = response.headers[key];
      // استبعد رؤوس النقل التي لا تتعلق باستجابة العميل
      if (!['connection', 'keep-alive', 'proxy-authenticate', 'proxy-authorization', 'te', 'trailers', 'transfer-encoding', 'upgrade', 'host'].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    // قم بتعيين رمز حالة مناسب (على سبيل المثال، 200 OK)
    res.status(response.status);

    // قم بتوجيه البيانات مباشرة إلى الاستجابة
    response.data.pipe(res);
  } catch (error) {
    console.error(`خطأ في وكالة المحتوى من ${targetUrl}:`, error.message);
    if (error.response) {
        res.status(error.response.status).send(`خطأ: تعذر تحميل المحتوى من ${targetUrl}`);
    } else {
        res.status(500).send("خطأ في تحميل الصفحة.");
    }
  }
}

app.get("/", async (req, res) => {
  const ua = req.headers['user-agent'] || "no-agent";
  const ip = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress || "no-ip";

  console.log(`[${new Date().toISOString()}] وكيل المستخدم: ${ua} | IP: ${ip}`);

  // قم بإدخال تأخير عشوائي لمحاكاة سلوك التصفح البشري،
  // ولكن اجعله قصيرًا بما يكفي لعدم التسبب في انتهاء المهلة لبرامج الزحف الشرعية.
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

// بدء الخادم
app.listen(PORT, () => {
  console.log(`🚀 الخادم يعمل على المنفذ ${PORT}`);
});
