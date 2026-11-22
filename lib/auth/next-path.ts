/** Pure helpers (no server-only import) shared by middleware, routes and tests. */

function hasUnsafeChars(s: string): boolean {
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c < 0x20 || c === 0x7f || ch === "\\") return true;
  }
  return false;
}

/** Only same-origin relative paths are allowed as post-login targets. Anything else → fallback. */
export function sanitizeNextPath(next: string | null | undefined, fallback = "/"): string {
  if (!next || typeof next !== "string") return fallback;
  if (next.length > 512) return fallback;
  if (!next.startsWith("/") || next.startsWith("//")) return fallback;
  if (hasUnsafeChars(next)) return fallback;
  try {
    const decoded = decodeURIComponent(next);
    if (decoded.startsWith("//") || hasUnsafeChars(decoded)) return fallback;
    if (new URL(next, "http://localhost").origin !== "http://localhost") return fallback;
  } catch {
    return fallback;
  }
  return next;
}

const PRIVATE_PREFIXES = ["/partidas", "/metas", "/ajustes", "/cuenta"] as const;

/** Private pages: "/", /partidas/**, /metas, /ajustes, /cuenta. Everything else is public. */
export function isPrivatePath(pathname: string): boolean {
  if (pathname === "/") return true;
  return PRIVATE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}
