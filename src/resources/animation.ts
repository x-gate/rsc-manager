import type { Palette } from "../../.generated/xglib/contract";
import type { Decoded } from "./protocol";

// xgtool Anime.GIF uses integer centiseconds: duration / frame count / 10.
export function animationInterval(
  duration: number,
  count: number,
  speed = 1,
  fixedFps = false,
) {
  const delay = count > 0 ? Math.trunc(duration / count / 10) * 10 : 0;
  // A zero GIF delay has browser-specific playback semantics. Keep a documented
  // 10 FPS fallback instead of a hot loop or division by zero.
  return (fixedFps || delay <= 0 ? 100 : delay) / speed;
}

export function animationFrame(image?: Decoded, error?: string) {
  // The reference GIF uses a common top-left origin, without either offset.
  return { image, x: 0, y: 0, error };
}

export function rawPalette(palette: Palette) {
  return new Uint8Array(
    palette.colors.flatMap((c) => [c.blue, c.green, c.red]),
  );
}

export function animationRgba(
  payload: number[],
  palette: Palette,
  width: number,
  height: number,
  cgp: boolean,
) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < payload.length; i++) {
    const index = payload[i],
      color = palette.colors[index];
    if (!color) throw new Error("動畫色彩索引超出調色盤。");
    const { red, green, blue } = color;
    // xgtool color keys apply to raw/embedded palettes and CGP custom colors,
    // but not the fixed CGP prefix/suffix (including their pure RGB colors).
    const keyed = !cgp || (index >= 16 && index < 240);
    const transparent =
      [red, green, blue].every((c) => c === 0 || c === 255) &&
      [red, green, blue].filter((c) => c === 255).length <= 1;
    const alpha = keyed ? (transparent ? 0 : 255) : color.alpha;
    const target =
      ((height - 1 - Math.floor(i / width)) * width + (i % width)) * 4;
    rgba.set([red, green, blue, alpha], target);
  }
  return rgba;
}
