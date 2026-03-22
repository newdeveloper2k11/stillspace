const http = require("http");
const fs = require("fs");
const path = require("path");
const { insertSession, getAllSessions, getStats, closeDatabase } = require("./database");

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

async function handleApiRequest(request, response) {
  const url = request.url.split("?")[0];

  // POST /api/sessions
  if (request.method === "POST" && url === "/api/sessions") {
    try {
      const rawBody = await readBody(request);
      const { duration, completed } = JSON.parse(rawBody);

      if (typeof duration !== "number" || typeof completed !== "number") {
        sendJson(response, 400, { error: "duration and completed must be numbers" });
        return;
      }

      const result = insertSession(duration, completed);
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

const server = http.createServer(async (request, response) => {
  const requestPath = request.url.split("?")[0];

  // Route API requests
  if (requestPath.startsWith("/api/")) {
    await handleApiRequest(request, response);
    return;
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
});

process.on("SIGINT", () => {
  closeDatabase();
  process.exit(0);
});

process.on("SIGTERM", () => {
  closeDatabase();
  process.exit(0);
});
