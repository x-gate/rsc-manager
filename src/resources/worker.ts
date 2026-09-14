import { initialize, parser } from "./wasm";
import { ResourceSession } from "./session";
import type { Request, Result } from "./protocol";
const ready = initialize();
const session = new ResourceSession(parser);
let queue = Promise.resolve();
self.onmessage = ({ data }: MessageEvent<{ id: number; request: Request }>) => {
  queue = queue.then(async () => {
    const { id, request } = data;
    try {
      await ready;
      let result: Result;
      const transfer: Transferable[] = [];
      switch (request.kind) {
        case "init":
          result = {
            kind: "init",
            ...(await session.initialize(
              request.graphic,
              request.anime,
              request.palette,
              request.paletteGraphic,
            )),
          };
          break;
        case "search":
          result = {
            kind: "search",
            ...session.search(request.type, request.query, request.offset),
          };
          break;
        case "resolve":
          result = { kind: "resolve", rows: session.resolve(request.id) };
          break;
        case "anime":
          result = {
            kind: "anime",
            value: await session.openAnime(request.row),
            paletteNote: session.animePaletteNote,
          };
          break;
        case "graphic": {
          const value = await session.decode(request.row, request.animeRow);
          result = { kind: "graphic", value };
          transfer.push(value.rgba.buffer);
          break;
        }
      }
      self.postMessage({ id, result }, { transfer });
    } catch (error) {
      self.postMessage({ id, error: String(error) });
    }
  });
};
