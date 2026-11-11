import type { MiddlewareHandler } from "hono";

// The local server has no login: being on this computer is the only key. Listening on the
// loopback address keeps other computers out, but any website open in the Interviewer's browser
// can still send requests to localhost. This guard turns those away, before any route runs:
// - A request whose Host is not a loopback name is refused, even to read. A site that points its
//   own name at 127.0.0.1 (DNS rebinding) would otherwise read every Candidate as its own page.
// - A request that can change something is refused when the browser says it comes from another
//   page: an Origin other than the page's own host, or Sec-Fetch-Site of another site. A plain
//   form or text body from another site needs no permission from the browser, so this check,
//   not the content type, is what stops it. A request with neither header (a terminal) passes.
// - No other site may show the app inside its own page, where a click could be tricked.
const loopbackNames = new Set(["localhost", "127.0.0.1", "[::1]"]);
const safeMethods = new Set(["GET", "HEAD", "OPTIONS"]);

export function localOnly(): MiddlewareHandler {
  return async (c, next) => {
    c.header("X-Frame-Options", "DENY");
    c.header("Content-Security-Policy", "frame-ancestors 'none'");
    const host = c.req.header("host") ?? "";
    if (!loopbackNames.has(hostName(host))) return refuse(c);
    if (!safeMethods.has(c.req.method)) {
      const site = c.req.header("sec-fetch-site");
      if (site !== undefined && site !== "same-origin" && site !== "none") return refuse(c);
      const origin = c.req.header("origin");
      if (origin !== undefined && originHost(origin) !== host.toLowerCase()) return refuse(c);
    }
    await next();
  };
}

function refuse(c: Parameters<MiddlewareHandler>[0]): Response {
  return c.json({ error: "Interview Companion only answers its own page on this computer." }, 403);
}

// The name in a Host header, without the port: "localhost:3000" is "localhost", "[::1]:3000" is "[::1]".
function hostName(host: string): string {
  return host.toLowerCase().replace(/:\d+$/, "");
}

// The host and port of an Origin header, or null when it is not a web address (such as "null").
function originHost(origin: string): string | null {
  try {
    const url = new URL(origin);
    return url.protocol === "http:" ? url.host : null;
  } catch {
    return null;
  }
}
