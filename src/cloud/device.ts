export interface CurrentDeviceInfo {
  id: string;
  label: string;
  device: string;
  browser: string;
}

const DEVICE_ID_KEY = "blitzidee-device-id";

function getDeviceId() {
  try {
    const stored = localStorage.getItem(DEVICE_ID_KEY);
    if (stored) return stored;
    const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
    return id;
  } catch {
    return "temporäres-gerät";
  }
}

export function describeCurrentDevice(userAgent: string, platform: string, maxTouchPoints = 0) {
  const device = /iPad/i.test(userAgent) || (/Mac/i.test(platform) && maxTouchPoints > 1)
    ? "iPad"
    : /iPhone/i.test(userAgent)
      ? "iPhone"
      : /Android/i.test(userAgent)
        ? "Android-Gerät"
        : /Win/i.test(platform)
          ? "Windows-PC"
          : /Mac/i.test(platform)
            ? "Mac"
            : "Dieses Gerät";
  const browser = /Edg\//i.test(userAgent)
    ? "Edge"
    : /CriOS|Chrome\//i.test(userAgent)
      ? "Chrome"
      : /FxiOS|Firefox\//i.test(userAgent)
        ? "Firefox"
        : /Safari\//i.test(userAgent)
          ? "Safari"
          : "Browser";
  return { device, browser, label: `${device} · ${browser}` };
}

export function getCurrentDeviceInfo(): CurrentDeviceInfo {
  const description = describeCurrentDevice(navigator.userAgent, navigator.platform, navigator.maxTouchPoints);
  return { id: getDeviceId(), ...description };
}
