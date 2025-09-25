// src/app/api/webhooks/notion/route.ts
import crypto from "crypto";
import { NextRequest } from "next/server";

export const runtime = "nodejs"; // use Node runtime for crypto

function safeTimingEqual(a: string, b: string) {
  const abuf = Buffer.from(a, "hex");
  const bbuf = Buffer.from(b, "hex");
  if (abuf.length !== bbuf.length) return false;
  return crypto.timingSafeEqual(abuf, bbuf);
}

function verifyNotionSignature(rawBody: string, signatureHeader: string | null, secret: string | undefined) {
  if (!secret) throw new Error("Missing NOTION_SIGNING_SECRET");
  if (!signatureHeader) return false;

  // Notion sends X-Notion-Signature as a hex HMAC SHA256 of the raw body.
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signatureHeader.trim().toLowerCase();
  return safeTimingEqual(expected, received);
}

export async function POST(request: NextRequest) {
  try {
    const signature = request.headers.get("x-notion-signature");
    const rawBody = await request.text(); // keep raw body for verification

    const ok = verifyNotionSignature(rawBody, signature, process.env.NOTION_SIGNING_SECRET);
    if (!ok) {
      return new Response("invalid signature", { status: 401 });
    }

    // Parse the JSON payload after verifying
    const event = JSON.parse(rawBody);
    const type = event?.event?.type ?? event?.type ?? "unknown";

    console.log("[Notion Webhook] type:", type);
    console.log("[Notion Webhook] payload keys:", Object.keys(event || {}));

    return new Response("ok", { status: 200 });
  } catch (err: any) {
    console.error("Webhook error:", err);
    return new Response("server error", { status: 500 });
  }
}
