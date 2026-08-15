/**
 * Newline-delimited JSON: one event per line. Used for the import, where the
 * work takes minutes and the player deserves to see it move rather than watch
 * a frozen bar until a batch returns.
 */
export function ndjsonResponse<T>(
  produce: (send: (event: T) => void) => Promise<void>,
): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: T) =>
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        await produce(send);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-store",
      // Proxies that buffer would defeat the point of streaming.
      "X-Accel-Buffering": "no",
    },
  });
}

/** Reads an NDJSON body, calling `onEvent` per line as it arrives. */
export async function readNdjson<T>(
  response: Response,
  onEvent: (event: T) => void,
): Promise<void> {
  if (!response.body) throw new Error("Réponse sans corps.");
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;

    // Only complete lines; a partial tail waits for the next chunk.
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (line.trim()) onEvent(JSON.parse(line) as T);
    }
  }
  if (buffer.trim()) onEvent(JSON.parse(buffer) as T);
}
