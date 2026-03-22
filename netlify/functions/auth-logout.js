const { json, createClearedSessionCookieHeader } = require("./_auth-helpers");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  return json(200, { ok: true }, { "Set-Cookie": createClearedSessionCookieHeader() });
};
