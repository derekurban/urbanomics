// Color mode for @derekurban/design-system: tokens switch on <html data-theme>.
// The palette itself belongs to the design system; this device only chooses light, dark or system.
const key = 'urbanomics.colorMode.v1';
export const colorModes = ['light', 'dark', 'system'];

export function readColorMode() {
  try {
    const saved = localStorage.getItem(key);
    return colorModes.includes(saved) ? saved : 'light';
  } catch {
    return 'light';
  }
}
export function applyColorMode(mode) {
  const value = colorModes.includes(mode) ? mode : 'light';
  document.documentElement.dataset.theme = value;
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
