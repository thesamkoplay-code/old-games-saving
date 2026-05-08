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
    filesEl.append(row);
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
