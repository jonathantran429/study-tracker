import React, { useEffect, useState, useRef, useLayoutEffect } from "react";

/** returns a time in hh:mm:ss form given a ms */ 
function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const hh = Math.floor(s / 3600)
    .toString()
    .padStart(2, "0");
  const mm = Math.floor((s % 3600) / 60)
    .toString()
    .padStart(2, "0");
  const ss = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

/** returns a string representing given date in mm-dd-yyyy form */
function startOfDayISO(tsOrDate) {
  const d = new Date(tsOrDate);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

/** returns an array of Date objects representing each of the last 365 (default) days */ 
function daysArray(days = 365) {
  const arr = [];
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const base = today.getTime();
  for (let i = days - 1; i >= 0; i--) {
    const ts = base - i * MS_PER_DAY;
    arr.push(new Date(ts));
  }
  return arr;
}

/**  default thresholds (seconds) 1s, 30 min, 1 hr, 2hr, 3hr, 4hr, 5hr */
const DEFAULT_THRESHOLDS = [1, 30 * 60,  60 * 60, 2 * 60 * 60, 3*60*60];

/** returns the color of a tile given the number of seconds studied, using DEFAULT_THRESHOLDS */
function colorForCount(seconds, thresholds = DEFAULT_THRESHOLDS) {
  if (!seconds || seconds <= 0) return "bg-gray-700";
  const [t1, t2, t3, t4, t5]  = thresholds;
  if (seconds >= t5) return "bg-green-600";
  if (seconds >= t4) return "bg-green-500";
  if (seconds >= t3) return "bg-green-400";
  if (seconds >= t2) return "bg-green-300";
  if (seconds >= t1) return "bg-green-200";
  return "bg-gray-700";
}

/** returns {hours, minutes, seconds} in an array, given a number of seconds */
function secondsToHMS(sec) {
  const s = Math.floor(sec);
  const hh = Math.floor(s / 3600);
  const mm = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return { hh, mm, ss };
}

/** returns a given string padded with 2 zeros*/
function pad(n) {
  return n.toString().padStart(2, "0");
}

/** returns a formatted local datetime string given a number of ms since start of day*/
function toLocalDatetimeString(ms) {
  if (ms === null || ms === undefined) return "";
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

/** returns a Date object representing the local datetime string,  
 * expected format: YYYY-MM-DDTHH:mm (value of input[type=datetime-local]) 
*/
function fromLocalDatetimeString(str) {
  if (!str) return null;
  // expected format: YYYY-MM-DDTHH:mm (value of input[type=datetime-local])
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  const hour = Number(m[4]);
  const minute = Number(m[5]);
  return new Date(year, month - 1, day, hour, minute).getTime();
}

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [startAt, setStartAt] = useState(null);
  const [elapsedOffset, setElapsedOffset] = useState(0);
  const [tick, setTick] = useState(0);
  const tickRef = useRef(null);
  const [sessions, setSessions] = useState([]);
  const [logOpen, setLogOpen] = useState(false);

  // editing state
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const notesRef = useRef(null);

  // loading sessions from local storage into memory
  useEffect(() => {
    try {
      const raw = localStorage.getItem("study_sessions_v1");
      if (raw) {
        const parsed = JSON.parse(raw);
        const normalized = parsed.map((s) => {
          const session = { ...s };
          if (!session.endAt && session.date) {
            const maybeMs = Number(session.date);
            if (!Number.isNaN(maybeMs)) session.endAt = maybeMs;
            else session.endAt = new Date(session.date).getTime();
          }
          if (!session.startAt) {
            if (session.durationMs) session.startAt = (session.endAt || Date.now()) - session.durationMs;
            else session.startAt = session.endAt || Date.now();
          }
          session.durationMs = Number(session.durationMs) || Math.max(0, (session.endAt || Date.now()) - session.startAt);
          if (!session.topic) session.topic = "(no topic)";
          if (!session.notes) session.notes = "";
          return session;
        });
        setSessions(normalized);
      }
    } catch (e) {
      console.error("Failed to load sessions", e);
    }
  }, []);

  // saving sessions from memory into local storage
  useEffect(() => {
    try {
      localStorage.setItem("study_sessions_v1", JSON.stringify(sessions));
    } catch (e) {
      console.error("Failed to save sessions", e);
    }
  }, [sessions]);

  useEffect(() => {
    if (isRunning) {
      tickRef.current = setInterval(() => setTick((t) => t + 1), 500);
    } else {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    return () => clearInterval(tickRef.current);
  }, [isRunning]);

  const currentElapsed = isRunning ? Date.now() - startAt + elapsedOffset : elapsedOffset;

  function handleStart() {
    if (isRunning) return;
    const now = Date.now();
    setStartAt(now);
    setIsRunning(true);
  }

  function handlePause() {
    if (!isRunning) return;
    setElapsedOffset((prev) => prev + (Date.now() - startAt));
    setStartAt(null);
    setIsRunning(false);
  }

  function handleResume() {
    if (isRunning) return;
    setStartAt(Date.now());
    setIsRunning(true);
  }

  function handleStopAndSave() {
    const endTime = Date.now();
    const duration = isRunning ? endTime - startAt + elapsedOffset : elapsedOffset;
    if (duration <= 0) return;

    const session = {
      id: Math.random().toString(36).slice(2),
      endAt: endTime,
      startAt: endTime - duration,
      durationMs: duration,
      topic: "",
      notes: "",
    };

    setSessions((s) => [session, ...s]);
    setIsRunning(false);
    setStartAt(null);
    setElapsedOffset(0);
  }

  function deleteSession(id) {
    setSessions((prev) => prev.filter((s) => s.id !== id));
  }

  // begin compute heatmap counts per day (seconds)
  const dayList = daysArray(365);
  const countsByDay = {};
  sessions.forEach((sess) => {
    const start = sess.startAt || (sess.endAt ? sess.endAt - sess.durationMs : null);
    const end = sess.endAt || (sess.startAt ? sess.startAt + sess.durationMs : null);
    const sMs = typeof start === "number" ? start : new Date(start).getTime();
    const eMs = typeof end === "number" ? end : new Date(end).getTime();
    if (!sMs || !eMs || eMs <= sMs) return;

    let cursor = sMs;
    while (cursor < eMs) {
      const dayEnd = new Date(new Date(cursor).setHours(24, 0, 0, 0));
      const segEnd = Math.min(eMs, dayEnd.getTime());
      const seconds = Math.round((segEnd - cursor) / 1000);
      const key = startOfDayISO(cursor);
      countsByDay[key] = (countsByDay[key] || 0) + seconds;
      cursor = segEnd;
    }
  });

  const gridStyle = {
    display: "grid",
    gridTemplateRows: "repeat(7, 12px)",
    gridAutoFlow: "column",
    gridAutoColumns: "12px",
    gap: "4px",
    alignItems: "center",
    justifyContent: "center", 
    overflowX: "auto",
    width: "max-content",     
  };


  // editing helpers
  function openEditor(session) {
    setEditingId(session.id);
    setEditDraft({ ...session });
    // delay to allow textarea ref to exist before measuring
    setTimeout(() => {
      if (notesRef.current) {
        notesRef.current.style.height = "auto";
        notesRef.current.style.height = `${notesRef.current.scrollHeight}px`;
      }
    }, 0);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditDraft(null);
  }

  function saveEdit() {
    if (!editDraft) return;
    const sa = Number(editDraft.startAt);
    const ea = Number(editDraft.endAt);
    if (Number.isNaN(sa) || Number.isNaN(ea) || ea <= sa) {
      alert("Please enter a valid start and end time (end must be after start)");
      return;
    }
    // ensure topic & notes are strings
    editDraft.topic = editDraft.topic || "(no topic)";
    editDraft.notes = editDraft.notes || "";
    editDraft.durationMs = ea - sa;

    setSessions((prev) => prev.map((s) => (s.id === editingId ? { ...s, ...editDraft } : s)));
    setEditingId(null);
    setEditDraft(null);
  }

  // auto-resize notes textarea while editing
  useLayoutEffect(() => {
    if (notesRef.current) {
      notesRef.current.style.height = "auto";
      notesRef.current.style.height = `${notesRef.current.scrollHeight}px`;
    }
  }, [editDraft]);
  
  // total time across all sessions
  const totalTime = sessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
  const { hh, mm, ss } = secondsToHMS(Math.floor(totalTime / 1000));

  return (
    <div className="min-h-screen w-screen bg-black text-white p-6 overflow-x-hidden">

      <div className="p-4 rounded-lg shadow-sm mb-6 flex flex-col items-center">

        <div className="text-4xl font-mono mb-4">{formatDuration(currentElapsed)}</div>

        <div className="space-x-2 mb-4">
          {!isRunning && elapsedOffset === 0 && (
            <button onClick={handleStart} className="px-4 py-2 font-mono rounded bg-green-600 text-white">Start</button>
          )}
          {isRunning && (
            <button onClick={handlePause} className="px-4 py-2 font-mono rounded bg-yellow-500 text-black">Pause</button>
          )}
          {!isRunning && elapsedOffset > 0 && (
            <button onClick={handleResume} className="px-4 py-2 font-mono rounded bg-green-500 text-white">Resume</button>
          )}
          <button onClick={handleStopAndSave} className="px-4 py-2 font-mono rounded bg-blue-600 text-white">Save</button>
        </div>
      </div>


      <div className="p-4 rounded-lg shadow-sm mb-6 flex flex-col items-center">
         <div className="flex justify-center w-full">
            <div style={gridStyle}>
            {dayList.map((d) => {
              const key = startOfDayISO(d);
              const seconds = countsByDay[key] || 0;
              const cls = colorForCount(seconds);
              const { hh, mm, ss } = secondsToHMS(seconds);
              const tooltip = `${key} — ${hh}h ${mm}m ${ss}s`;
              return (  
                <div
                  key={key}
                  title={tooltip}
                  className={`w-3 h-3 rounded-sm border border-gray-700 ${cls}`}
                  style={{ width: 12, height: 12 }}
                />
              );
            })}
            </div>
         </div>
      </div>

      <div className=" flex flex-col items-center">
        <button
          onClick={() => setLogOpen(!logOpen)}
          className="text-2xl font-semibold mb-3 flex flex-col items-center"
        >
          {logOpen ? "▲" : "▼"} 
        </button>

        {logOpen && (
          <div className="p-4 rounded-lg shadow-sm mb-6 flex flex-col items-center">
                  <div className="text-gray-500 font-mono">
                    {hh}h {mm}m {ss}s
                  </div>
                  <div className="space-y-3">
                    {sessions.length === 0 && <div className="text-gray-500 font-mono">No sessions recorded yet.</div>}
                    {sessions.map((s) => (
                      <div key={s.id} className="p-3 border border-gray-700 rounded">
                        {editingId === s.id && editDraft ? (
                          <div>
                            <div className="text-sm text-gray-400 mb-1 font-mono">Editing session</div>
                            <div className="text-lg font-medium mb-2 font-mono">{formatDuration(editDraft.durationMs || 0)}</div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                              <div>
                                <label className="block text-xs text-gray-400 font-mono">Topic</label>
                                <input
                                  value={editDraft.topic}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, topic: e.target.value }))}
                                  className="mt-1 w-full border border-gray-600 bg-gray-800 text-white rounded px-2 py-1 font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 font-mono">Notes</label>
                                <textarea
                                  ref={notesRef}
                                  value={editDraft.notes}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, notes: e.target.value }))}
                                  className="mt-1 w-full border border-gray-600 bg-gray-800 text-white rounded px-2 py-1 font-mono"
                                  rows={3}
                                  style={{ resize: "none", overflow: "hidden" }}
                                />
                              </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                              <div>
                                <label className="block text-xs text-gray-400 font-mono">Start (local)</label>
                                <input
                                  type="datetime-local"
                                  value={toLocalDatetimeString(editDraft.startAt)}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, startAt: fromLocalDatetimeString(e.target.value) }))}
                                  className="mt-1 w-full border border-gray-600 bg-gray-800 text-white rounded px-2 py-1 font-mono"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-400 font-mono">End (local)</label>
                                <input
                                  type="datetime-local"
                                  value={toLocalDatetimeString(editDraft.endAt)}
                                  onChange={(e) => setEditDraft((d) => ({ ...d, endAt: fromLocalDatetimeString(e.target.value) }))}
                                  className="mt-1 w-full border border-gray-600 bg-gray-800 text-white rounded px-2 py-1 font-mono"
                                />
                              </div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button onClick={saveEdit} className="px-3 py-1 rounded bg-green-600 text-white font-mono">Save</button>
                              <button onClick={cancelEdit} className="px-3 py-1 rounded bg-gray-700 text-white font-mono">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div>
                            <div className="text-sm text-gray-400 font-mono">{new Date(s.startAt).toLocaleString()} — {new Date(s.endAt).toLocaleString()}</div>
                            <div className="text-lg font-medium mb-2 font-mono">{formatDuration(s.durationMs)}</div>

                            <div className="mb-2">
                              <div className="text-xs text-gray-400 font-mono">Topic</div>
                              <div className="text-sm font-mono">{s.topic}</div>
                            </div>

                            <div className="mb-2">
                              <div className="text-xs text-gray-400 font-mono">Notes</div>
                              <div className="whitespace-pre-wrap text-sm font-mono">{s.notes}</div>
                            </div>

                            <div className="flex items-center gap-2">
                              <button onClick={() => openEditor(s)} className="px-3 py-1 border border-gray-600 rounded text-sm font-mono">Edit</button>
                              <button
                                onClick={() => deleteSession(s.id)}
                                className="px-3 py-1 border border-gray-600 rounded text-sm text-red-400 font-mono"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
        )}
      </div>
    </div>
  );
}
