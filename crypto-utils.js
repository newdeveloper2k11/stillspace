const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

require("dotenv").config({ path: path.join(__dirname, ".env") });

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;

function getOrCreateKey() {
  const envPath = path.join(__dirname, ".env");

  if (process.env.ENCRYPTION_KEY) {
    const keyBuffer = Buffer.from(process.env.ENCRYPTION_KEY, "hex");
    if (keyBuffer.length === 32) {
      return keyBuffer;
    }
  }

  const key = crypto.randomBytes(32);
  const envContent = `ENCRYPTION_KEY=${key.toString("hex")}\n`;

  try {
    fs.writeFileSync(envPath, envContent, { flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") {
      require("dotenv").config({ path: envPath });
      if (process.env.ENCRYPTION_KEY) {
        return Buffer.from(process.env.ENCRYPTION_KEY, "hex");
      }
    }
  }

  process.env.ENCRYPTION_KEY = key.toString("hex");
  return key;
}

let encryptionKey = null;

function ensureKey() {
  if (!encryptionKey) {
    encryptionKey = getOrCreateKey();
  }

  return encryptionKey;
}

function encrypt(plaintext) {
  const key = ensureKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(String(plaintext), "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();
  return `${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

function decrypt(payload) {
  const key = ensureKey();
  const parts = String(payload).split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format");
  }

  const iv = Buffer.from(parts[0], "hex");
  const tag = Buffer.from(parts[1], "hex");
  const encrypted = parts[2];

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  let decrypted = decipher.update(encrypted, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

function hashIdentifier(value) {
  const key = ensureKey();
  return crypto.createHmac("sha256", key).update(String(value)).digest("hex");
}

module.exports = { encrypt, decrypt, ensureKey, hashIdentifier };
