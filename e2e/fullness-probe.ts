// Shared by scripts/audit-page-fullness.mjs and e2e/page-fullness.spec.ts: measures the largest
// rectangle of the viewport with no content or decor (DESIGN §0, "full pages").
// Runs in the page; returns the largest empty region as a share of the viewport (0–1).
export const fullnessProbe = `(() => {
  const cols = 24;
  const rows = 32;
  const w = window.innerWidth;
  const h = window.innerHeight;
  const layout = new Set(["HTML", "BODY", "MAIN"]);
  const visual = new Set(["IMG", "PICTURE", "SVG", "CANVAS", "VIDEO", "INPUT", "BUTTON", "SELECT", "TEXTAREA", "IFRAME"]);
  function painted(element) {
    const style = getComputedStyle(element);
    if (style.backgroundImage !== "none") return true;
    const bg = style.backgroundColor;
    if (bg && bg !== "transparent" && !/rgba\\([^)]*,\\s*0\\)$/.test(bg)) return true;
    if (style.boxShadow !== "none") return true;
    if (parseFloat(style.borderTopWidth) > 0 && style.borderTopStyle !== "none") return true;
    return [...element.classList].some((name) => name.startsWith("decor-"));
  }
  function hasTextAt(element, x, y) {
    for (const node of element.childNodes) {
      if (node.nodeType !== 3 || !node.textContent.trim()) continue;
      const range = document.createRange();
      range.selectNodeContents(node);
      for (const rect of range.getClientRects())
        if (x >= rect.left - 4 && x <= rect.right + 4 && y >= rect.top - 4 && y <= rect.bottom + 4) return true;
    }
    return false;
  }
  function isContent(x, y) {
    let element = document.elementFromPoint(x, y);
    if (!element) return false;
    if (visual.has(element.tagName.toUpperCase())) return true;
    if (element.closest("svg")) return true;
    if (hasTextAt(element, x, y)) return true;
    for (let node = element; node && !layout.has(node.tagName); node = node.parentElement)
      if (painted(node)) return true;
    return false;
  }
  const empty = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      empty.push(!isContent(((c + 0.5) * w) / cols, ((r + 0.5) * h) / rows));
  // Largest axis-aligned empty rectangle (histogram method): a solid block of dead space, not
  // the ordinary gutters and gaps that wind between sections.
  const heights = new Array(cols).fill(0);
  let largest = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) heights[c] = empty[r * cols + c] ? heights[c] + 1 : 0;
    const stack = [];
    for (let c = 0; c <= cols; c++) {
      const height = c === cols ? 0 : heights[c];
      while (stack.length && heights[stack[stack.length - 1]] >= height) {
        const top = stack.pop();
        const left = stack.length ? stack[stack.length - 1] + 1 : 0;
        largest = Math.max(largest, heights[top] * (c - left));
      }
      stack.push(c);
    }
  }
  return largest / empty.length;
})()`;
