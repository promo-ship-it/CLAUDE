import { NextRequest, NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { isAdminAuthed } from "@/lib/auth";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

// POST /api/admin/upload — accepts one image file, returns its public URL.
// Requires BLOB_READ_WRITE_TOKEN (from Vercel dashboard → Storage → Blob).
export async function POST(req: NextRequest) {
  const authed = await isAdminAuthed();
  if (!authed) return NextResponse.json({ error: "Not authorized" }, { status: 401 });

  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return NextResponse.json(
      { error: "Image upload isn't configured yet — add BLOB_READ_WRITE_TOKEN (see README)." },
      { status: 400 }
    );
  }

  const formData = await req.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Please upload a JPG, PNG, WEBP, or GIF" }, { status: 400 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image is too large (8MB max)" }, { status: 400 });
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9.\-]/g, "-");
  const key = `properties/${Date.now()}-${safeName}`;

  const blob = await put(key, file, { access: "public" });

  return NextResponse.json({ url: blob.url });
}
