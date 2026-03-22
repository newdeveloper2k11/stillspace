const http = require("http");
const fs = require("fs");
const path = require("path");
const {
  insertSession,
  getAllSessions,
  getStats,
  findOrCreateUser,
  getUserById,
  getAllUsers,
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

async function handleAuthRoutes(request, response, url) {
  // POST /api/auth/google
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
      sendJson(response, 200, {
        ok: true,
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          picture: user.picture,
          role: user.role,
        },
      });
    } catch (error) {
      console.error("Auth error:", error.message);
      sendJson(response, 401, { error: "Authentication failed" });
    }
    return true;
  }

  // GET /api/auth/me
  if (request.method === "GET" && url === "/api/auth/me") {
    const session = getSessionFromRequest(request);

    if (!session) {
      sendJson(response, 401, { error: "Not authenticated" });
      return true;
    }

    const user = getUserById(session.userId);

    if (!user) {
      clearSessionCookie(response);
      sendJson(response, 401, { error: "User not found" });
      return true;
    }

    sendJson(response, 200, { user });
    return true;
  }

  // POST /api/auth/logout
  if (request.method === "POST" && url === "/api/auth/logout") {
    clearSessionCookie(response);
    sendJson(response, 200, { ok: true });
    return true;
  }

  // GET /api/auth/config (public — returns client ID for frontend)
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

  // Auth routes
  if (url.startsWith("/api/auth/")) {
    const handled = await handleAuthRoutes(request, response, url);
    if (handled) return;
  }

  // GET /api/admin/users (admin only)
  if (request.method === "GET" && url === "/api/admin/users") {
    const session = getSessionFromRequest(request);
    if (!session || session.role !== "admin") {
      sendJson(response, 403, { error: "Admin access required" });
      return;
    }

    const users = getAllUsers();
    sendJson(response, 200, { users });
    return;
  }

  // POST /api/sessions
  if (request.method === "POST" && url === "/api/sessions") {
    try {
      const rawBody = await readBody(request);
      const { duration, completed } = JSON.parse(rawBody);

      if (typeof duration !== "number" || typeof completed !== "number") {
        sendJson(response, 400, { error: "duration and completed must be numbers" });
        return;
      }

      const session = getSessionFromRequest(request);
      const userId = session ? session.userId : null;

      const result = insertSession(duration, completed, userId);
      sendJson(response, 201, { ok: true, id: result.id });
    } catch (error) {
      sendJson(response, 500, { error: "Failed to save session" });
    }
    return;
  }

  // GET /api/sessions
  if (request.method === "GET" && url === "/api/sessions") {
    try {
      const sessions = getAllSessions();
      sendJson(response, 200, { sessions });
    } catch (error) {
      sendJson(response, 500, { error: "Failed to retrieve sessions" });
    }
    return;
  }

  // GET /api/stats
  if (request.method === "GET" && url === "/api/stats") {
    try {
      const stats = getStats();
      sendJson(response, 200, stats);
    } catch (error) {
      sendJson(response, 500, { error: "Failed to retrieve stats" });
    }
    return;
  }

  sendJson(response, 404, { error: "API route not found" });
}

const publicPaths = ["/login.html", "/login.css"];

const server = http.createServer(async (request, response) => {
  const requestPath = request.url.split("?")[0];

  // Route API requests
  if (requestPath.startsWith("/api/")) {
    await handleApiRequest(request, response);
    return;
  }

  // Allow login page and its assets without auth
  const isPublicPath = publicPaths.some((p) => requestPath === p)
    || requestPath.endsWith(".css")
    || requestPath.endsWith(".js")
    || requestPath.endsWith(".png")
    || requestPath.endsWith(".jpg")
    || requestPath.endsWith(".svg")
    || requestPath.endsWith(".ico");

  // Redirect unauthenticated users to login (HTML pages only)
  if (!isPublicPath && requestPath !== "/login.html") {
    const session = getSessionFromRequest(request);

    if (!session) {
      redirect(response, "/login.html");
      return;
    }
  }

  // Serve static files
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
  console.log("Database ready — session data is encrypted at rest.");

  if (!process.env.GOOGLE_CLIENT_ID) {
    console.log("\n⚠  GOOGLE_CLIENT_ID not set in .env");
    console.log("   Google login will not work until you add it.");
    console.log("   See .env.example for instructions.\n");
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
