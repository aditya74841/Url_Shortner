/**
 * URL Validator — Frontend Only
 * Uses Cloudflare DNS-over-HTTPS to check if a domain actually resolves.
 * Docs: https://developers.cloudflare.com/1.1.1.1/dns-over-https/json-format/
 *
 * DNS Status Codes:
 *   0 = NOERROR  → domain exists (valid)
 *   3 = NXDOMAIN → domain not found (invalid)
 *   2 = SERVFAIL → server failed (treat as unknown)
 */

const DOH_URL = 'https://cloudflare-dns.com/dns-query';

/**
 * Extracts a clean hostname from any user-typed string.
 * e.g. "google.com", "https://google.com/path", "www.google.com"
 * → "google.com"
 */
export function extractHostname(rawInput) {
  if (!rawInput || typeof rawInput !== 'string') return null;

  let input = rawInput.trim();

  // If no protocol, prepend one so URL parsing works
  if (!/^https?:\/\//i.test(input)) {
    input = `https://${input}`;
  }

  try {
    const { hostname } = new URL(input);
    // Must contain at least one dot and a valid TLD
    if (!hostname || !hostname.includes('.')) return null;
    return hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Checks if a hostname resolves in DNS via Cloudflare DoH.
 * Returns:
 *   'valid'   — domain has real A or AAAA records
 *   'invalid' — NXDOMAIN (domain doesn't exist)
 *   'unknown' — network error, timeout, or SERVFAIL
 */
export async function checkDomainResolvable(hostname) {
  if (!hostname) return 'unknown';

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s hard timeout

    const res = await fetch(
      `${DOH_URL}?name=${encodeURIComponent(hostname)}&type=A`,
      {
        headers: { Accept: 'application/dns-json' },
        signal: controller.signal,
      }
    );
    clearTimeout(timeoutId);

    if (!res.ok) return 'unknown';

    const data = await res.json();

    /**
     * data.Status codes:
     *   0 = NOERROR  → Check if Answer has records
     *   3 = NXDOMAIN → Definitively doesn't exist
     */
    if (data.Status === 3) return 'invalid';    // NXDOMAIN
    if (data.Status === 0) {
      // Has real answer records → valid
      if (data.Answer && data.Answer.length > 0) return 'valid';
      // Status 0 but no Answer can happen for subdomains → try AAAA
      const resAAAA = await fetch(
        `${DOH_URL}?name=${encodeURIComponent(hostname)}&type=AAAA`,
        { headers: { Accept: 'application/dns-json' }, signal: controller.signal }
      );
      if (resAAAA.ok) {
        const dataAAAA = await resAAAA.json();
        if (dataAAAA.Status === 0 && dataAAAA.Answer?.length > 0) return 'valid';
        if (dataAAAA.Status === 3) return 'invalid';
      }
      // CNAME-only or ambiguous → treat as valid (domain at least exists in DNS)
      return 'valid';
    }

    return 'unknown'; // SERVFAIL or other
  } catch (err) {
    if (err.name === 'AbortError') return 'unknown'; // timed out
    return 'unknown';
  }
}

// Debounce helper
export function debounce(fn, delay) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}
