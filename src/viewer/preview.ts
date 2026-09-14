import { Application, Container, Graphics, Sprite, Texture } from "pixi.js";
import type { Decoded } from "../resources/protocol";
export interface PreviewFrame {
  image?: Decoded;
  x: number;
  y: number;
  error?: string;
  flipX?: boolean;
  flipY?: boolean;
}
export function frameAt(elapsed: number, interval: number, count: number) {
  return count > 0
    ? Math.floor(Math.max(0, elapsed) / Math.max(Number.EPSILON, interval)) %
        count
    : 0;
}
export class Preview {
  private app = new Application();
  private world = new Container();
  private sprite = new Sprite();
  private cross = new Graphics();
  private textures = new Map<number, Texture>();
  private frames: PreviewFrame[] = [];
  private elapsed = 0;
  private interval = 100;
  private current = -1;
  private zoom = 1;
  private observer?: ResizeObserver;
  playing = false;
  onFrame: (index: number) => void = () => {};
  onZoom: (zoom: number) => void = () => {};
  async init(host: HTMLElement) {
    await this.app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: false,
      resolution: window.devicePixelRatio || 1,
      autoDensity: true,
    });
    host.append(this.app.canvas);
    this.app.canvas.setAttribute("aria-label", "資源預覽畫布");
    this.app.canvas.tabIndex = 0;
    this.cross
      .moveTo(-16, 0)
      .lineTo(16, 0)
      .moveTo(0, -16)
      .lineTo(0, 16)
      .stroke({ color: 0x63736d, width: 1 });
    this.world.addChild(this.cross, this.sprite);
    this.app.stage.addChild(this.world);
    this.app.ticker.add((ticker) => {
      if (this.playing && this.frames.length > 1) {
        this.elapsed += ticker.deltaMS;
        this.draw();
      }
    });
    let drag: { x: number; y: number; wx: number; wy: number } | undefined;
    this.app.canvas.addEventListener("pointerdown", (event) => {
      drag = {
        x: event.clientX,
        y: event.clientY,
        wx: this.world.x,
        wy: this.world.y,
      };
      this.app.canvas.setPointerCapture(event.pointerId);
    });
    this.app.canvas.addEventListener("pointermove", (event) => {
      if (drag)
        this.world.position.set(
          drag.wx + event.clientX - drag.x,
          drag.wy + event.clientY - drag.y,
        );
    });
    this.app.canvas.addEventListener("pointerup", () => {
      drag = undefined;
    });
    this.app.canvas.addEventListener("pointercancel", () => {
      drag = undefined;
    });
    this.app.canvas.addEventListener(
      "wheel",
      (event) => {
        event.preventDefault();
        this.setZoom(this.zoom * (event.deltaY > 0 ? 0.8 : 1.25));
      },
      { passive: false },
    );
    this.app.canvas.addEventListener("keydown", (event) => {
      if (event.key === "0") this.fit();
      else if (event.key === "+" || event.key === "=")
        this.setZoom(this.zoom * 1.25);
      else if (event.key === "-") this.setZoom(this.zoom / 1.25);
      else return;
      event.preventDefault();
    });
    this.observer = new ResizeObserver(() => {
      if (host.clientWidth && host.clientHeight) {
        // Pixi's resizeTo listens to window resize, not playback-panel changes.
        this.app.resize();
        this.fit();
      }
    });
    this.observer.observe(host);
  }
  clear() {
    this.playing = false;
    this.frames = [];
    this.sprite.texture = Texture.EMPTY;
    this.sprite.visible = false;
    for (const texture of this.textures.values()) texture.destroy(true);
    this.textures.clear();
    this.current = -1;
  }
  setFrames(frames: PreviewFrame[], interval: number) {
    this.clear();
    this.frames = frames;
    this.interval = interval;
    this.elapsed = 0;
    for (const { image } of frames) {
      if (!image || this.textures.has(image.row)) continue;
      const canvas = document.createElement("canvas");
      canvas.width = image.width;
      canvas.height = image.height;
      canvas
        .getContext("2d")!
        .putImageData(
          new ImageData(
            new Uint8ClampedArray(image.rgba),
            image.width,
            image.height,
          ),
          0,
          0,
        );
      const texture = Texture.from(canvas);
      texture.source.scaleMode = "nearest";
      this.textures.set(image.row, texture);
    }
    this.app.resize();
    this.fit();
    this.draw();
  }
  setInterval(interval: number) {
    this.elapsed = (this.elapsed / this.interval) * interval;
    this.interval = interval;
  }
  seek(index: number) {
    this.elapsed = index * this.interval;
    this.draw();
  }
  step(delta: number) {
    this.seek(
      (Math.max(0, this.current) + delta + this.frames.length) %
        Math.max(1, this.frames.length),
    );
  }
  setZoom(zoom: number) {
    this.zoom = Math.max(0.1, Math.min(16, zoom));
    this.world.scale.set(this.zoom);
    this.onZoom(this.zoom);
  }
  fit() {
    let minX = 0,
      minY = 0,
      maxX = 1,
      maxY = 1;
    for (const frame of this.frames)
      if (frame.image) {
        const x = frame.flipX ? -frame.x - frame.image.width : frame.x;
        const y = frame.flipY ? -frame.y - frame.image.height : frame.y;
        minX = Math.min(minX, x);
        minY = Math.min(minY, y);
        maxX = Math.max(maxX, x + frame.image.width);
        maxY = Math.max(maxY, y + frame.image.height);
      }
    this.setZoom(
      Math.min(
        4,
        (this.app.screen.width - 100) / (maxX - minX),
        (this.app.screen.height - 100) / (maxY - minY),
      ),
    );
    this.world.position.set(
      this.app.screen.width / 2 - ((minX + maxX) / 2) * this.zoom,
      this.app.screen.height / 2 - ((minY + maxY) / 2) * this.zoom,
    );
  }
  private draw() {
    const index = frameAt(this.elapsed, this.interval, this.frames.length);
    if (index === this.current) return;
    this.current = index;
    const frame = this.frames[index];
    this.sprite.visible = !!frame?.image;
    if (frame?.image) {
      this.sprite.texture = this.textures.get(frame.image.row)!;
      this.sprite.scale.set(frame.flipX ? -1 : 1, frame.flipY ? -1 : 1);
      this.sprite.position.set(
        frame.flipX ? -frame.x : frame.x,
        frame.flipY ? -frame.y : frame.y,
      );
    }
    this.onFrame(index);
  }
}
