/**
 * Copy text to clipboard. Works on plain HTTP (non-secure context) too.
 *
 * navigator.clipboard requires HTTPS or localhost; Lumen is often opened via
 * http://IP:3000 — so we fall back to a hidden textarea + execCommand.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  const value = String(text ?? "");
  if (!value) return false;

  const hapticOk = () => {
    try {
      void import("./telegram").then((m) => m.hapticNotification("success"));
    } catch {
      /* */
    }
  };

  // Preferred API (HTTPS / localhost / secure contexts)
  if (
    typeof navigator !== "undefined" &&
    typeof window !== "undefined" &&
    window.isSecureContext &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    try {
      await navigator.clipboard.writeText(value);
      hapticOk();
      return true;
    } catch {
      // fall through to legacy path
    }
  }

  // Legacy fallback — works on HTTP when triggered from a user gesture
  try {
    const ta = document.createElement("textarea");
    ta.value = value;
    ta.setAttribute("readonly", "");
    ta.setAttribute("aria-hidden", "true");
    // Avoid scrolling / visible flash; keep in viewport for iOS focus
    ta.style.position = "fixed";
    ta.style.top = "0";
    ta.style.left = "0";
    ta.style.width = "2em";
    ta.style.height = "2em";
    ta.style.padding = "0";
    ta.style.border = "none";
    ta.style.outline = "none";
    ta.style.boxShadow = "none";
    ta.style.background = "transparent";
    ta.style.opacity = "0";
    // Preserve newlines for multi-line docker commands
    ta.style.whiteSpace = "pre";

    document.body.appendChild(ta);

    // iOS Safari needs contentEditable + range selection sometimes
    const isIOS =
      /ipad|iphone|ipod/i.test(navigator.userAgent) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

    if (isIOS) {
      ta.contentEditable = "true";
      ta.readOnly = false;
      const range = document.createRange();
      range.selectNodeContents(ta);
      const sel = window.getSelection();
      sel?.removeAllRanges();
      sel?.addRange(range);
      ta.setSelectionRange(0, value.length);
    } else {
      ta.focus();
      ta.select();
      ta.setSelectionRange(0, value.length);
    }

    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    if (ok) hapticOk();
    return ok;
  } catch {
    return false;
  }
}
