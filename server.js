const http = require("http");
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const crypto = require("crypto");

const PORT = Number(process.env.PORT || 2965);
const ROOT_DIR = __dirname;
const PUBLIC_DIR = path.join(ROOT_DIR, "public");
const DATA_DIR = path.join(ROOT_DIR, "data");
const UPLOAD_DIR = path.join(ROOT_DIR, "uploads");
const STORE_FILE = path.join(DATA_DIR, "store.json");
const ADMIN_FILE = path.join(DATA_DIR, "admin.json");
const COOKIE_NAME = "ogs_session";
const MAX_JSON_BYTES = 80 * 1024;
const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;

const PRESET_ADMIN = {
  salt: "94e42efa834208b98efe7dfef957d1f4",
  hash: "44b27af5dba49174937d0f7a64294428402cdf2282a067e32fd9c10f85c0d715",
  iterations: 250000,
  keylen: 32,
  digest: "sha256"
};

const SESSION_SECRET = process.env.SESSION_SECRET || process.env.ADMIN_SESSION_SECRET || PRESET_ADMIN.hash;


const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".zip": "application/zip",
  ".7z": "application/x-7z-compressed",
  ".rar": "application/vnd.rar",
  ".exe": "application/vnd.microsoft.portable-executable",
  ".txt": "text/plain; charset=utf-8",
  ".pdf": "application/pdf"
};

function nowIso() {
  return new Date().toISOString();
}

function makeId(prefix = "id") {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString("hex")}`;
}

async function pathExists(filePath) {
  try {
    await fsp.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function ensureStorage() {
  await fsp.mkdir(DATA_DIR, { recursive: true });
  await fsp.mkdir(UPLOAD_DIR, { recursive: true });

  if (!(await pathExists(ADMIN_FILE))) {
    await writeJson(ADMIN_FILE, PRESET_ADMIN);
  }

  if (!(await pathExists(STORE_FILE))) {
    await writeJson(STORE_FILE, { items: [], comments: [] });
  }
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fsp.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJson(filePath, data) {
  const tempPath = `${filePath}.${crypto.randomBytes(4).toString("hex")}.tmp`;
  await fsp.writeFile(tempPath, `${JSON.stringify(data, null, 2)}\n`, "utf8");
  await fsp.rename(tempPath, filePath);
}

async function loadStore() {
  const store = await readJson(STORE_FILE, { items: [], comments: [] });
  if (!Array.isArray(store.items)) store.items = [];
  if (!Array.isArray(store.comments)) store.comments = [];
  return store;
}

async function saveStore(store) {
  await writeJson(STORE_FILE, store);
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  const cookies = {};
  for (const part of header.split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName) continue;
    cookies[rawName] = decodeURIComponent(rawValue.join("=") || "");
  }
  return cookies;
}

function base64UrlEncode(input) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value) {
  const normalized = String(value || "").replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  return Buffer.from(padded, "base64");
}

function signSessionPayload(payload) {
  return crypto.createHmac("sha256", SESSION_SECRET).update(payload).digest("base64url");
}

function createSessionToken() {
  const payload = base64UrlEncode(
    JSON.stringify({
      admin: true,
      exp: Date.now() + SESSION_TTL_MS
    })
  );
  return `${payload}.${signSessionPayload(payload)}`;
}

function readSessionToken(token) {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;

  const expected = signSessionPayload(payload);
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(actualBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const session = JSON.parse(base64UrlDecode(payload).toString("utf8"));
    if (!session.admin || Number(session.exp) < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

function getSession(req) {
  return readSessionToken(parseCookies(req)[COOKIE_NAME]);
}

function isAdmin(req) {
  const session = getSession(req);
  return Boolean(session && session.admin);
}

function shouldUseSecureCookie(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  return forwardedProto === "https" || Boolean(req.socket.encrypted);
}

function setSessionCookie(req, res, token) {
  const secure = shouldUseSecureCookie(req) ? "; Secure" : "";
  res.setHeader(
    "Set-Cookie",
    `${COOKIE_NAME}=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${Math.floor(
      SESSION_TTL_MS / 1000
    )}${secure}`
  );
}

function clearSessionCookie(res) {
  res.setHeader("Set-Cookie", `${COOKIE_NAME}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`);
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store"
  });
  res.end(body);
}

function sendText(res, statusCode, text) {
  res.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Content-Length": Buffer.byteLength(text)
  });
  res.end(text);
}

function readBody(req, maxBytes) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error("Request is too large."));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function readJsonBody(req) {
  const body = await readBody(req, MAX_JSON_BYTES);
  if (!body.length) return {};
  return JSON.parse(body.toString("utf8"));
}

function safeText(value, maxLength) {
  return String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .slice(0, maxLength);
}

function getField(fields, name, maxLength = 2000) {
  const value = Array.isArray(fields[name]) ? fields[name][0] : fields[name];
  return safeText(value, maxLength);
}

function verifyAdminCode(code, admin) {
  const attempted = crypto.pbkdf2Sync(
    String(code || ""),
    admin.salt,
    admin.iterations,
    admin.keylen,
    admin.digest
  );
  const expected = Buffer.from(admin.hash, "hex");
  return attempted.length === expected.length && crypto.timingSafeEqual(attempted, expected);
}

function parseContentDisposition(value) {
  const result = {};
  for (const piece of value.split(";")) {
    const [rawKey, ...rawVal] = piece.trim().split("=");
    if (!rawKey || !rawVal.length) continue;
    const key = rawKey.toLowerCase();
    let val = rawVal.join("=").trim();
    if (val.startsWith('"') && val.endsWith('"')) {
      val = val.slice(1, -1).replace(/\\"/g, '"');
    }
    result[key] = val;
  }
  return result;
}

async function parseMultipart(req) {
  const contentType = req.headers["content-type"] || "";
  const match = contentType.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  if (!match) throw new Error("Missing multipart boundary.");

  const boundary = Buffer.from(`--${match[1] || match[2]}`);
  const headerBreak = Buffer.from("\r\n\r\n");
  const crlf = Buffer.from("\r\n");
  const body = await readBody(req, MAX_UPLOAD_BYTES);
  const fields = {};
  const files = {};

  let cursor = body.indexOf(boundary);
  while (cursor !== -1) {
    cursor += boundary.length;
    if (body.slice(cursor, cursor + 2).toString("latin1") === "--") break;
    if (body.slice(cursor, cursor + 2).equals(crlf)) cursor += 2;

    const headerEnd = body.indexOf(headerBreak, cursor);
    if (headerEnd === -1) break;

    const rawHeaders = body.slice(cursor, headerEnd).toString("latin1");
    const headers = {};
    for (const line of rawHeaders.split("\r\n")) {
      const idx = line.indexOf(":");
      if (idx === -1) continue;
      headers[line.slice(0, idx).trim().toLowerCase()] = line.slice(idx + 1).trim();
    }

    const nextBoundary = body.indexOf(boundary, headerEnd + headerBreak.length);
    if (nextBoundary === -1) break;

    let dataEnd = nextBoundary;
    if (body.slice(dataEnd - 2, dataEnd).equals(crlf)) dataEnd -= 2;
    const data = body.slice(headerEnd + headerBreak.length, dataEnd);
    const disposition = parseContentDisposition(headers["content-disposition"] || "");
    const name = disposition.name;

    if (name) {
      if (Object.prototype.hasOwnProperty.call(disposition, "filename")) {
        const filename = disposition.filename || "";
        if (filename && data.length) {
          if (!files[name]) files[name] = [];
          files[name].push({
            filename,
            contentType: headers["content-type"] || "application/octet-stream",
            data
          });
        }
      } else {
        const text = data.toString("utf8");
        if (Object.prototype.hasOwnProperty.call(fields, name)) {
          fields[name] = Array.isArray(fields[name]) ? fields[name].concat(text) : [fields[name], text];
        } else {
          fields[name] = text;
        }
      }
    }

    cursor = nextBoundary;
  }

  return { fields, files };
}

function cleanFileName(originalName) {
  const ext = path.extname(originalName).toLowerCase().slice(0, 16);
  const baseName = path.basename(originalName, ext).replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "");
  return `${baseName || "file"}${ext}`;
}

async function storeUpload(file, category) {
  const cleanName = cleanFileName(file.filename);
  const storedName = `${Date.now()}-${crypto.randomBytes(6).toString("hex")}-${cleanName}`;
  const diskPath = path.join(UPLOAD_DIR, storedName);
  await fsp.writeFile(diskPath, file.data);
  return {
    id: makeId(category),
    name: cleanName,
    path: `/uploads/${storedName}`,
    type: file.contentType,
    size: file.data.length,
    uploadedAt: nowIso()
  };
}

async function storeOptionalImage(files, fieldName, category) {
  const file = files[fieldName] && files[fieldName][0];
  if (!file) return null;
  if (!file.contentType.toLowerCase().startsWith("image/")) {
    throw new Error("Titulní a galerijní soubory musí být obrázky.");
  }
  return storeUpload(file, category);
}

async function storeImageList(files, fieldName, category) {
  const list = files[fieldName] || [];
  const saved = [];
  for (const file of list) {
    if (!file.contentType.toLowerCase().startsWith("image/")) {
      throw new Error("Galerie přijímá jen obrázky.");
    }
    saved.push(await storeUpload(file, category));
  }
  return saved;
}

async function storeFileList(files, fieldName, category) {
  const list = files[fieldName] || [];
  const saved = [];
  for (const file of list) {
    saved.push(await storeUpload(file, category));
  }
  return saved;
}

function summarizeItem(item, comments) {
  return {
    id: item.id,
    title: item.title,
    platform: item.platform,
    year: item.year,
    summary: item.summary,
    description: item.description,
    thumbnail: item.thumbnail,
    gallery: item.gallery || [],
    files: item.files || [],
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    commentCount: comments.filter((comment) => comment.itemId === item.id).length
  };
}

function getSafeStaticPath(baseDir, requestPath) {
  const decoded = decodeURIComponent(requestPath);
  const normalized = path.normalize(decoded).replace(/^(\.\.[/\\])+/, "");
  const finalPath = path.join(baseDir, normalized);
  const relative = path.relative(baseDir, finalPath);
  if (relative.startsWith("..") || path.isAbsolute(relative)) return null;
  return finalPath;
}

async function serveStatic(req, res, pathname) {
  const isUpload = pathname.startsWith("/uploads/");
  const baseDir = isUpload ? UPLOAD_DIR : PUBLIC_DIR;
  const relPath = isUpload ? pathname.slice("/uploads/".length) : pathname === "/" ? "index.html" : pathname.slice(1);
  const filePath = getSafeStaticPath(baseDir, relPath);
  if (!filePath) return sendText(res, 403, "Forbidden");

  try {
    const stat = await fsp.stat(filePath);
    if (!stat.isFile()) return sendText(res, 404, "Not found");

    const ext = path.extname(filePath).toLowerCase();
    const headers = {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Content-Length": stat.size
    };
    if (!isUpload) {
      headers["Cache-Control"] = "no-cache";
    }
    res.writeHead(200, headers);
    fs.createReadStream(filePath).pipe(res);
  } catch {
    sendText(res, 404, "Not found");
  }
}

function requireAdmin(req, res) {
  if (isAdmin(req)) return true;
  sendJson(res, 401, { error: "Přihlas se administrátorským kódem." });
  return false;
}

async function handleCreateItem(req, res) {
  if (!requireAdmin(req, res)) return;
  const { fields, files } = await parseMultipart(req);
  const title = getField(fields, "title", 120);
  const description = getField(fields, "description", 8000);

  if (!title || !description) {
    return sendJson(res, 400, { error: "Název a popis jsou povinné." });
  }

  const thumbnail = await storeOptionalImage(files, "thumbnail", "thumb");
  const gallery = await storeImageList(files, "gallery", "image");
  const uploadedFiles = await storeFileList(files, "files", "file");
  const store = await loadStore();
  const item = {
    id: makeId("game"),
    title,
    platform: getField(fields, "platform", 80),
    year: getField(fields, "year", 20),
    summary: getField(fields, "summary", 260),
    description,
    thumbnail,
    gallery,
    files: uploadedFiles,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  store.items.unshift(item);
  await saveStore(store);
  sendJson(res, 201, { item: summarizeItem(item, store.comments) });
}

async function handleUpdateItem(req, res, itemId) {
  if (!requireAdmin(req, res)) return;
  const { fields, files } = await parseMultipart(req);
  const store = await loadStore();
  const item = store.items.find((entry) => entry.id === itemId);
  if (!item) return sendJson(res, 404, { error: "Položka neexistuje." });

  const title = getField(fields, "title", 120);
  const description = getField(fields, "description", 8000);
  if (!title || !description) {
    return sendJson(res, 400, { error: "Název a popis jsou povinné." });
  }

  item.title = title;
  item.platform = getField(fields, "platform", 80);
  item.year = getField(fields, "year", 20);
  item.summary = getField(fields, "summary", 260);
  item.description = description;

  const thumbnail = await storeOptionalImage(files, "thumbnail", "thumb");
  if (thumbnail) item.thumbnail = thumbnail;

  item.gallery = (item.gallery || []).concat(await storeImageList(files, "gallery", "image"));
  item.files = (item.files || []).concat(await storeFileList(files, "files", "file"));
  item.updatedAt = nowIso();

  await saveStore(store);
  sendJson(res, 200, { item: summarizeItem(item, store.comments) });
}

async function deleteStoredFile(fileRecord) {
  if (!fileRecord || !fileRecord.path || !fileRecord.path.startsWith("/uploads/")) return;
  const filePath = getSafeStaticPath(UPLOAD_DIR, fileRecord.path.slice("/uploads/".length));
  if (!filePath) return;
  try {
    await fsp.unlink(filePath);
  } catch {
    // The database entry is still removed even if the file is already gone.
  }
}

async function handleDeleteItem(req, res, itemId) {
  if (!requireAdmin(req, res)) return;
  const store = await loadStore();
  const index = store.items.findIndex((entry) => entry.id === itemId);
  if (index === -1) return sendJson(res, 404, { error: "Položka neexistuje." });

  const [item] = store.items.splice(index, 1);
  const files = [item.thumbnail].concat(item.gallery || [], item.files || []).filter(Boolean);
  for (const file of files) await deleteStoredFile(file);
  store.comments = store.comments.filter((comment) => comment.itemId !== itemId);
  await saveStore(store);
  sendJson(res, 200, { ok: true });
}

async function handleAddComment(req, res, itemId) {
  const data = await readJsonBody(req);
  const text = safeText(data.text, 2000);
  const author = safeText(data.author, 40) || "Anonym";
  if (!text) return sendJson(res, 400, { error: "Komentář nesmí být prázdný." });

  const store = await loadStore();
  if (!store.items.some((entry) => entry.id === itemId)) {
    return sendJson(res, 404, { error: "Položka neexistuje." });
  }

  const comment = {
    id: makeId("comment"),
    itemId,
    author,
    text,
    createdAt: nowIso()
  };
  store.comments.push(comment);
  await saveStore(store);
  sendJson(res, 201, { comment });
}

async function handleDeleteComment(req, res, commentId) {
  if (!requireAdmin(req, res)) return;
  const store = await loadStore();
  const before = store.comments.length;
  store.comments = store.comments.filter((comment) => comment.id !== commentId);
  if (store.comments.length === before) {
    return sendJson(res, 404, { error: "Komentář neexistuje." });
  }
  await saveStore(store);
  sendJson(res, 200, { ok: true });
}

async function handleApi(req, res, pathname) {
  if (req.method === "GET" && pathname === "/api/me") {
    return sendJson(res, 200, { admin: isAdmin(req) });
  }

  if (req.method === "POST" && pathname === "/api/login") {
    const data = await readJsonBody(req);
    const admin = await readJson(ADMIN_FILE, PRESET_ADMIN);
    if (!verifyAdminCode(data.code, admin)) {
      return sendJson(res, 403, { error: "Špatný administrátorský kód." });
    }
    setSessionCookie(req, res, createSessionToken());
    return sendJson(res, 200, { admin: true });
  }

  if (req.method === "POST" && pathname === "/api/logout") {
    clearSessionCookie(res);
    return sendJson(res, 200, { ok: true });
  }

  if (req.method === "GET" && pathname === "/api/items") {
    const store = await loadStore();
    return sendJson(res, 200, {
      items: store.items.map((item) => summarizeItem(item, store.comments))
    });
  }

  const itemMatch = pathname.match(/^\/api\/items\/([^/]+)$/);
  if (itemMatch && req.method === "GET") {
    const store = await loadStore();
    const item = store.items.find((entry) => entry.id === itemMatch[1]);
    if (!item) return sendJson(res, 404, { error: "Položka neexistuje." });
    return sendJson(res, 200, {
      item: summarizeItem(item, store.comments),
      comments: store.comments.filter((comment) => comment.itemId === item.id)
    });
  }

  if (req.method === "POST" && pathname === "/api/items") {
    return handleCreateItem(req, res);
  }

  if (itemMatch && req.method === "POST") {
    return handleUpdateItem(req, res, itemMatch[1]);
  }

  if (itemMatch && req.method === "DELETE") {
    return handleDeleteItem(req, res, itemMatch[1]);
  }

  const commentMatch = pathname.match(/^\/api\/items\/([^/]+)\/comments$/);
  if (commentMatch && req.method === "POST") {
    return handleAddComment(req, res, commentMatch[1]);
  }

  const deleteCommentMatch = pathname.match(/^\/api\/comments\/([^/]+)$/);
  if (deleteCommentMatch && req.method === "DELETE") {
    return handleDeleteComment(req, res, deleteCommentMatch[1]);
  }

  sendJson(res, 404, { error: "API endpoint neexistuje." });
}

async function handleRequest(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || "localhost"}`);
    const pathname = url.pathname;
    if (pathname.startsWith("/api/")) {
      return await handleApi(req, res, pathname);
    }
    return await serveStatic(req, res, pathname);
  } catch (error) {
    const status = error.message && error.message.includes("large") ? 413 : 500;
    sendJson(res, status, { error: error.message || "Serverová chyba." });
  }
}

ensureStorage()
  .then(() => {
    http.createServer(handleRequest).listen(PORT, () => {
      console.log(`Old Games Saving běží na http://localhost:${PORT}`);
    });
  })
  .catch((error) => {
    console.error("Nepodařilo se připravit úložiště:", error);
    process.exit(1);
  });
