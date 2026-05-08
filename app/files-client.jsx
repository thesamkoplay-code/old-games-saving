"use client";

import { upload } from "@vercel/blob/client";
import { useEffect, useMemo, useState } from "react";

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

export default function FilesClient() {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [progress, setProgress] = useState(0);
  const [uploading, setUploading] = useState(false);

  const countText = useMemo(() => {
    if (files.length === 1) return "1 soubor";
    return `${files.length} souboru`;
  }, [files.length]);

  async function loadFiles() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/files", { cache: "no-store" });
      if (!response.ok) throw new Error("Nepodarilo se nacist soubory.");
      const data = await response.json();
      setFiles(data.files || []);
    } catch (err) {
      setError(err.message || "Nepodarilo se nacist soubory.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadFiles();
  }, []);

  async function onSubmit(event) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const file = formData.get("file");
    const password = String(formData.get("password") || "");
    if (!(file instanceof File) || file.size === 0) return;

    const requestedName = cleanName(String(formData.get("name") || file.name));
    const finalName = withOriginalExtension(requestedName, file.name);
    const pathname = `uploads/${crypto.randomUUID()}--${finalName}`;

    setUploading(true);
    setProgress(0);
    setMessage("");
    setError("");

    try {
      await upload(pathname, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        multipart: true,
        clientPayload: JSON.stringify({ password }),
        onUploadProgress: ({ percentage }) => setProgress(Math.round(percentage)),
      });
      event.currentTarget.reset();
      setMessage("Hotovo. Soubor je pripraveny ke stazeni.");
      await loadFiles();
    } catch (err) {
      setError(err.message || "Nahravani selhalo.");
    } finally {
      setUploading(false);
    }
  }

  return (
    <main className="shell">
      <section className="top">
        <div>
          <p className="eyebrow">Sdileni souboru</p>
          <h1>Soubory ke stazeni</h1>
        </div>
        <button type="button" onClick={loadFiles}>Obnovit</button>
      </section>

      <section className="panel upload-panel">
        <form onSubmit={onSubmit}>
          <label>
            <span>Soubor</span>
            <input name="file" type="file" required />
          </label>
          <label>
            <span>Nazev pro lidi</span>
            <input name="name" type="text" maxLength="120" placeholder="napr. dokument.pdf" />
          </label>
          <label>
            <span>Heslo pro nahravani</span>
            <input name="password" type="password" autoComplete="current-password" />
          </label>
          <button type="submit" disabled={uploading}>{uploading ? "Nahravam" : "Nahrat"}</button>
        </form>

        {uploading ? (
          <div className="progress-wrap">
            <div className="progress-text">
              <span>Nahravam...</span>
              <span>{progress}%</span>
            </div>
            <progress value={progress} max="100" />
          </div>
        ) : null}

        <p className={`message ${error ? "error" : ""}`} role="status">{error || message}</p>
      </section>

      <section className="list-head">
        <h2>Soubory</h2>
        <span>{countText}</span>
      </section>

      <section className="files">
        {loading ? <p className="empty">Nacitam...</p> : null}
        {!loading && files.length === 0 ? <p className="empty">Zatim tu nic neni.</p> : null}
        {files.map((file) => (
          <article className="file-row" key={file.pathname}>
            <div className="file-main">
              <strong>{file.name}</strong>
              <span>{formatBytes(file.size)} - {formatDate(file.uploadedAt)}</span>
            </div>
            <a className="download" href={file.downloadUrl}>Stahnout</a>
          </article>
        ))}
      </section>
    </main>
  );
}
