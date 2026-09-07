import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const color = (name: string) => css.match(new RegExp(`--${name}: (#[a-f0-9]{6})`))![1];
function luminance(hex: string) {
  const [r, g, b] = hex.slice(1).match(/../g)!.map((v) => {
    const n = parseInt(v, 16) / 255;
    return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

for (const [foreground, background] of [
  ["muted", "bg"], ["faint", "surface"], ["muted", "surface-3"],
  ["accent-ink", "accent"], ["accent", "accent-soft"],
  ["ok", "ok-soft"], ["warn", "warn-soft"], ["danger", "danger-soft"], ["hot", "hot-soft"],
  ["rail-ink", "rail-bg-2"],
]) {
  test(`${foreground} text on ${background} meets 7:1 contrast`, () => {
    const values = [luminance(color(foreground)), luminance(color(background))].sort((a, b) => b - a);
    const contrast = (values[0] + 0.05) / (values[1] + 0.05);
    assert.ok(contrast >= 7, `${foreground}/${background}: ${contrast.toFixed(2)}:1`);
  });
}
