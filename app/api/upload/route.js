import { handleUpload } from "@vercel/blob/client";
import { NextResponse } from "next/server";

export async function POST(request) {
  const body = await request.json();

  try {
    const jsonResponse = await handleUpload({
      body,
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
        console.log("blob upload completed", blob.pathname);
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
}
