import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * Hosts we are willing to send a server-side request to. Everything the
 * converter needs lives on Pinterest or its image CDN, so the allowlist stays
 * closed rather than trying to blocklist the rest of the internet.
 */
const ALLOWED_HOST_SUFFIXES = [
  "pinterest.com",
  "pinterest.co.uk",
  "pinterest.ca",
  "pinterest.com.au",
  "pinterest.de",
  "pinterest.fr",
  "pinterest.es",
  "pinterest.it",
  "pinterest.jp",
  "pinterest.nz",
  "pinterest.ie",
  "pinterest.se",
  "pinterest.ch",
  "pinterest.at",
  "pinterest.dk",
  "pinterest.ph",
  "pinterest.pt",
  "pinterest.cl",
  "pinterest.mx",
  "pinterest.ru",
  "pin.it",
  "pinimg.com",
];

const MAX_REDIRECTS = 5;
const FETCH_TIMEOUT_MS = 15_000;

export class UnsafeUrlError extends Error {}

export function isAllowedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix || host.endsWith(`.${suffix}`),
  );
}

/** Loopback, link-local, and RFC1918-style ranges we refuse to talk to. */
function isPrivateAddress(address: string, family: number): boolean {
  if (family === 4) {
    const parts = address.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n))) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0 || a === 10 || a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 100 && b >= 64 && b <= 127) return true;
    if (a >= 224) return true;
    return false;
  }

  const addr = address.toLowerCase();
  if (addr === "::" || addr === "::1") return true;
  // Unique-local (fc00::/7), link-local (fe80::/10), multicast (ff00::/8).
  if (/^f[cd]/.test(addr)) return true;
  if (/^fe[89ab]/.test(addr)) return true;
  if (addr.startsWith("ff")) return true;
  // IPv4-mapped, e.g. ::ffff:127.0.0.1
  const mapped = addr.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateAddress(mapped[1], 4);
  return false;
}

/**
 * Validates a URL for server-side fetching: https only, on an allowlisted
 * Pinterest host, resolving to a public address.
 */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeUrlError(`Not a valid URL: ${raw}`);
  }

  if (url.protocol !== "https:") {
    throw new UnsafeUrlError("Only https URLs are supported.");
  }
  if (!isAllowedHost(url.hostname)) {
    throw new UnsafeUrlError(
      `${url.hostname} is not a Pinterest host. Paste a pinterest.com or pinimg.com URL.`,
    );
  }

  // A literal IP can never be an allowlisted host, but check anyway so the
  // guard holds if the allowlist ever grows.
  if (isIP(url.hostname)) {
    if (isPrivateAddress(url.hostname, isIP(url.hostname))) {
      throw new UnsafeUrlError("Refusing to fetch a private address.");
    }
    return url;
  }

  const addresses = await lookup(url.hostname, { all: true });
  if (addresses.length === 0) {
    throw new UnsafeUrlError(`Could not resolve ${url.hostname}.`);
  }
  for (const { address, family } of addresses) {
    if (isPrivateAddress(address, family)) {
      throw new UnsafeUrlError(
        `${url.hostname} resolves to a private address; refusing to fetch it.`,
      );
    }
  }
  return url;
}

/**
 * `fetch` with the safety check re-applied at every hop, so an allowlisted host
 * cannot redirect us somewhere we would not have gone directly.
 */
export async function safeFetch(
  raw: string,
  init: RequestInit = {},
): Promise<Response> {
  let target = raw;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertSafeUrl(target);
    const response = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: {
        // Pinterest serves a stub page to unrecognised clients.
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
        "accept-language": "en-US,en;q=0.9",
        ...init.headers,
      },
    });

    const location = response.headers.get("location");
    if (response.status >= 300 && response.status < 400 && location) {
      target = new URL(location, url).toString();
      continue;
    }
    return response;
  }

  throw new UnsafeUrlError("Too many redirects.");
}
