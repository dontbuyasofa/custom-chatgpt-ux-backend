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

function verifyNotionSignature(
  rawBody: string,
  signatureHeader: string | null,
  secret: string | undefined
) {
  if (!secret) throw new Error("Missing NOTION_SIGNING_SECRET");
  if (!signatureHeader) return false;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(rawBody)
    .digest("hex");
  const received = signatureHeader.trim().toLowerCase();
  return safeTimingEqual(expected, received);
}

export async function POST(request: NextRequest) {
  try {
    const rawBody = await request.text();

    // Parse body safely AFTER reading text
    const event = JSON.parse(rawBody);

    // 🔑 Special case: Notion verification challenge
    if (event?.event === "verification" && event?.verificationToken) {
      console.log("[Notion Webhook] Verification received");
      return new Response(event.verificationToken, { status: 200 });
    }

    // For normal signed requests
    const signature = request.headers.get("x-notion-signature");
    const ok = verifyNotionSignature(
      rawBody,
      signature,
      process.env.NOTION_SIGNING_SECRET
    );
    if (!ok) {
      return new Response("invalid signature", { status: 401 });
    }

    const type = event?.event?.type ?? event?.type ?? "unknown";
    console.log("[Notion Webhook] type:", type);

    return new Response("ok", { status: 200 });
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("Webhook error:", e);
    return new Response("server error", { status: 500 });
  }
}
