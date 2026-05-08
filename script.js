import { upload } from "https://esm.sh/@vercel/blob/client@1";

const form = document.querySelector("#uploadForm");
const fileInput = document.querySelector("#fileInput");
const nameInput = document.querySelector("#nameInput");
const passwordInput = document.querySelector("#passwordInput");
const uploadButton = document.querySelector("#uploadButton");
const refreshButton = document.querySelector("#refresh");
const filesEl = document.querySelector("#files");
const countEl = document.querySelector("#count");
const messageEl = document.querySelector("#message");
const progressWrap = document.querySelector("#progressWrap");
const progressEl = document.querySelector("#progress");
const progressLabel = document.querySelector("#progressLabel");
const progressPercent = document.querySelector("#progressPercent");
const template = document.querySelector("#fileTemplate");

function cleanName(value) {
  const cleaned = String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.\- ]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return cleaned || "soubor";
}

function extensionOf(name) {
  const index = name.lastIndexOf(".");
  return index > 0 ? name.slice(index) : "";
}

function withOriginalExtension(name, originalName) {
  return extensionOf(name) ? name : `${name}${extensionOf(originalName)}`;
}

function formatBytes(bytes) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatDate(value) {
  return new Intl.DateTimeFormat("cs-CZ", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function setMessage(text, isError = false) {
  messageEl.textContent = text;
  messageEl.classList.toggle("error", isError);
}

function setProgress(percent) {
  const safePercent = Math.max(0, Math.min(100, Math.round(percent || 0)));
  progressEl.value = safePercent;
  progressPercent.textContent = `${safePercent}%`;
}

function renderComments(container, comments) {
  container.innerHTML = "";
  if (!comments.length) {
    container.innerHTML = '<p class="comment-empty">Zatim bez komentaru.</p>';
    return;
  }

  for (const comment of comments) {
    const item = document.createElement("article");
    item.className = "comment";
    const author = document.createElement("strong");
    author.textContent = comment.author || "Anonym";
    const meta = document.createElement("span");
    meta.textContent = formatDate(comment.createdAt);
    const text = document.createElement("p");
    text.textContent = comment.text;
    item.append(author, meta, text);
    container.append(item);
  }
}

async function loadComments(pathname, container) {
  container.innerHTML = '<p class="comment-empty">Nacitam diskuzi...</p>';
  const response = await fetch(`/api/comments?pathname=${encodeURIComponent(pathname)}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Nepodarilo se nacist diskuzi.");
  }
  renderComments(container, data.comments || []);
}

async function addComment(pathname, form, container) {
  const formData = new FormData(form);
  const response = await fetch("/api/comments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pathname,
      author: formData.get("author"),
      text: formData.get("text"),
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Komentar se nepodarilo ulozit.");
  }
  form.reset();
  renderComments(container, data.comments || []);
}

function renderScanResult(element, data) {
  element.classList.remove("danger", "ok");
  if (data.status !== "completed") {
    element.textContent = `VirusTotal: test se spustil, vysledek jeste neni hotovy. ID: ${data.analysisId}`;
    return;
  }

  const stats = data.stats || {};
  const malicious = stats.malicious || 0;
  const suspicious = stats.suspicious || 0;
  const harmless = stats.harmless || 0;
  const undetected = stats.undetected || 0;
  element.textContent = "";
  const summary = document.createElement("span");
  summary.textContent = `VirusTotal: skodlive ${malicious}, podezrele ${suspicious}, OK ${harmless}, bez nalezu ${undetected}. `;
  element.append(summary);
  if (data.guiUrl) {
    const link = document.createElement("a");
    link.href = data.guiUrl;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = "Report";
    element.append(link);
  }
  element.classList.add(malicious || suspicious ? "danger" : "ok");
}

async function scanFile(file, button, resultEl) {
  button.disabled = true;
  resultEl.textContent = "Posilam soubor na VirusTotal...";
  resultEl.classList.remove("danger", "ok");

  try {
    const response = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pathname: file.pathname }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Antivir test selhal.");
    renderScanResult(resultEl, data);
  } catch (error) {
    resultEl.textContent = error.message || "Antivir test selhal.";
    resultEl.classList.add("danger");
  } finally {
    button.disabled = false;
  }
}

async function loadFiles() {
  setMessage("");
  filesEl.innerHTML = '<p class="empty">Nacitam...</p>';
  const response = await fetch("/api/files", { cache: "no-store" });
  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || "Nepodarilo se nacist soubory.");
  }

  const files = data.files || [];
  filesEl.innerHTML = "";
  countEl.textContent = files.length === 1 ? "1 soubor" : `${files.length} souboru`;

  if (!files.length) {
    filesEl.innerHTML = '<p class="empty">Zatim tu nic neni.</p>';
    return;
  }

  for (const file of files) {
    const row = template.content.firstElementChild.cloneNode(true);
    row.querySelector("strong").textContent = file.name;
    row.querySelector("span").textContent = `${formatBytes(file.size)} - ${formatDate(file.uploadedAt)}`;
    row.querySelector("a").href = file.downloadUrl;
    row.querySelector(".scan").addEventListener("click", () => {
      scanFile(file, row.querySelector(".scan"), row.querySelector(".scan-result"));
    });

    const commentsEl = row.querySelector(".comments");
    const commentForm = row.querySelector(".comment-form");
    commentForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const button = commentForm.querySelector("button");
      button.disabled = true;
      try {
        await addComment(file.pathname, commentForm, commentsEl);
      } catch (error) {
        renderComments(commentsEl, [{ author: "System", text: error.message, createdAt: new Date().toISOString() }]);
      } finally {
        button.disabled = false;
      }
    });

    filesEl.append(row);
    loadComments(file.pathname, commentsEl).catch((error) => {
      renderComments(commentsEl, [{ author: "System", text: error.message, createdAt: new Date().toISOString() }]);
    });
  }
}

async function uploadFile(file) {
  const requestedName = cleanName(nameInput.value || file.name);
  const finalName = withOriginalExtension(requestedName, file.name);
  const pathname = `uploads/${crypto.randomUUID()}--${finalName}`;

  progressLabel.textContent = file.name;
  progressWrap.hidden = false;
  setProgress(0);

  await upload(pathname, file, {
    access: "public",
    handleUploadUrl: "/api/upload",
    multipart: true,
    clientPayload: JSON.stringify({ password: passwordInput.value }),
    onUploadProgress: ({ percentage }) => setProgress(percentage),
  });
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const file = fileInput.files[0];
  if (!file) return;

  uploadButton.disabled = true;
  setMessage("");

  try {
    await uploadFile(file);
    form.reset();
    setProgress(100);
    setMessage("Hotovo. Soubor je pripraveny ke stazeni.");
    await loadFiles();
  } catch (error) {
    setMessage(error.message || "Nahravani selhalo.", true);
  } finally {
    uploadButton.disabled = false;
  }
});

refreshButton.addEventListener("click", () => {
  loadFiles().catch((error) => setMessage(error.message, true));
});

loadFiles().catch((error) => setMessage(error.message, true));
