// Color mode for @derekurban/design-system: tokens switch on <html data-theme>.
// The palette itself belongs to the design system; this device only chooses light, dark or system.
// A first run follows the computer's setting.
const key = 'urbanomics.colorMode.v1';
export const colorModes = ['light', 'dark', 'system'];

export function readColorMode() {
  try {
    const saved = localStorage.getItem(key);
    return colorModes.includes(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}
// Phone browsers tint their chrome with theme-color; keep it on the page background in every mode.
function syncThemeColor() {
  const meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) return;
  requestAnimationFrame(() => { meta.content = getComputedStyle(document.body || document.documentElement).backgroundColor; });
}
export function applyColorMode(mode) {
  const value = colorModes.includes(mode) ? mode : 'system';
  document.documentElement.dataset.theme = value;
  syncThemeColor();
  return value;
}
export function saveColorMode(mode) {
  const value = applyColorMode(mode);
  try { localStorage.setItem(key, value); } catch {}
  return value;
}

// Per-device palettes from before the design system no longer apply.
try { localStorage.removeItem('urbanomics.appearance.v1'); } catch {}
applyColorMode(readColorMode());
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', syncThemeColor);
