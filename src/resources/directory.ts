import { isResourcePath, type ResourceFile } from "./catalog";
// Local handles are stored, never the game bytes. Permission is requested only on a click.
export interface DirectoryHandle extends FileSystemDirectoryHandle {
  values(): AsyncIterableIterator<
    FileSystemDirectoryHandle | FileSystemFileHandle
  >;
  queryPermission(options: { mode: "read" }): Promise<PermissionState>;
  requestPermission(options: { mode: "read" }): Promise<PermissionState>;
}
export const directoryPicker = (
  window as unknown as {
    showDirectoryPicker?: (options: {
      mode: "read";
      id: string;
    }) => Promise<DirectoryHandle>;
  }
).showDirectoryPicker?.bind(window);
export async function scanDirectory(
  root: DirectoryHandle,
  cancelled: () => boolean = () => false,
): Promise<ResourceFile[]> {
  const files: ResourceFile[] = [];
  async function walk(handle: DirectoryHandle, path: string) {
    for await (const entry of handle.values()) {
      if (cancelled()) throw new DOMException("載入已取消。", "AbortError");
      const next = path ? `${path}/${entry.name}` : entry.name;
      if (entry.kind === "directory") {
        // Do not enumerate saves, executables, or unrelated personal files.
        if (
          (!path && /^assets$/i.test(entry.name)) ||
          (/^assets$/i.test(path) && /^bin$/i.test(entry.name)) ||
          /^assets\/bin(?:\/|$)/i.test(path)
        )
          await walk(entry as DirectoryHandle, next);
      } else if (isResourcePath(next)) {
        files.push({
          path: next,
          file: await (entry as FileSystemFileHandle).getFile(),
        });
      }
    }
  }
  await walk(root, "");
  return files;
}
async function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open("x-gate-rsc-manager", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("settings");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
export async function savedDirectory(
  value?: DirectoryHandle | null,
): Promise<DirectoryHandle | undefined> {
  const db = await database();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(
        "settings",
        value === undefined ? "readonly" : "readwrite",
      );
      const store = tx.objectStore("settings");
      const request =
        value === undefined
          ? store.get("directory")
          : value === null
            ? store.delete("directory")
            : store.put(value, "directory");
      tx.oncomplete = () =>
        resolve(value === undefined ? request.result : undefined);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}
