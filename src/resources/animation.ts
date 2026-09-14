import type { Palette } from "../../.generated/xglib/contract";
import type { Decoded } from "./protocol";

// CGTool AnimePlayer uses CycleTime / FrameCount in milliseconds.
export function animationInterval(
  duration: number,
  count: number,
  speed = 1,
  fixedFps = false,
) {
  const delay = count > 0 ? duration / count : 0;
  return (fixedFps || delay <= 0 ? 100 : delay) / speed;
}

export function animationFrame(image?: Decoded, error?: string, flags = 0) {
  const flipX = (flags & 1) !== 0,
    flipY = (flags & 2) !== 0;
  // The SpriteRenderer path mirrors the sprite around its GraphicInfo pivot.
  // Frame offsets remain metadata; they are not added to the Graphic offsets.
  return {
    image,
    x: image?.offX ?? 0,
    y: image?.offY ?? 0,
    flipX,
    flipY,
    error,
  };
}

export function animationEvent(flag: number) {
  return flag > 20000
    ? { effect: "命中", audio: flag - 20000 }
    : flag > 10000
      ? { effect: "攻擊結束", audio: flag - 10000 }
      : { effect: "無", audio: flag };
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
) {
  const rgba = new Uint8Array(width * height * 4);
  for (let i = 0; i < payload.length; i++) {
    const index = payload[i],
      color = palette.colors[index];
    if (!color) throw new Error("動畫色彩索引超出調色盤。");
    const target =
      ((height - 1 - Math.floor(i / width)) * width + (i % width)) * 4;
    rgba.set(
      [color.red, color.green, color.blue, index === 0 ? 0 : color.alpha],
      target,
    );
  }
  return rgba;
}
