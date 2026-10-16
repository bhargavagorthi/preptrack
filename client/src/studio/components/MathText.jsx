import { useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";

const escapeHtml = (s) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const DOLLAR = "\uE000"; // stands in for an escaped \$ while we look for math
const TOKEN = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g; // $$display$$ or $inline$

// Turn "Find $\frac{dx}{dt}$ …" into safe HTML with rendered math
export function renderMath(text) {
  const src = String(text ?? "").replace(/\\\$/g, DOLLAR);
  let html = "";
  let last = 0;
  for (const m of src.matchAll(TOKEN)) {
    html += escapeHtml(src.slice(last, m.index)).replaceAll(DOLLAR, "$");
    const display = m[1] !== undefined;
    const expr = (display ? m[1] : m[2]).replaceAll(DOLLAR, "\\$");
    html += katex.renderToString(expr, { displayMode: display, throwOnError: false });
    last = m.index + m[0].length;
  }
  html += escapeHtml(src.slice(last)).replaceAll(DOLLAR, "$");
  return html;
}

export default function MathText({ text, as: Tag = "span", className = "" }) {
  const html = useMemo(() => renderMath(text), [text]);
  return <Tag className={`math-text ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}
