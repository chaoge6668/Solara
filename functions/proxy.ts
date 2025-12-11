const NEW_API_BASE = "https://api.bugpk.com/api/music";
const KUWO_HOST_PATTERN = /(^|\.)kuwo\.cn$/i;
const SAFE_HEADERS = [
  "content-type",
  "cache-control",
  "accept-ranges",
  "content-length",
  "content-range",
  "etag",
  "last-modified",
  "expires",
  "date",
];
function createCorsHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init);
  for (const key of headers.keys()) {
    if (!SAFE_HEADERS.includes(key.toLowerCase())) {
      headers.delete(key);
    }
  }

  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, HEAD, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "*");
  if (!headers.has("Cache-Control")) {
    const path = new URL((init as Request)?.url || "").pathname;
    if (path.includes("/url") || KUWO_HOST_PATTERN.test(headers.get("server") || "")) {
      headers.set("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      headers.set("Cache-Control", "no-store");
    }
  }

  return headers;
}
function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}
function normalizeKuwoUrl(raw: string): URL | null {
  try {
    const url = new URL(raw);
    if (!KUWO_HOST_PATTERN.test(url.hostname)) return null;
    url.protocol = "http:"; // 酷我绝大部分音频仍是 http
    return url;
  } catch {
    return null;
  }
}
async function proxyAudio(target: string, request: Request): Promise<Response> {
  const url = normalizeKuwoUrl(target);
  if (!url) return new Response("Invalid kuwo url", { status: 400 });

  const headers: {
    "User-Agent":
      request.headers.get("User-Agent") ||
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Referer": "https://www.kuwo.cn/",
    "Origin": "https://www.kuwo.cn",
  };

  const range = request.headers.get("Range");
  if (range) init.headers["Range"] = range;

  const upstream = await fetch(url.toString(), init);

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: createCorsHeaders(upstream.headers),
  });
}
async function proxyApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const apiUrl = new URL(NEW_API_BASE);
  url.searchParams.forEach((value, key) => {
    if (key.toLowerCase() !== "target") {
      apiUrl.searchParams.set(key, value);
    }
  });

  const upstream = await fetch(apiUrl.toString(), {
    headers: {
      "User-Agent": request.headers.get("User-Agent") || "Mozilla/5.0",
      "Accept": "application/json",
      "Referer": "https://www.kuwo.cn",
    },
  });

  const cloned = new Response(upstream.body, upstream);
  cloned.headers = createCorsHeaders(upstream.headers);
  if (!cloned.headers.has("Content-Type")) {
    cloned.headers.set("Content-Type", "application/json; charset=utf-8");
  }

  return cloned;
}
export default {
  async fetch(request: Request): Promise<Response> {
    if (request.method === "OPTIONS") return handleOptions();
    if (!["GET", "HEAD"].includes(request.method))
      return new Response("Method Not Allowed", { status: 405 });

    const url = new URL(request.url);
    const target = url.searchParams.get("target");
    if (target) {
      return proxyAudio(target, request);
    }
    return proxyApi(request);
  },
};
