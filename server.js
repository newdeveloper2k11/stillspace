const http = require("http");
const fs = require("fs");
const path = require("path");

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

const server = http.createServer((request, response) => {
  const requestPath = resolveRequestPath(request.url.split("?")[0]);

  fs.readFile(requestPath, (error, data) => {
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

    const extension = path.extname(requestPath).toLowerCase();
    response.writeHead(200, {
      "Content-Type": mimeTypes[extension] || "application/octet-stream",
    });
    response.end(data);
  });
});

server.listen(port, host, () => {
  console.log(`Stillspace running at http://${host}:${port}`);
});
