// Sidebar layout for this device: pinned open, or a narrow icon rail that expands while hovered.
// The rail is the first-run default; the pin button stores the choice.
const key = 'urbanomics.sidebarPinned.v1';

export function readSidebarPinned() {
  try {
    return localStorage.getItem(key) === 'true';
  } catch {
    return false;
  }
}
export function saveSidebarPinned(pinned) {
  const value = Boolean(pinned);
  try { localStorage.setItem(key, String(value)); } catch {}
  return value;
}
