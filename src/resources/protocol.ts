import type { Anime } from "../../.generated/xglib/contract";
import type { ResourceSet } from "./catalog";
export type Kind = "graphic" | "anime";
export interface Entry {
  row: number;
  id: number;
  addr: number;
  len: number;
  width?: number;
  height?: number;
  offX?: number;
  offY?: number;
  mapId?: number;
  actions?: number;
}
export interface Decoded {
  row: number;
  width: number;
  height: number;
  offX: number;
  offY: number;
  rgba: Uint8Array;
}
export type Request =
  | { kind: "init"; graphic: ResourceSet; anime?: ResourceSet; palette: File }
  | { kind: "search"; type: Kind; query: string; offset: number }
  | { kind: "graphic"; row: number }
  | { kind: "anime"; row: number }
  | { kind: "resolve"; id: number };
export type Result =
  | { kind: "init"; graphics: number; animes: number; duplicates: number }
  | { kind: "search"; entries: Entry[]; total: number }
  | { kind: "graphic"; value: Decoded }
  | { kind: "anime"; value: Anime }
  | { kind: "resolve"; rows: number[] };
