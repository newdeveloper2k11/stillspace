const {
  verifyGoogleToken,
  issueSessionToken,
  getSessionFromRequest,
  createSessionCookieHeader,
  createClearedSessionCookieHeader,
  isAdmin,
} = require("../../auth");

function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  };
}

function addSecureAttribute(cookieHeader) {
  if (cookieHeader.includes("Secure")) {
    return cookieHeader;
  }

  return `${cookieHeader}; Secure`;
}

function getSessionUser(event) {
  const session = getSessionFromRequest({
    headers: {
      cookie: event.headers.cookie || event.headers.Cookie || "",
    },
  });

  if (!session) {
    return null;
  }

  return {
    id: session.userId,
    email: session.email,
    role: session.role,
    name: session.name || session.email.split("@")[0],
    picture: session.picture || "",
  };
}

async function signInFromGoogleCredential(credential) {
  const googleUser = await verifyGoogleToken(credential);
  const user = {
    id: googleUser.googleId,
    email: googleUser.email,
    role: isAdmin(googleUser.email) ? "admin" : "member",
    name: googleUser.name,
    picture: googleUser.picture,
  };
  const token = issueSessionToken(user);

  return {
    user,
    cookieHeader: addSecureAttribute(createSessionCookieHeader(token)),
  };
}

module.exports = {
  json,
  getSessionUser,
  signInFromGoogleCredential,
  createClearedSessionCookieHeader: () => addSecureAttribute(createClearedSessionCookieHeader()),
};
