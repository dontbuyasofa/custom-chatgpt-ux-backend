// src/app/api/chat/[page_id]/messages/route.ts
import { NextRequest } from "next/server";
import { getConversationIdForPage, setConversationIdForPage } from "@/lib/store";

export const runtime = "nodejs";

// Temporary conversation-id creator (we'll replace with OpenAI later)
async function ensureConversationId(pageId: string): Promise<string> {
  const existing = getConversationIdForPage(pageId);
  if (existing) return existing;

  const convId = `conv_${Math.random().toString(36).slice(2)}`;
  setConversationIdForPage(pageId, convId);
  return convId;
}

export async function POST(request: NextRequest, context: { params: { page_id: string } }) {
  try {
    const pageId = context.params.page_id;
    const body = await request.json().catch(() => ({}));
    const message: string | undefined = body?.message;

    if (!message || typeof message !== "string") {
      return new Response(JSON.stringify({ error: "Missing 'message' string" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const conversationId = await ensureConversationId(pageId);

    // --- STUB for OpenAI call ---
    // Later:
    // import OpenAI from "openai";
    // const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });
    // await openai.responses.create({ ... with conversationId & user message ... });

    const result = {
      status: "sent",
      page_id: pageId,
      conversation_id: conversationId,
      echo: message,
    };

    // TODO (later): increment "Number of Messages" on the Notion page

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("messages endpoint error:", err);
    return new Response(JSON.stringify({ error: "server error" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
}
