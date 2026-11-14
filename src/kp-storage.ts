// ── Kaleidoprint persistence ──────────────────────────────────────────────────
// Everything is kept in IndexedDB (hundreds of MB available, unlike the ~5 MB
// localStorage cap), under one object store. Keys:
//   current-board   → the board you're working on (autosaved)
//   saved-boards    → [{ id, name, savedAt, board }]
//   clipart-library → uploaded clipart
//   border-tiles    → uploaded border tiles

const DB_NAME = "kaleidoprint";
const STORE = "kv";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function kvGet<T = any>(key: string): Promise<T | undefined> {
  try {
    const db = await openDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } catch { return undefined; }
}

export async function kvSet(key: string, value: any): Promise<boolean> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    return true;
  } catch { return false; }
}

export async function kvDel(key: string): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch { /* ignore */ }
}

// ── Board files (.json export / import) ───────────────────────────────────────
export const BOARD_FILE_VERSION = 1;

export function downloadBoardFile(name: string, board: any) {
  const payload = { app: "kaleidoprint", version: BOARD_FILE_VERSION, name, savedAt: new Date().toISOString(), board };
  const blob = new Blob([JSON.stringify(payload)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${(name || "board").replace(/[^\w\- ]+/g, "").trim() || "board"}.kaleidoprint.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readBoardFile(file: File): Promise<{ name: string; board: any }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(String(r.result));
        if (data?.app !== "kaleidoprint" || !data.board) throw new Error("Not a Kaleidoprint board file");
        resolve({ name: data.name || file.name.replace(/\.kaleidoprint\.json$|\.json$/i, ""), board: data.board });
      } catch (e) { reject(e); }
    };
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export const newId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
