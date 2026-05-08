import { handleUpload } from "@vercel/blob/client";
import { list, put } from "@vercel/blob";

const VIRUSTOTAL_API = "https://www.virustotal.com/api/v3";

function queryValue(value) {
  return Array.isArray(value) ? value[0] : value;
}

function endpointFromRequest(request) {
  const url = new URL(request.url || "/", "https://old-games-saving.local");
  const queryEndpoint = queryValue(request.query?.endpoint);
  if (queryEndpoint) return String(queryEndpoint).replace(/^\/+/, "");
  return url.pathname.replace(/^\/api\/?/, "").replace(/^\/+/, "");
}

function cleanText(value, maxLength) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function cleanPathname(value) {
  return String(value || "").replace(/\s+/g, "").slice(0, 500);
}

function safeJsonBody(body) {
  if (typeof body === "string") {
    return JSON.parse(body || "{}");
  }
  return body || {};
}

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function commentPath(pathname) {
  return `_comments/${base64Url(pathname)}.json`;
}

function nameFromPath(pathname) {
  const raw = pathname.split("/").pop() || "soubor";
  const marker = raw.indexOf("--");
  return marker >= 0 ? raw.slice(marker + 2) : raw;
}

function sendMethodNotAllowed(response) {
  return response.status(405).json({ error: "Metoda neni povolena." });
}

async function readComments(pathname) {
  const path = commentPath(pathname);
  const { blobs } = await list({ prefix: path, limit: 1 });
  const blob = blobs.find((item) => item.pathname === path);
  if (!blob) return [];

  const result = await fetch(blob.url, { cache: "no-store" });
  if (!result.ok) return [];
  const data = await result.json();
  return Array.isArray(data.comments) ? data.comments : [];
}

async function saveComments(pathname, comments) {
  await put(commentPath(pathname), JSON.stringify({ comments }, null, 2), {
    access: "public",
    contentType: "application/json",
    allowOverwrite: true,
  });
}

async function filesHandler(request, response) {
  if (request.method !== "GET") return sendMethodNotAllowed(response);

  const { blobs } = await list({
    prefix: "uploads/",
    limit: 1000,
  });

  const files = blobs
    .map((blob) => ({
      pathname: blob.pathname,
      name: nameFromPath(blob.pathname),
      size: blob.size,
      uploadedAt: blob.uploadedAt,
      downloadUrl: blob.downloadUrl || blob.url,
    }))
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

  return response.status(200).json({ files });
}

async function uploadHandler(request, response) {
  if (request.method !== "POST") return sendMethodNotAllowed(response);

  const jsonResponse = await handleUpload({
    body: safeJsonBody(request.body),
    request,
    onBeforeGenerateToken: async (pathname, clientPayload) => {
      if (!pathname.startsWith("uploads/") || pathname.includes("..")) {
        throw new Error("Neplatny nazev souboru.");
      }

      const expectedPassword = process.env.UPLOAD_PASSWORD;
      if (expectedPassword) {
        const payload = clientPayload ? JSON.parse(clientPayload) : {};
        if (payload.password !== expectedPassword) {
          throw new Error("Spatne heslo pro nahravani.");
        }
      }

      return {
        addRandomSuffix: false,
        maximumSizeInBytes: Number(process.env.MAX_UPLOAD_BYTES || 1024 * 1024 * 1024),
        tokenPayload: JSON.stringify({ pathname }),
      };
    },
    onUploadCompleted: async ({ blob }) => {
      console.log("Nahrano:", blob.pathname);
    },
  });

  return response.status(200).json(jsonResponse);
}

async function commentsHandler(request, response) {
  if (request.method === "GET") {
    const pathname = cleanText(queryValue(request.query?.pathname), 500);
    if (!pathname.startsWith("uploads/")) {
      return response.status(400).json({ error: "Neplatny soubor." });
    }
    const comments = await readComments(pathname);
    return response.status(200).json({ comments });
  }

  if (request.method === "POST") {
    const body = safeJsonBody(request.body);
    const pathname = cleanText(body.pathname, 500);
    const author = cleanText(body.author, 40) || "Anonym";
    const text = cleanText(body.text, 500);

    if (!pathname.startsWith("uploads/")) {
      return response.status(400).json({ error: "Neplatny soubor." });
    }
    if (!text) {
      return response.status(400).json({ error: "Komentar je prazdny." });
    }

    const comments = await readComments(pathname);
    comments.push({
      id: crypto.randomUUID(),
      author,
      text,
      createdAt: new Date().toISOString(),
    });

    const latest = comments.slice(-100);
    await saveComments(pathname, latest);
    return response.status(200).json({ comments: latest });
  }

  return sendMethodNotAllowed(response);
}

async function findBlob(pathname) {
  const { blobs } = await list({ prefix: pathname, limit: 1 });
  return blobs.find((blob) => blob.pathname === pathname);
}

async function virusTotalFetch(path, options = {}) {
  const result = await fetch(`${VIRUSTOTAL_API}${path}`, {
    ...options,
    headers: {
      accept: "application/json",
      "x-apikey": process.env.VIRUSTOTAL_API_KEY,
      ...(options.headers || {}),
    },
  });
  const data = await result.json().catch(() => ({}));
  if (!result.ok) {
    throw new Error(data?.error?.message || "VirusTotal vratil chybu.");
  }
  return data;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function scanHandler(request, response) {
  if (request.method !== "POST") return sendMethodNotAllowed(response);
  if (!process.env.VIRUSTOTAL_API_KEY) {
    return response.status(400).json({ error: "Ve Vercelu chybi VIRUSTOTAL_API_KEY." });
  }

  const body = safeJsonBody(request.body);
  const pathname = cleanPathname(body.pathname);
  if (!pathname.startsWith("uploads/") || pathname.includes("..")) {
    return response.status(400).json({ error: "Neplatny soubor." });
  }

  const blob = await findBlob(pathname);
  if (!blob) {
    return response.status(404).json({ error: "Soubor nebyl nalezen." });
  }

  const fileUrl = blob.downloadUrl || blob.url;
  const scan = await virusTotalFetch("/urls", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ url: fileUrl }),
  });

  const analysisId = scan?.data?.id;
  if (!analysisId) {
    throw new Error("VirusTotal nevratil ID testu.");
  }

  let analysis = null;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    await wait(attempt === 0 ? 1200 : 2500);
    analysis = await virusTotalFetch(`/analyses/${analysisId}`);
    if (analysis?.data?.attributes?.status === "completed") break;
  }

  const status = analysis?.data?.attributes?.status || "queued";
  return response.status(200).json({
    status,
    analysisId,
    stats: analysis?.data?.attributes?.stats || null,
    guiUrl: `https://www.virustotal.com/gui/url/${base64Url(fileUrl)}/detection`,
  });
}

export default async function handler(request, response) {
  try {
    const endpoint = endpointFromRequest(request);
    if (endpoint === "files") return await filesHandler(request, response);
    if (endpoint === "upload") return await uploadHandler(request, response);
    if (endpoint === "comments") return await commentsHandler(request, response);
    if (endpoint === "scan") return await scanHandler(request, response);
    return response.status(404).json({ error: "API endpoint nenalezen." });
  } catch (error) {
    return response.status(400).json({ error: error.message || "Neco se nepodarilo." });
  }
}
