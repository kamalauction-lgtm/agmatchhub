import { NextResponse } from "next/server";
import { handleWebhook } from "@/lib/payments";

/**
 * Gateway webhooks (E11, Decision 8).
 *
 *   POST /api/payments/webhook/billplz    form-encoded, x_signature field
 *   POST /api/payments/webhook/midtrans   JSON, signature_key field
 *   POST /api/payments/webhook/stripe     JSON, Stripe-Signature header
 *
 * The body is read RAW — Stripe signs the exact bytes — and handed to the
 * adapter. Nothing here trusts the payload: the adapter verifies the
 * signature with the Worker secret, and `payment_intent_settle()` checks the
 * amount and currency against what WE recorded before anything is granted.
 * Every delivery, verified or not, is written to payment_events.
 */
export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ provider: string }> }) {
  const { provider } = await params;
  const raw = await request.text();
  const out = await handleWebhook(provider, raw, request.headers);
  return NextResponse.json({ ok: out.http < 400, outcomes: out.outcomes }, { status: out.http });
}
