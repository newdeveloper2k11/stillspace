const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const https = require("https");
const jwt = require("jsonwebtoken");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const COOKIE_NAME = "stillspace_session";
const TOKEN_EXPIRY = "7d";
const DEFAULT_ADMIN_EMAIL = "votrongnhan632@gmail.com";

function getJwtSecret() {
  if (process.env.JWT_SECRET) {
    return process.env.JWT_SECRET;
  }

  if (process.env.NETLIFY || process.env.URL) {
    const stableSeed = process.env.GOOGLE_CLIENT_ID || "stillspace-netlify";
    const derivedSecret = crypto
      .createHash("sha256")
      .update(`${stableSeed}:vtn-meditation-session`)
      .digest("hex");

    process.env.JWT_SECRET = derivedSecret;
    return derivedSecret;
  }

  const secret = crypto.randomBytes(48).toString("hex");
  const envPath = path.join(__dirname, ".env");

  try {
    fs.appendFileSync(envPath, `JWT_SECRET=${secret}\n`);
  } catch {
    // .env may not be writable — fall back to in-memory
  }

  process.env.JWT_SECRET = secret;
  return secret;
}

function verifyGoogleToken(idToken) {
  return new Promise((resolve, reject) => {
    const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;

    https.get(url, (response) => {
      let body = "";
      response.on("data", (chunk) => { body += chunk; });
      response.on("end", () => {
        try {
          const payload = JSON.parse(body);

          if (payload.error_description) {
            reject(new Error(payload.error_description));
            return;
          }

          const expectedClientId = process.env.GOOGLE_CLIENT_ID;
          if (expectedClientId && payload.aud !== expectedClientId) {
            reject(new Error("Token audience mismatch"));
            return;
          }

          resolve({
            googleId: payload.sub,
            email: payload.email,
            name: payload.name || payload.email.split("@")[0],
            picture: payload.picture || "",
          });
        } catch (error) {
          reject(error);
        }
      });
    }).on("error", reject);
  });
}

function issueSessionToken(user) {
  const secret = getJwtSecret();

  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      picture: user.picture || "",
    },
    secret,
    { expiresIn: TOKEN_EXPIRY }
  );
}

function verifySessionToken(token) {
  const secret = getJwtSecret();

  try {
    return jwt.verify(token, secret);
  } catch {
    return null;
  }
}

function parseCookie(request) {
  const header = request.headers.cookie || "";
  const cookies = {};

  header.split(";").forEach((pair) => {
    const [key, ...rest] = pair.trim().split("=");
    if (key) {
      cookies[key] = rest.join("=");
    }
  });

  return cookies;
}

function getSessionFromRequest(request) {
  const cookies = parseCookie(request);
  const token = cookies[COOKIE_NAME];

  if (!token) {
    return null;
  }

  return verifySessionToken(token);
}

function createSessionCookieHeader(token) {
  return `${COOKIE_NAME}=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${7 * 24 * 60 * 60}`;
}

function createClearedSessionCookieHeader() {
  return `${COOKIE_NAME}=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0`;
}

function setSessionCookie(response, token) {
  response.setHeader("Set-Cookie", [
    createSessionCookieHeader(token),
  ]);
}

function clearSessionCookie(response) {
  response.setHeader("Set-Cookie", [
    createClearedSessionCookieHeader(),
  ]);
}

function isAdmin(email) {
  const adminEmail = process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL;
  if (!adminEmail) {
    return false;
  }

  return email.toLowerCase() === adminEmail.toLowerCase();
}

module.exports = {
  verifyGoogleToken,
  issueSessionToken,
  getSessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
  createSessionCookieHeader,
  createClearedSessionCookieHeader,
  isAdmin,
  COOKIE_NAME,
  verifySessionToken,
};
