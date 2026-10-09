/**
 * Optional DOM debug panel for non-XR (fixture / desktop) views.
 * Hidden while an XR session is presenting so the in-XR UIKitML panel
 * is the only overlay on-device.
 */

const ROOT_ID = 'rq-debug-overlay';

export function ensureDomDebugOverlay(): HTMLElement {
  const existing = document.getElementById(ROOT_ID);
  if (existing) return existing;

  const el = document.createElement('pre');
  el.id = ROOT_ID;
  el.dataset.rqDebug = '1';
  el.setAttribute('aria-hidden', 'true');
  el.style.position = 'fixed';
  el.style.top = '12px';
  el.style.right = '12px';
  el.style.zIndex = '9999';
  el.style.margin = '0';
  el.style.padding = '12px 14px';
  el.style.borderRadius = '10px';
  el.style.background = 'rgba(12, 20, 32, 0.88)';
  el.style.color = '#e8f4ff';
  el.style.fontFamily =
    'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
  el.style.fontSize = '13px';
  el.style.lineHeight = '18px';
  el.style.letterSpacing = '0.02em';
  el.style.whiteSpace = 'pre';
  el.style.pointerEvents = 'none';
  el.style.userSelect = 'none';
  document.body.appendChild(el);
  return el;
}

export function syncDomDebugOverlay(
  text: string,
  presenting: boolean
): void {
  const el = ensureDomDebugOverlay();
  el.style.display = presenting ? 'none' : 'block';
  if (!presenting && el.textContent !== text) {
    el.textContent = text;
  }
}

export function disposeDomDebugOverlay(): void {
  document.getElementById(ROOT_ID)?.remove();
}
