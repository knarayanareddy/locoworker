/**
 * Bounded HTTP request bodies (R-11).
 *
 * `await req.json()` / `await req.text()` allocate the *whole* body before the
 * application gets a chance to reject it. Checking `Content-Length` alone is
 * not enough (chunked requests have none), so this reads the stream in chunks
 * and aborts as soon as the byte ceiling is crossed.
 */
export class BodyTooLargeError extends Error {
  readonly maxBytes: number;
  constructor(maxBytes: number) {
    super(`Request body exceeds ${maxBytes} bytes`);
    this.name = "BodyTooLargeError";
    this.maxBytes = maxBytes;
  }
}

export function isBodyTooLarge(err: unknown): err is BodyTooLargeError {
  return err instanceof BodyTooLargeError;
}

export async function readBoundedText(req: Request, maxBytes: number): Promise<string> {
  const limit = Math.max(1, Math.trunc(maxBytes) || 1);
  const declared = req.headers.get("content-length");
  if (declared !== null) {
    const declaredBytes = Number(declared);
    if (Number.isFinite(declaredBytes) && declaredBytes > limit) {
      throw new BodyTooLargeError(limit);
    }
  }

  const stream = req.body;
  if (!stream) return "";

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk: Uint8Array = value;
      total += chunk.byteLength;
      if (total > limit) {
        await reader.cancel().catch(() => {});
        throw new BodyTooLargeError(limit);
      }
      chunks.push(chunk);
    }
  } finally {
    reader.releaseLock();
  }

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(out);
}
