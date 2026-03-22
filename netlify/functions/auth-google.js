const { json, signInFromGoogleCredential } = require("./_auth-helpers");

exports.handler = async function handler(event) {
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method not allowed" });
  }

  try {
    const { credential } = JSON.parse(event.body || "{}");

    if (!credential) {
      return json(400, { error: "Missing credential" });
    }

    const { user, cookieHeader } = await signInFromGoogleCredential(credential);
    return json(200, { ok: true, user }, { "Set-Cookie": cookieHeader });
  } catch (error) {
    return json(401, { error: "Authentication failed" });
  }
};
