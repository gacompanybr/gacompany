const META_PIXEL_ID = "913139828127240";
const TRACE_TIMEOUT_MS = 2_000;

const CONSENT_REQUIRED_COUNTRIES = new Set([
  "AT", "BE", "BG", "HR", "CY", "CZ", "DE", "DK", "EE", "ES", "FI", "FR",
  "GR", "HU", "IE", "IS", "IT", "LI", "LT", "LU", "LV", "MT", "NL", "NO",
  "PL", "PT", "RO", "SE", "SI", "SK", "GB", "BR",
]);

type MetaPixelFunction = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void;
  loaded?: boolean;
  queue?: unknown[][];
  push?: MetaPixelFunction;
  version?: string;
};

declare global {
  interface Navigator {
    globalPrivacyControl?: boolean;
  }

  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
  }
}

let initialization: Promise<boolean> | null = null;

function hasPrivacyOptOut() {
  return navigator.globalPrivacyControl === true || navigator.doNotTrack === "1";
}

async function getCountryCode() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), TRACE_TIMEOUT_MS);

  try {
    const response = await fetch("/cdn-cgi/trace", {
      cache: "no-store",
      credentials: "same-origin",
      signal: controller.signal,
    });
    if (!response.ok) return null;

    const match = (await response.text()).match(/^loc=([^\r\n]+)$/m);
    const country = match?.[1]?.trim().toUpperCase();
    if (!country || country === "XX" || country === "T1") return null;
    return country;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

function installPixel() {
  if (window.fbq) return;

  const fbq: MetaPixelFunction = (...args: unknown[]) => {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue?.push(args);
  };
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;

  const script = document.createElement("script");
  script.async = true;
  script.src = "https://connect.facebook.net/en_US/fbevents.js";
  script.dataset.metaPixel = META_PIXEL_ID;
  document.head.appendChild(script);

  fbq("init", META_PIXEL_ID);
  fbq("track", "PageView");
}

export function initializeMetaPixel() {
  if (initialization) return initialization;

  initialization = (async () => {
    if (hasPrivacyOptOut()) return false;

    const country = await getCountryCode();
    if (!country || CONSENT_REQUIRED_COUNTRIES.has(country)) return false;

    installPixel();
    return true;
  })();

  return initialization;
}

export async function trackMetaLead() {
  const enabled = await initializeMetaPixel();
  if (enabled) window.fbq?.("track", "Lead");
}