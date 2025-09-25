// src/app/api/webhooks/notion/route.ts
import crypto from "crypto";

export const runtime = "nodejs";

/** Constant-time compare for hex strings */
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
  if (!secret || !signatureHeader) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signatureHeader.trim().toLowerCase();
  return safeTimingEqual(expected, received);
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    // If Notion ever sends a verification again, try to be nice and still echo token
    const headerToken =
      request.headers.get("x-notion-verification-token") ??
      request.headers.get("X-Notion-Verification-Token");
    if (headerToken) {
      console.log("[Notion Webhook] verification token (header) received");
      return new Response(headerToken, { status: 200 });
    }

    // Enforce signature for normal events
    const secret = process.env.NOTION_SIGNING_SECRET;
    const signature = request.headers.get("x-notion-signature");
    const ok = verifyNotionSignature(rawBody, signature, secret);
    if (!ok) {
      return new Response("invalid signature", { status: 401 });
    }

    // Handle/inspect the event
    let type = "unknown";
    try {
      const evt = JSON.parse(rawBody);
      type = evt?.event?.type ?? evt?.type ?? "unknown";
    } catch {
      /* ignore */
    }
    console.log("[Notion Webhook] event type:", type);

    return new Response("ok", { status: 200 });
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("Webhook error:", e);
    return new Response("server error", { status: 500 });
  }
}
