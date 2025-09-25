// src/app/api/webhooks/notion/route.ts
import crypto from "crypto";

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
  if (!secret) return false; // tolerate missing during local/dev
  if (!signatureHeader) return false;

  const expected = crypto.createHmac("sha256", secret).update(rawBody).digest("hex");
  const received = signatureHeader.trim().toLowerCase();
  return safeTimingEqual(expected, received);
}

export async function POST(request: Request) {
  try {
    // Read raw body once
    const rawBody = await request.text();

    // --- 1) Handle Notion webhook verification (no signature expected) ---
    // Notion may POST JSON like: { "event": "verification", "verificationToken": "..." }
    // Be forgiving about formats.
    let verificationToken: string | undefined;

    // Try JSON first
    try {
      const obj = JSON.parse(rawBody);
      if (typeof obj?.verificationToken === "string") {
        verificationToken = obj.verificationToken;
      } else if (
        obj?.event === "verification" &&
        typeof obj?.verificationToken === "string"
      ) {
        verificationToken = obj.verificationToken;
      }
    } catch {
      // not JSON; ignore
    }

    // Try URL-encoded: verificationToken=<value>
    if (!verificationToken && rawBody && rawBody.includes("=")) {
      try {
        const params = new URLSearchParams(rawBody);
        const p = params.get("verificationToken") || params.get("token");
        if (p) verificationToken = p;
      } catch {
        // ignore
      }
    }

    // Last-resort regex (if Notion changes shape slightly)
    if (!verificationToken) {
      const m = rawBody.match(/verificationToken["']?\s*[:=]\s*["']?([^"'\s}]+)/i);
      if (m) verificationToken = m[1];
    }

    if (verificationToken) {
      console.log("[Notion Webhook] Verification received, echoing token");
      return new Response(verificationToken, {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }

    // --- 2) Normal signed webhook events ---
    const signature = request.headers.get("x-notion-signature");
    const ok = verifyNotionSignature(
      rawBody,
      signature,
      process.env.NOTION_SIGNING_SECRET
    );
    if (!ok) {
      return new Response("invalid signature", { status: 401 });
    }

    // Parse and log event (best-effort)
    let eventType = "unknown";
    try {
      const event = JSON.parse(rawBody);
      eventType = event?.event?.type ?? event?.type ?? "unknown";
    } catch {
      // ignore parse errors for non-verification payloads
    }
    console.log("[Notion Webhook] type:", eventType);

    return new Response("ok", { status: 200 });
  } catch (err: unknown) {
    const e = err instanceof Error ? err : new Error(String(err));
    console.error("Webhook error:", e);
    return new Response("server error", { status: 500 });
  }
}
