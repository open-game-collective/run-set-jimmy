/**
 * Haptic tick on every touch. Android: Vibration API. iOS Safari has no Vibration API,
 * but toggling a native `<input type="checkbox" switch>` (iOS 18+) fires the system haptic.
 */
let iosSwitch: HTMLLabelElement | null = null;

function ensureIosSwitch(): HTMLLabelElement {
  if (iosSwitch) return iosSwitch;
  const label = document.createElement("label");
  label.setAttribute("aria-hidden", "true");
  label.style.cssText = "position:fixed;left:-100px;top:0;opacity:0;pointer-events:none";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.setAttribute("switch", "");
  label.appendChild(input);
  document.body.appendChild(label);
  iosSwitch = label;
  return label;
}

export function haptic(ms = 25): void {
  if (typeof navigator.vibrate === "function") {
    navigator.vibrate(ms);
    return;
  }
  ensureIosSwitch().click();
}
