const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  insertSession,
  getAllSessions,
  getStats,
  findOrCreateUser,
  getUserById,
  getAdminOverview,
  closeDatabase,
} = require("./database");
const {
  verifyGoogleToken,
  issueSessionToken,
  getSessionFromRequest,
  setSessionCookie,
  clearSessionCookie,
} = require("./auth");

const port = process.env.PORT || 3000;
const host = "127.0.0.1";
const rootDir = __dirname;
const publicPagePaths = new Set(["/", "/index.html", "/login.html", "/login.css"]);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function resolveRequestPath(urlPath) {
  const cleanPath = urlPath === "/" ? "/index.html" : urlPath;
  const normalized = path.normalize(cleanPath).replace(/^(\.\.[\\/])+/, "");
  return path.join(rootDir, normalized);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    request.on("data", (chunk) => chunks.push(chunk));
    request.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, data) {
  const body = JSON.stringify(data);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
  });
  response.end(body);
}

function redirect(response, location) {
  response.writeHead(302, { Location: location });
  response.end();
}

function isStaticAsset(requestPath) {
  return [".css", ".js", ".png", ".jpg", ".jpeg", ".svg", ".ico"].some((extension) => requestPath.endsWith(extension));
}

function getAuthenticatedUser(request) {
  const session = getSessionFromRequest(request);
  if (!session) {
    return null;
  }

  const user = getUserById(session.userId);
  if (!user) {
    return null;
  }

  return user;
}

async function handleAuthRoutes(request, response, url) {
  if (request.method === "POST" && url === "/api/auth/google") {
    try {
      const rawBody = await readBody(request);
      const { credential } = JSON.parse(rawBody);

      if (!credential) {
        sendJson(response, 400, { error: "Missing credential" });
        return true;
      }

      const googleUser = await verifyGoogleToken(credential);
      const user = findOrCreateUser(googleUser);
      const token = issueSessionToken(user);

      setSessionCookie(response, token);
      sendJson(response, 200, { ok: true, user });
    } catch (error) {
      console.error("Auth error:", error.message);
      sendJson(response, 401, { error: "Authentication failed" });
    }
    return true;
  }

  if (request.method === "GET" && url === "/api/auth/me") {
    const user = getAuthenticatedUser(request);

    if (!user) {
      sendJson(response, 401, { error: "Not authenticated" });
      return true;
    }

    sendJson(response, 200, { user });
    return true;
  }

  if (request.method === "POST" && url === "/api/auth/logout") {
    clearSessionCookie(response);
    sendJson(response, 200, { ok: true });
    return true;
  }

  if (request.method === "GET" && url === "/api/auth/config") {
    sendJson(response, 200, {
      googleClientId: process.env.GOOGLE_CLIENT_ID || "",
    });
    return true;
  }

  return false;
}

async function handleApiRequest(request, response) {
  const url = request.url.split("?")[0];

  if (url.startsWith("/api/auth/")) {
    const handled = await handleAuthRoutes(request, response, url);
    if (handled) {
      return;
    }
  }

  const user = getAuthenticatedUser(request);

  if (request.method === "GET" && url === "/api/admin/overview") {
    if (!user || user.role !== "admin") {
      sendJson(response, 403, { error: "Admin access required" });
      return;
    }

    sendJson(response, 200, getAdminOverview());
    return;
  }

  if (request.method === "POST" && url === "/api/sessions") {
    if (!user) {
      sendJson(response, 401, { error: "Please sign in to save your sessions." });
      return;
    }

    try {
      const rawBody = await readBody(request);
      const { duration, completed } = JSON.parse(rawBody);

      if (typeof duration !== "number" || typeof completed !== "number") {
        sendJson(response, 400, { error: "duration and completed must be numbers" });
        return;
      }

      const result = insertSession(duration, completed, user.id);
      sendJson(response, 201, { ok: true, id: result.id });
    } catch (error) {
      sendJson(response, 500, { error: "Failed to save session" });
    }
    return;
  }

  if (request.method === "GET" && url === "/api/sessions") {
    if (!user) {
      sendJson(response, 401, { error: "Please sign in to view your session history." });
      return;
    }

    try {
      sendJson(response, 200, { sessions: getAllSessions(user.id, 24) });
    } catch (error) {
      sendJson(response, 500, { error: "Failed to retrieve sessions" });
    }
    return;
  }

  if (request.method === "GET" && url === "/api/stats") {
    if (!user) {
      sendJson(response, 401, { error: "Please sign in to view your practice stats." });
      return;
    }

    try {
      sendJson(response, 200, getStats(user.id));
    } catch (error) {
      sendJson(response, 500, { error: "Failed to retrieve stats" });
    }
    return;
  }

  sendJson(response, 404, { error: "API route not found" });
}

const server = http.createServer(async (request, response) => {
  const requestPath = request.url.split("?")[0];

  if (requestPath.startsWith("/api/")) {
    await handleApiRequest(request, response);
    return;
  }

  const user = getAuthenticatedUser(request);

  if (requestPath === "/admin.html") {
    if (!user) {
      redirect(response, "/login.html?mode=login");
      return;
    }

    if (user.role !== "admin") {
      redirect(response, "/");
      return;
    }
  }

  if (requestPath === "/login.html" && user) {
    redirect(response, user.role === "admin" ? "/admin.html" : "/");
    return;
  }

  const isPublic = publicPagePaths.has(requestPath) || isStaticAsset(requestPath);

  if (!isPublic && !user) {
    redirect(response, "/login.html?mode=login");
    return;
  }

  const filePath = resolveRequestPath(requestPath);

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (error.code === "ENOENT") {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }

      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("Server error");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
    });
    response.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`Stillspace running at http://${host}:${port}`);
  console.log("Database ready - session and user data are encrypted at rest.");

  if (!process.env.GOOGLE_CLIENT_ID) {
    console.log("\nWARNING: GOOGLE_CLIENT_ID not set in .env");
    console.log("Google login will not work until you add it.");
    console.log("See .env.example for setup.\n");
  }
});

process.on("SIGINT", () => {
  closeDatabase();
  process.exit(0);
});

process.on("SIGTERM", () => {
  closeDatabase();
  process.exit(0);
});
