import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/whatsapp";
import { verificationChallenge } from "@/lib/whatsapp/webhook";

/**
 * Meta WhatsApp Cloud API webhook (E12).
 *
 *   GET   the one-time subscription handshake: echo hub.challenge when
 *         hub.verify_token equals WHATSAPP_VERIFY_TOKEN
 *   POST  deliveries, signed with the app secret (X-Hub-Signature-256).
 *         Raw body in; every delivery recorded; 200 for anything verified so
 *         Meta does not retry what we already hold.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const challenge = verificationChallenge(new URL(request.url).searchParams, process.env.WHATSAPP_VERIFY_TOKEN);
  if (challenge === null) return new NextResponse("forbidden", { status: 403 });
  return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
}

export async function POST(request: Request) {
  const raw = await request.text();
  const out = await handleWebhook(raw, request.headers);
  return NextResponse.json({ ok: out.http < 400, outcomes: out.outcomes }, { status: out.http });
}
