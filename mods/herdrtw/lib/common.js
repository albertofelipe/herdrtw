import { shared, layout } from "herdr";

export function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

export const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
export const fade = (c, a) => (/^#[0-9a-f]{6}$/i.test(c) ? `${c}${a}` : c);
export const clearChrome = (t) => (shared("layout") === "herdrtw" ? { ...t, chrome: fade(t.chrome, "00"), raised: fade(t.raised, "66"), selected: fade(t.selected, "66"), hover: fade(t.hover, "44"), border: fade(t.border, "88") } : t);
