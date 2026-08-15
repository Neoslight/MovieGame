import https from "node:https";
import zlib from "node:zlib";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
  ) {
    super(`HTTP ${status} on ${url}`);
    this.name = "HttpError";
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Letterboxd sits behind Cloudflare, which fingerprints the client beyond its
 * headers. Measured against the live site: the global `fetch` (undici) gets a
 * 403 "Just a moment" interstitial on every request, while `node:https` with
 * the same headers gets 200. So Letterboxd requests go through node's core
 * HTTPS client, not fetch. (TMDB has no such protection and uses fetch.)
 */
export interface RawResponse {
  status: number;
  body: string;
  /** Where we ended up after redirects — boxd.it links resolve to a film slug. */
  url: string;
}

function rawGet(url: string, timeoutMs: number): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const target = new URL(url);
    const req = https.request(
      {
        host: target.host,
        path: target.pathname + target.search,
        method: "GET",
        headers: {
          Host: target.host,
          "User-Agent": UA,
          Accept: "*/*",
          "Accept-Encoding": "gzip, deflate",
        },
      },
      (res) => {
        // boxd.it short links 302 to the real film page; follow them here so
        // callers see one request and the final URL.
        const location = res.headers["location"];
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && location) {
          res.resume();
          resolve({
            status: res.statusCode,
            body: "",
            url: new URL(location, url).toString(),
          });
          return;
        }

        const encoding = res.headers["content-encoding"];
        const stream =
          encoding === "gzip"
            ? res.pipe(zlib.createGunzip())
            : encoding === "deflate"
              ? res.pipe(zlib.createInflate())
              : res;
        const chunks: Buffer[] = [];
        stream.on("data", (c: Buffer) => chunks.push(c));
        stream.on("error", reject);
        stream.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            body: Buffer.concat(chunks).toString("utf8"),
            url,
          }),
        );
      },
    );
    req.setTimeout(timeoutMs, () => req.destroy(new Error(`Timeout on ${url}`)));
    req.on("error", reject);
    req.end();
  });
}

/**
 * Fetch text with retry on transient failures. 4xx other than 429 fail fast —
 * retrying a 404 slug just wastes the politeness budget.
 */
export async function fetchPage(
  url: string,
  {
    retries = 2,
    timeoutMs = 15_000,
    maxRedirects = 3,
  }: { retries?: number; timeoutMs?: number; maxRedirects?: number } = {},
): Promise<RawResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      let current = url;
      for (let hop = 0; ; hop++) {
        const res = await rawGet(current, timeoutMs);
        if (res.status >= 300 && res.status < 400) {
          if (hop >= maxRedirects) throw new HttpError(res.status, current);
          current = res.url;
          continue;
        }
        if (res.status >= 200 && res.status < 300) return { ...res, url: current };
        if (res.status < 500 && res.status !== 429) throw new HttpError(res.status, current);
        lastError = new HttpError(res.status, current);
        break;
      }
    } catch (err) {
      if (err instanceof HttpError && err.status < 500 && err.status !== 429) throw err;
      lastError = err;
    }
    if (attempt < retries) await sleep(500 * 2 ** attempt);
  }
  throw lastError;
}

export async function fetchText(
  url: string,
  options?: Parameters<typeof fetchPage>[1],
): Promise<string> {
  return (await fetchPage(url, options)).body;
}

/**
 * Run `worker` over `items` with bounded concurrency and a delay between task
 * starts, so we stay a polite guest on Letterboxd. Results keep input order.
 */
export async function pooled<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  { concurrency = 3, delayMs = 300 }: { concurrency?: number; delayMs?: number } = {},
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  async function runner() {
    while (true) {
      const index = cursor++;
      if (index >= items.length) return;
      // Every task waits, including the first: callers often fetch one page
      // before calling in here, and firing the next request back-to-back is
      // exactly the burst Letterboxd blocks on. Jitter keeps the cadence from
      // looking metronomic.
      if (delayMs > 0) await sleep(delayMs + Math.random() * delayMs * 0.4);
      results[index] = await worker(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runner()),
  );
  return results;
}
