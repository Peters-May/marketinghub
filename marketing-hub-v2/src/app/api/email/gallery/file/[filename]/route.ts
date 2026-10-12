import { promises as fs } from "fs";
import { NextRequest, NextResponse } from "next/server";
import { emailImageMime, galleryFilePath } from "@/lib/email/gallery";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Public image bytes so an inbox can load a gallery image. */
export async function GET(
  _request: NextRequest,
  context: { params: { filename: string } }
) {
  const filename = decodeURIComponent(context.params.filename || "");
  const filePath = galleryFilePath(filename);
  const mime = emailImageMime(filename);
  if (!filePath || !mime) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  try {
    const data = await fs.readFile(filePath);
    return new NextResponse(data, {
      headers: {
        "Content-Type": mime,
        "Cache-Control": "public, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
}
