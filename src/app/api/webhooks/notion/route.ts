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
  if (!secret) return false; // tolerate missing during setup
  if (!signatureHeader) return false;
  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signatureHeader.trim().toLowerCase();
  return safeTimingEqual(expected, received);
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.text();

    // ---- TEMP VERBOSE LOGGING (to find verification token) ----
    // Log all Notion-ish headers so we can see where the token is
    const interestingHeaders: Record<string, string> = {};
    for (const [k, v] of request.headers.entries()) {
      const lk = k.toLowerCase();
      if (lk.startsWith("x-notion-") || lk.includes("verification") || lk.includes("token")) {
        interestingHeaders[k] = v;
      }
    }
    console.log("[Notion Webhook] headers:", interestingHeaders);
    console.log("[Notion Webhook] raw body:", rawBody);

    // Try to extract a verification token from headers first
    let verificationToken =
      request.headers.get("x-notion-verification-token") ??
      request.headers.get("notion-verification-token") ??
      request.headers.get("verification-token") ??
      undefined;

    // Try common body shapes
    if (!verificationToken && rawBody) {
      try {
        const obj = JSON.parse(rawBody);
        if (typeof obj?.verificationToken === "string") verificationToken = obj.verificationToken;
        else if (typeof obj?.token === "string") verificationToken = obj.token;
        else if (obj?.event === "verification" && typeof obj?.verificationToken === "string") {
          verificationToken = obj.verificationToken;
        }
      } catch {
        // maybe urlencoded
        try {
          const params = new URLSearchParams(rawBody);
          verificationToken =
            params.get("verificationToken") ?? params.get("token") ?? verificationToken ?? undefined;
        } catch {
          /* ignore */
        }
      }
    }

    if (verificationToken) {
      console.log("[Notion Webhook] DETECTED verification token:", verificationToken);
      // For the UI flow, you paste this token into Notion's dialog.
      // Respond 200 to acknowledge receipt.
      return new Response("ok", { status: 200 });
    }

    // ---- Normal events (signature optional until secret is set) ----
    const secret = process.env.NOTION_SIGNING_SECRET;
    const signature = request.headers.get("x-notion-signature");
    if (signature && secret) {
      const ok = verifyNotionSignature(rawBody, signature, secret);
      if (!ok) return new Response("invalid signature", { status: 401 });
    } else {
      console.log("[Notion Webhook] No signing secret configured; accepting event for now.");
    }

    // Best-effort event type log
    try {
      const event = JSON.parse(rawBody);
      const type = event?.event?.type ?? event?.type ?? "unknown";
      console.log("[Notion Webhook] event type:", type);
    } catch {
      console.log("[Notion Webhook] event type: unknown");
    }

    return new Response("ok", { status: 200 });
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("Webhook error:", e);
    return new Response("server error", { status: 500 });
  }
}
