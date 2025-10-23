import { openDB } from "idb";

const DB_NAME = "StudyTrackerDB";
const STORE_NAME = "sessions";
const DB_VERSION = 1;

// open the database
async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    },
  });
}

// save all sessions (overwrite everything)
export async function saveSessions(sessions) {
  const db = await getDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);

  await store.clear(); // remove old sessions
  for (const session of sessions) {
    await store.add(session);
  }

  await tx.done;
}

// load all sessions
export async function loadSessions() {
  const db = await getDB();
  let sessions = await db.getAll(STORE_NAME);

  // migrate from localStorage if IndexedDB is empty
  if (!sessions || sessions.length === 0) {
    const raw = localStorage.getItem("study_sessions_v1");
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        console.log("Migrating sessions from localStorage → IndexedDB...");
        await saveSessions(parsed);
        localStorage.removeItem("study_sessions_v1");
        sessions = parsed;
      } catch (e) {
        console.error("Migration failed:", e);
      }
    }
  }

  return sessions;
}
