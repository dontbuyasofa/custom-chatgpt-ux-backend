// src/app/api/chat/[page_id]/stream/route.ts

export const runtime = "nodejs";

function toSSE(data: string) {
  return `data: ${data}\n\n`;
}

export async function GET(_request: Request, context: unknown) {
  // Safely extract params from unknown context
  const { params } =
    (context as { params: { page_id: string } }) ?? { params: { page_id: "" } };
  const pageId = params.page_id;

  const stream = new ReadableStream({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode(toSSE(JSON.stringify({ event: "open", pageId }))));

      const t1 = setTimeout(() => {
        controller.enqueue(enc.encode(toSSE(JSON.stringify({ chunk: "stream started…" }))));
      }, 300);

      const t2 = setTimeout(() => {
        controller.enqueue(enc.encode(toSSE(JSON.stringify({ chunk: "…more tokens…" }))));
      }, 900);

      const t3 = setTimeout(() => {
        controller.enqueue(enc.encode("event: end\n"));
        controller.enqueue(enc.encode(toSSE(JSON.stringify({ done: true }))));
        controller.close();
      }, 1600);

      return () => {
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

