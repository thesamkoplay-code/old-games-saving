const state = {
  items: [],
  selectedId: null,
  selectedComments: [],
  admin: false,
  adminToken: sessionStorage.getItem("ogs_admin_token") || "",
  search: ""
};

const els = {
  homeButton: document.querySelector("#homeButton"),
  searchInput: document.querySelector("#searchInput"),
  adminButton: document.querySelector("#adminButton"),
  closeAdminButton: document.querySelector("#closeAdminButton"),
  adminPanel: document.querySelector("#adminPanel"),
  loginForm: document.querySelector("#loginForm"),
  adminCode: document.querySelector("#adminCode"),
  adminTools: document.querySelector("#adminTools"),
  gameForm: document.querySelector("#gameForm"),
  editId: document.querySelector("#editId"),
  titleInput: document.querySelector("#titleInput"),
  platformInput: document.querySelector("#platformInput"),
  yearInput: document.querySelector("#yearInput"),
  summaryInput: document.querySelector("#summaryInput"),
  descriptionInput: document.querySelector("#descriptionInput"),
  saveButton: document.querySelector("#saveButton"),
  resetFormButton: document.querySelector("#resetFormButton"),
  logoutButton: document.querySelector("#logoutButton"),
  adminItems: document.querySelector("#adminItems"),
  listView: document.querySelector("#listView"),
  detailView: document.querySelector("#detailView"),
  detailContent: document.querySelector("#detailContent"),
  gameGrid: document.querySelector("#gameGrid"),
  counter: document.querySelector("#counter"),
  backButton: document.querySelector("#backButton"),
  toast: document.querySelector("#toast")
};

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("show");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => els.toast.classList.remove("show"), 2600);
}

async function requestJson(url, options = {}) {
  const headers = options.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  if (state.adminToken) {
    headers.Authorization = `Bearer ${state.adminToken}`;
  }

  const response = await fetch(url, {
    credentials: "same-origin",
    headers,
    ...options
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Požadavek se nepovedl.");
  }
  return data;
}

function fileSize(bytes) {
  const units = ["B", "KB", "MB", "GB"];
  let value = Number(bytes) || 0;
  let index = 0;
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024;
    index += 1;
  }
  return `${value.toFixed(index ? 1 : 0)} ${units[index]}`;
}

function formatDate(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("cs-CZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

function fallbackCover(title) {
  return `<div class="cover-fallback">${escapeHtml(title || "Old Game")}</div>`;
}

function coverMarkup(item, large = false) {
  const cls = large ? "hero-media" : "cover";
  if (item.thumbnail && item.thumbnail.path) {
    return `<div class="${cls}"><img src="${escapeHtml(item.thumbnail.path)}" alt="${escapeHtml(item.title)}"></div>`;
  }
  return `<div class="${cls}">${fallbackCover(item.title)}</div>`;
}

function itemMeta(item) {
  const parts = [];
  if (item.platform) parts.push(`<span class="pill">${escapeHtml(item.platform)}</span>`);
  if (item.year) parts.push(`<span class="pill">${escapeHtml(item.year)}</span>`);
  parts.push(`<span class="pill">${item.files.length} souborů</span>`);
  parts.push(`<span class="pill">${item.commentCount || 0} komentářů</span>`);
  return parts.join("");
}

function filteredItems() {
  const term = state.search.trim().toLowerCase();
  if (!term) return state.items;
  return state.items.filter((item) => {
    return [item.title, item.platform, item.year, item.summary, item.description]
      .join(" ")
      .toLowerCase()
      .includes(term);
  });
}

function renderList() {
  const items = filteredItems();
  els.counter.textContent = `${items.length} ${items.length === 1 ? "položka" : items.length > 1 && items.length < 5 ? "položky" : "položek"}`;

  if (!items.length) {
    els.gameGrid.innerHTML = `<div class="empty">Zatím tu nic není. Přidej první položku v administraci.</div>`;
    return;
  }

  els.gameGrid.innerHTML = items
    .map(
      (item) => `
        <button class="game-card" type="button" data-open="${escapeHtml(item.id)}">
          ${coverMarkup(item)}
          <span class="game-card-body">
            <strong>${escapeHtml(item.title)}</strong>
            <span class="meta">${itemMeta(item)}</span>
            <span class="summary">${escapeHtml(item.summary || item.description.slice(0, 160))}</span>
          </span>
        </button>
      `
    )
    .join("");
}

function renderAdminState() {
  els.loginForm.hidden = state.admin;
  els.adminTools.hidden = !state.admin;
  if (state.admin) renderAdminList();
}

function renderAdminList() {
  if (!state.items.length) {
    els.adminItems.innerHTML = `<div class="empty">Žádné položky.</div>`;
    return;
  }

  els.adminItems.innerHTML = state.items
    .map(
      (item) => `
        <div class="admin-row">
          <div class="admin-title">${escapeHtml(item.title)}</div>
          <div class="meta">${itemMeta(item)}</div>
          <div class="admin-row-actions">
            <button class="tiny-button" type="button" data-edit="${escapeHtml(item.id)}">Upravit</button>
            <button class="tiny-button danger" type="button" data-delete="${escapeHtml(item.id)}">Smazat</button>
          </div>
        </div>
      `
    )
    .join("");
}

function renderComments(itemId) {
  const comments = state.selectedComments;
  const commentList = comments.length
    ? comments
        .map(
          (comment) => `
            <div class="comment">
              <div>
                <strong>${escapeHtml(comment.author)}</strong>
                <span class="comment-date">${formatDate(comment.createdAt)}</span>
              </div>
              <div>${escapeHtml(comment.text)}</div>
              ${
                state.admin
                  ? `<button class="tiny-button danger" type="button" data-delete-comment="${escapeHtml(comment.id)}">Smazat komentář</button>`
                  : ""
              }
            </div>
          `
        )
        .join("")
    : `<div class="empty">Diskuze zatím čeká na první komentář.</div>`;

  return `
    <section class="discussion">
      <h2>Diskuze</h2>
      <form class="comment-form" data-comment-form="${escapeHtml(itemId)}">
        <input name="author" maxlength="40" placeholder="Jméno">
        <textarea name="text" maxlength="2000" placeholder="Komentář" required></textarea>
        <button type="submit">Odeslat</button>
      </form>
      <div class="comment-list">${commentList}</div>
    </section>
  `;
}

function renderDetail(item) {
  const gallery = item.gallery && item.gallery.length
    ? `
      <section class="gallery">
        <h2>Fotky</h2>
        <div class="gallery-grid">
          ${item.gallery
            .map(
              (image) => `
                <a class="gallery-image" href="${escapeHtml(image.path)}" target="_blank" rel="noreferrer">
                  <img src="${escapeHtml(image.path)}" alt="${escapeHtml(image.name)}">
                </a>
              `
            )
            .join("")}
        </div>
      </section>
    `
    : "";

  const downloads = item.files && item.files.length
    ? item.files
        .map(
          (file) => `
            <div class="download-row">
              <div>
                <div class="file-name">${escapeHtml(file.name)}</div>
                <div class="file-size">${fileSize(file.size)}</div>
              </div>
              <a class="download-button" href="${escapeHtml(file.path)}" download="${escapeHtml(file.name)}">Stáhnout</a>
            </div>
          `
        )
        .join("")
    : `<div class="empty">U této položky zatím nejsou nahrané soubory.</div>`;

  els.detailContent.innerHTML = `
    <div class="detail-shell">
      ${coverMarkup(item, true)}
      <div class="detail-copy">
        <div>
          <p class="eyebrow">Detail položky</p>
          <h1>${escapeHtml(item.title)}</h1>
        </div>
        <div class="meta">${itemMeta(item)}</div>
        <div class="description">${escapeHtml(item.description)}</div>
        ${
          state.admin
            ? `<div class="form-actions">
                <button class="secondary" type="button" data-edit="${escapeHtml(item.id)}">Upravit</button>
                <button class="secondary danger" type="button" data-delete="${escapeHtml(item.id)}">Smazat</button>
              </div>`
            : ""
        }
      </div>
    </div>
    ${gallery}
    <section class="downloads">
      <h2>Soubory</h2>
      <div class="download-list">${downloads}</div>
    </section>
    ${renderComments(item.id)}
  `;
}

async function loadItems() {
  const data = await requestJson("/api/items");
  state.items = data.items || [];
  renderList();
  renderAdminState();
}

async function openItem(itemId, updateHash = true) {
  const data = await requestJson(`/api/items/${encodeURIComponent(itemId)}`);
  state.selectedId = itemId;
  state.selectedComments = data.comments || [];
  els.listView.hidden = true;
  els.detailView.hidden = false;
  renderDetail(data.item);
  if (updateHash) window.location.hash = `game/${itemId}`;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showList(updateHash = true) {
  state.selectedId = null;
  els.detailView.hidden = true;
  els.listView.hidden = false;
  if (updateHash) history.pushState("", document.title, window.location.pathname + window.location.search);
}

function openAdminPanel() {
  els.adminPanel.hidden = false;
  renderAdminState();
  setTimeout(() => (state.admin ? els.titleInput.focus() : els.adminCode.focus()), 50);
}

function closeAdminPanel() {
  els.adminPanel.hidden = true;
}

function resetGameForm() {
  els.gameForm.reset();
  els.editId.value = "";
  els.saveButton.textContent = "Přidat položku";
}

function startEdit(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item) return;
  openAdminPanel();
  els.editId.value = item.id;
  els.titleInput.value = item.title || "";
  els.platformInput.value = item.platform || "";
  els.yearInput.value = item.year || "";
  els.summaryInput.value = item.summary || "";
  els.descriptionInput.value = item.description || "";
  els.saveButton.textContent = "Uložit změny";
  els.titleInput.focus();
}

async function deleteItem(itemId) {
  const item = state.items.find((entry) => entry.id === itemId);
  if (!item || !confirm(`Smazat položku "${item.title}" včetně jejích souborů?`)) return;
  await requestJson(`/api/items/${encodeURIComponent(itemId)}`, { method: "DELETE" });
  showToast("Položka je smazaná.");
  resetGameForm();
  await loadItems();
  if (state.selectedId === itemId) showList();
}

async function deleteComment(commentId) {
  if (!confirm("Smazat tento komentář?")) return;
  await requestJson(`/api/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
  showToast("Komentář je smazaný.");
  if (state.selectedId) await openItem(state.selectedId, false);
  await loadItems();
}

async function checkAdmin() {
  const data = await requestJson("/api/me");
  state.admin = Boolean(data.admin);
  renderAdminState();
}

async function initFromHash() {
  const match = window.location.hash.match(/^#?game\/(.+)$/);
  if (!match) return;
  try {
    await openItem(decodeURIComponent(match[1]), false);
  } catch {
    showList(false);
  }
}

els.gameGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-open]");
  if (button) openItem(button.dataset.open).catch((error) => showToast(error.message));
});

els.detailContent.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");
  const deleteCommentButton = event.target.closest("[data-delete-comment]");
  if (editButton) startEdit(editButton.dataset.edit);
  if (deleteButton) deleteItem(deleteButton.dataset.delete).catch((error) => showToast(error.message));
  if (deleteCommentButton) deleteComment(deleteCommentButton.dataset.deleteComment).catch((error) => showToast(error.message));
});

els.detailContent.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-comment-form]");
  if (!form) return;
  event.preventDefault();
  const itemId = form.dataset.commentForm;
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    await requestJson(`/api/items/${encodeURIComponent(itemId)}/comments`, {
      method: "POST",
      body: JSON.stringify(data)
    });
    form.reset();
    showToast("Komentář je uložený.");
    await openItem(itemId, false);
    await loadItems();
  } catch (error) {
    showToast(error.message);
  }
});

els.adminItems.addEventListener("click", (event) => {
  const editButton = event.target.closest("[data-edit]");
  const deleteButton = event.target.closest("[data-delete]");
  if (editButton) startEdit(editButton.dataset.edit);
  if (deleteButton) deleteItem(deleteButton.dataset.delete).catch((error) => showToast(error.message));
});

els.searchInput.addEventListener("input", () => {
  state.search = els.searchInput.value;
  renderList();
});

els.homeButton.addEventListener("click", () => showList());
els.backButton.addEventListener("click", () => showList());
els.adminButton.addEventListener("click", openAdminPanel);
els.closeAdminButton.addEventListener("click", closeAdminPanel);
els.resetFormButton.addEventListener("click", resetGameForm);

els.loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const login = await requestJson("/api/login", {
      method: "POST",
      body: JSON.stringify({ code: els.adminCode.value })
    });
    state.adminToken = login.token || "";
    if (state.adminToken) {
      sessionStorage.setItem("ogs_admin_token", state.adminToken);
    }
    els.adminCode.value = "";
    state.admin = true;
    renderAdminState();
    showToast("Administrace je odemknutá.");
  } catch (error) {
    showToast(error.message);
  }
});

els.logoutButton.addEventListener("click", async () => {
  await requestJson("/api/logout", { method: "POST", body: JSON.stringify({}) });
  state.adminToken = "";
  sessionStorage.removeItem("ogs_admin_token");
  state.admin = false;
  resetGameForm();
  renderAdminState();
  showToast("Odhlášeno.");
});

els.gameForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(els.gameForm);
  const editId = els.editId.value;
  const endpoint = editId ? `/api/items/${encodeURIComponent(editId)}` : "/api/items";
  els.saveButton.disabled = true;
  try {
    await requestJson(endpoint, {
      method: "POST",
      body: formData
    });
    showToast(editId ? "Změny jsou uložené." : "Položka je přidaná.");
    resetGameForm();
    await loadItems();
    if (state.selectedId) await openItem(state.selectedId, false).catch(() => showList(false));
  } catch (error) {
    showToast(error.message);
  } finally {
    els.saveButton.disabled = false;
  }
});

window.addEventListener("hashchange", initFromHash);

Promise.all([checkAdmin(), loadItems()])
  .then(initFromHash)
  .catch((error) => showToast(error.message));
