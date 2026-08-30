/**
 * Utility to parse User-Agent header and Referrer header into structured metadata
 */

export function parseUserAgent(uaString = "") {
  const ua = uaString.toLowerCase();

  // 1. Detect Browser
  let browser = "Other";
  if (ua.includes("edg/")) {
    browser = "Edge";
  } else if (ua.includes("chrome") || ua.includes("crios")) {
    browser = "Chrome";
  } else if (ua.includes("firefox") || ua.includes("fxios")) {
    browser = "Firefox";
  } else if (ua.includes("safari") && !ua.includes("chrome")) {
    browser = "Safari";
  } else if (ua.includes("opera") || ua.includes("opr/")) {
    browser = "Opera";
  }

  // 2. Detect Operating System
  let os = "Other";
  if (ua.includes("win")) {
    os = "Windows";
  } else if (ua.includes("android")) {
    os = "Android";
  } else if (ua.includes("iphone") || ua.includes("ipad") || ua.includes("ipod")) {
    os = "iOS";
  } else if (ua.includes("mac")) {
    os = "macOS";
  } else if (ua.includes("linux")) {
    os = "Linux";
  }

  // 3. Detect Device Type
  let device = "Desktop";
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
    device = "Mobile";
  } else if (ua.includes("ipad") || ua.includes("tablet")) {
    device = "Tablet";
  }

  return { browser, os, device };
}

export function parseReferrer(refererHeader = "") {
  if (!refererHeader || refererHeader.trim() === "") {
    return "Direct / None";
  }

  try {
    const url = new URL(refererHeader);
    let hostname = url.hostname.replace(/^www\./, "");
    if (hostname.includes("google")) return "Google";
    if (hostname.includes("twitter") || hostname.includes("t.co") || hostname.includes("x.com")) return "Twitter / X";
    if (hostname.includes("facebook") || hostname.includes("fb.com")) return "Facebook";
    if (hostname.includes("linkedin")) return "LinkedIn";
    if (hostname.includes("github")) return "GitHub";
    if (hostname.includes("reddit")) return "Reddit";
    return hostname;
  } catch (e) {
    return "Direct / None";
  }
}
