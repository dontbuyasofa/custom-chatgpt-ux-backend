// src/app/api/webhooks/notion/route.ts
import crypto from "crypto";

export const runtime = "nodejs";

/** Constant-time compare */
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
  if (!secret) return false; // no secret configured => don't verify
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signatureHeader.trim().toLowerCase();
  return safeTimingEqual(expected, received);
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    // --- A) Notion verification: token can be sent via header or body ---
    // Header (most reliable)
    const headerToken =
      request.headers.get("x-notion-verification-token") ??
      request.headers.get("X-Notion-Verification-Token");

    // Body (fallback; shape may vary)
    let bodyToken: string | undefined;
    try {
      const obj = JSON.parse(rawBody);
      if (typeof obj?.verificationToken === "string") bodyToken = obj.verificationToken;
      else if (typeof obj?.token === "string") bodyToken = obj.token;
      else if (obj?.event === "verification" && typeof obj?.verificationToken === "string") {
        bodyToken = obj.verificationToken;
      }
    } catch {
      // if Notion ever posts form-encoded: verificationToken=<value>
      if (!bodyToken && rawBody.includes("=")) {
        const params = new URLSearchParams(rawBody);
        bodyToken = params.get("verificationToken") ?? params.get("token") ?? undefined;
      }
    }

    const verificationToken = headerToken ?? bodyToken;
    if (verificationToken) {
      console.log("[Notion Webhook] Verification token:", verificationToken);
      // For Notion's UI flow you paste the token manually; just return 200 OK.
      return new Response("ok", { status: 200 });
    }

    // --- B) Normal signed events (tolerate missing secret during setup) ---
    const signature = request.headers.get("x-notion-signature");
    const secret = process.env.NOTION_SIGNING_SECRET;

    if (signature && secret) {
      const ok = verifyNotionSignature(rawBody, signature, secret);
      if (!ok) {
        return new Response("invalid signature", { status: 401 });
      }
    } else {
      // No secret configured yet — accept but log (useful during initial setup).
      console.log("[Notion Webhook] No signing secret configured; accepting event for now.");
    }

    // Log event type for visibility
    try {
      const event = JSON.parse(rawBody);
      const type = event?.event?.type ?? event?.type ?? "unknown";
      console.log("[Notion Webhook] event type:", type);
    } catch {
      /* ignore parse issues */
    }

    return new Response("ok", { status: 200 });
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("Webhook error:", e);
    return new Response("server error", { status: 500 });
  }
}
