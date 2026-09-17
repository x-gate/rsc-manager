import { expect, test } from "bun:test";
import { actionBounds, downloadName } from "../../src/resources/download";
import type { PreviewFrame } from "../../src/viewer/preview";
const frame = (
  x: number,
  y: number,
  flipX = false,
  flipY = false,
): PreviewFrame => ({
  x,
  y,
  flipX,
  flipY,
  image: {
    row: 1,
    width: 4,
    height: 6,
    offX: x,
    offY: y,
    rgba: new Uint8Array(96),
  },
});
test("PNG collection bounds align offsets and mirrors around the common origin", () => {
  expect(actionBounds([frame(-3, -5), frame(2, -2)])).toEqual({
    x: -3,
    y: -5,
    width: 9,
    height: 9,
  });
  expect(
    actionBounds([frame(-3, -5, true, true), frame(2, -2, true, true)]),
  ).toEqual({ x: -6, y: -4, width: 9, height: 9 });
});
test("PNG collection rejects incomplete and excessive exports before creating a canvas", () => {
  expect(() => actionBounds([])).toThrow("沒有影格");
  expect(() => actionBounds([{ x: 0, y: 0, error: "missing" }])).toThrow(
    "缺少",
  );
  expect(() => actionBounds(Array(4097).fill(frame(0, 0)))).toThrow("4096");
  expect(() => actionBounds([frame(-8192, 0), frame(8192, 0)])).toThrow("尺寸");
});
test("download names retain source and row identity without path separators", () => {
  expect(downloadName("Puk2/Graphic_PUK2_2", 1, 8)).toBe(
    "Puk2_Graphic_PUK2_2_id_1_row_8",
  );
});
