import { list } from "@vercel/blob";

export const dynamic = "force-dynamic";

function nameFromPath(pathname) {
  const raw = pathname.split("/").pop() || "soubor";
  const marker = raw.indexOf("--");
  return marker >= 0 ? raw.slice(marker + 2) : raw;
}

export async function GET() {
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
      downloadUrl: blob.downloadUrl,
    }))
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());

  return Response.json({ files });
}
