import { NextResponse } from "next/server";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { summariseDocument, DOCUMENT_MAX_BYTES } from "@/lib/ai/documents";

/**
 * POST multipart: `file` (PDF, image or .txt) or `text`, plus `name`.
 * Session-authenticated like a server action; a route handler because the
 * upload may exceed what server actions comfortably carry. The file is read
 * into memory, summarised, and dropped — nothing is written to storage.
 */
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const locale = await getLocale();

  let form: FormData;
  try { form = await request.formData(); } catch { return NextResponse.json({ error: "bad_form" }, { status: 400 }); }
  const file = form.get("file");
  const text = form.get("text");
  const name = String(form.get("name") ?? (file instanceof File ? file.name : "pasted")).slice(0, 120);

  if (file instanceof File && file.size > DOCUMENT_MAX_BYTES) return NextResponse.json({ source: "rules", reason: "too_large" });
  const out = await summariseDocument(
    {
      name,
      file: file instanceof File && file.size > 0 ? { mimeType: file.type || "application/octet-stream", bytes: await file.arrayBuffer() } : null,
      text: typeof text === "string" ? text : null,
    },
    { userId: user.id, locale },
  );
  return NextResponse.json(out);
}
