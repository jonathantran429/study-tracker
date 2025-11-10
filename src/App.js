import React, { useEffect, useState, useRef, useLayoutEffect } from "react";
import "./App.css";
import { loadSessions, saveSessions } from "./db";

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

/**  default thresholds (seconds) 1s, 30 min, 1 hr, 2hr, 3hr, 4hr*/
const DEFAULT_THRESHOLDS = [1, 30 * 60,  60 * 60, 2 * 60 * 60, 3*60*60, 4*60*60, 5*60*60, 6*60*60, 7*60*60];

/** returns the color of a tile given the number of seconds studied, using DEFAULT_THRESHOLDS */
function colorForCount(seconds, thresholds = DEFAULT_THRESHOLDS) {
  if (!seconds || seconds <= 0) return "bg-gray-700";
  const [t1, t2, t3, t4, t5, t6, t7, t8, t9]  = thresholds;
  if (seconds >= t9) return "bg-green-200";
  if (seconds >= t8) return "bg-green-300";
  if (seconds >= t7) return "bg-green-400";
  if (seconds >= t6) return "bg-green-500";
  if (seconds >= t5) return "bg-green-600";
  if (seconds >= t4) return "bg-green-700";
  if (seconds >= t3) return "bg-green-800";
  if (seconds >= t2) return "bg-green-900";
  if (seconds >= t1) return "bg-green-950";
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
  const [filterRange, setFilterRange] = useState("year");

  // editing state
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const notesRef = useRef(null);

  useEffect(() => {
    // loading sessions into memory
    loadSessions()
      .then((stored) => {
        if (stored && stored.length > 0) {
          const normalized = stored.map((s) => {
            const session = { ...s };

            // handling if session end time doesn't exist
            if (!session.endAt && session.date) {
              const maybeMs = Number(session.date);
              if (!Number.isNaN(maybeMs)) session.endAt = maybeMs;
              else session.endAt = new Date(session.date).getTime();
            }
            
            // handling if the session start time doesn't exist
            if (!session.startAt) {
              if (session.durationMs)
                session.startAt = (session.endAt || Date.now()) - session.durationMs;
              else session.startAt = session.endAt || Date.now();
            }

            // handling if session duration doesn't exist
            session.durationMs =
              Number(session.durationMs) ||
              Math.max(0, (session.endAt || Date.now()) - session.startAt);

            // handling if session topic & notes don't exist 
            if (!session.topic) session.topic = "(no topic)";
            if (!session.notes) session.notes = "";

            return session;
          });
          
          // sort sessions from most recent to oldest
          normalized.sort((a, b) => (b.endAt || 0) - (a.endAt || 0));
          setSessions(normalized);
        }
      })
      .catch((err) => console.error("Failed to load sessions", err));
  }, []);

  useEffect(() => {
    if (sessions.length > 0) {
      saveSessions(sessions).catch((err) => console.error("Failed to save sessions", err));
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
  // determine how many days should display on heatmap depending on the date
  const today = new Date();
  const dayList = daysArray(365 + today.getDay());  
  const cutoff = getDateCutoff(filterRange);
  const filteredSessions = sessions.filter(
    (s) => (s.endAt || s.startAt) >= cutoff.getTime()
  );

  const countsByDay = {};     
  filteredSessions.forEach((sess) => {
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


  const TILE_SIZE = 15; 
  const TILE_GAP = 5;   

  const weekdaysStyle = {
    display: "grid",
    gridTemplateRows: `repeat(7, ${TILE_SIZE}px)`, 
    gridAutoFlow: "column",
    gap: `${TILE_GAP}px`, 
    alignItems: "center",
    justifyContent: "center", 
    width: "max-content", 
  }

  const gridStyle = {
    display: "grid",    
    gridTemplateRows: `repeat(7, ${TILE_SIZE}px)`, 
    gridAutoFlow: "column",
    gridAutoColumns: `${TILE_SIZE}px`, 
    gap: `${TILE_GAP}px`, 
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

  function getDateCutoff(range) {
    const now = new Date();
    switch (range) {
      case "week":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      case "2weeks":
        return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000 * 2);
      case "month":
        return new Date(now.setMonth(now.getMonth() - 1));
      case "3months":
        return new Date(now.setMonth(now.getMonth() - 3));
      case "6months":
        return new Date(now.setMonth(now.getMonth() - 6));
      case "year":
      default:
        return new Date(now.setFullYear(now.getFullYear() - 1));
    }
  }

  // auto-resize notes textarea while editing
  useLayoutEffect(() => {
    if (!notesRef.current) return;
    const el = notesRef.current;

    requestAnimationFrame(() => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight + 2}px`; // add small buffer
    });
  }, [editDraft]);
  
  // sum up the time across all sessions, store average time per day
  const totalTime = filteredSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
  const { hh, mm, ss } = secondsToHMS(Math.floor(totalTime / 1000));
  const { hh: avgHHPerDay, mm: avgMMPerDay, ss: avgSSPerDay } = secondsToHMS(Math.floor(totalTime / 1000 / Object.keys(countsByDay).length));

  return (
    <div className="min-h-screen bg-black text-white p-6 overflow-x-hidden">

      {/* 
      Stopwatch Area 
      */}
      <div className="p-4 rounded-lg shadow-sm mb-6 flex flex-col items-center">

        <div className="text-4xl font-mono mb-4">{formatDuration(currentElapsed)}</div>

        <div className="space-x-2 mb-4">
          {!isRunning && elapsedOffset === 0 && (
            <button onClick={handleStart} className="px-4 py-2 font-mono rounded bg-green-600 text-white">▶️</button>
          )}
          {isRunning && (
            <button onClick={handlePause} className="px-4 py-2 font-mono rounded bg-yellow-500 text-black">⏸️</button>
          )}
          {!isRunning && elapsedOffset > 0 && (
            <button onClick={handleResume} className="px-4 py-2 font-mono rounded bg-green-600 text-white">▶️</button>
          )}
          <button onClick={handleStopAndSave} className="px-4 py-2 font-mono rounded bg-blue-600 text-white">💾</button>
        </div>
      </div>



      {/* 
      Heatmap Area 
      */}
      <div className="p-4 rounded-lg shadow-sm mb-6 flex flex-col items-center">    
         <div className="flex justify-center w-full gap-x-2">
            <div style={weekdaysStyle}>
              <div className="font-mono text-sm text-right">Su</div>
              <div className="font-mono text-sm text-right">Mo</div>
              <div className="font-mono text-sm text-right">Tu</div>
              <div className="font-mono text-sm text-right">We</div>
              <div className="font-mono text-sm text-right">Th</div> 
              <div className="font-mono text-sm text-right">Fr</div>
              <div className="font-mono text-sm text-right">Sa</div> 
            </div>
            <div className="custom-scrollbar overflow-x-auto">
              <div style={gridStyle} className="custom-scrollbar">
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
                    className={`rounded-sm border border-gray-700 ${cls}`}
                    style={{ width: TILE_SIZE, height: TILE_SIZE }}
                  />
                );
              })}
              </div>
            </div>
         </div>
      </div>



      {/* 
      Logs and stats area 
      */}
      <div className=" flex flex-col items-center">
        <button
          onClick={() => setLogOpen(!logOpen)}
          className="text-2xl font-semibold mb-3 flex flex-col items-center"
        >
          {logOpen ? "▲" : "▼"} 
        </button>

        {logOpen && (
          <div className="p-4 rounded-lg shadow-sm mb-6 flex flex-col items-center">
                  <div className="text-gray-500 font-mono text-center">
                    {hh}h {mm}m {ss}s / total<br></br>
                    {avgHHPerDay}h {avgMMPerDay}m {avgSSPerDay}s / avg study day
                  </div>
                  <br></br>

                  {/*
                  Filter by date dropdown.
                  */}
                  <div className="flex justify-center mb-2">
                  <select
                    value={filterRange}
                    onChange={(e) => setFilterRange(e.target.value)}
                    className="bg-gray-800 text-white rounded px-1 py-1 font-mono"
                  >
                    <option value="week">Past Week</option>
                    <option value="2weeks">Past 2 Weeks</option>
                    <option value="month">Past Month</option>
                    <option value="3months">Past 3 Months</option>
                    <option value="6months">Past 6 Months</option>
                    <option value="year">Past Year</option>
                  </select>
                  </div>
                  
                  {/*
                  Session logs list.
                  */}
                  <div className="space-y-3">
                    {filteredSessions.length === 0 && <div className="text-gray-500 font-mono">No sessions recorded yet.</div>}
                    {filteredSessions.map((s) => (  

                      /*
                      * Editing session html
                      */ 
                      <div key={s.id} className="p-3 border border-gray-700 rounded">
                        {editingId === s.id && editDraft ? (
                          <div>
                            <div className="text-sm text-gray-400 mb-1 font-mono">Editing session</div>
                            <div className="text-lg font-medium mb-2 font-mono">{formatDuration(editDraft.durationMs || 0)}</div>

                            <div className="grid grid-cols-1 gap-2 mb-2">
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

                            {/* 
                            Start time datepicker field 
                            */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-2">
                              <div>
                                <label className="block text-xs text-gray-400 font-mono">Start (local) - Use date picker</label>
                                <input
                                  type="datetime-local"
                                  value={toLocalDatetimeString(editDraft.startAt)}
                                  onChange={(e) =>
                                    setEditDraft((d) => ({
                                      ...d,
                                      startAt: fromLocalDatetimeString(e.target.value),
                                    }))
                                  }
                                  onKeyDown={(e) => e.preventDefault()} // disable manual typing
                                  onPaste={(e) => e.preventDefault()}   // disable paste
                                  className="mt-1 w-full border border-gray-600 bg-gray-800 text-white rounded px-2 py-1 font-mono"
                                  style={{ cursor: "pointer" }}
                                />
                              </div>

                              {/* 
                              End time datepicker field 
                              */}
                              <div>
                                <label className="block text-xs text-gray-400 font-mono">End (local) - Use date picker</label>
                                <input
                                  type="datetime-local"
                                  value={toLocalDatetimeString(editDraft.endAt)}
                                  onChange={(e) =>
                                    setEditDraft((d) => ({
                                      ...d,
                                      endAt: fromLocalDatetimeString(e.target.value),
                                    }))
                                  }
                                  onKeyDown={(e) => e.preventDefault()} // disable manual typing field
                                  onPaste={(e) => e.preventDefault()}   // disable paste
                                  className="mt-1 w-full border border-gray-600 bg-gray-800 text-white rounded px-2 py-1 font-mono"
                                  style={{ cursor: "pointer" }}
                                />
                              </div>
                            </div>
                            
                            {/* 
                            Save and cancel edit buttons 
                            */}
                            <div className="flex items-center gap-2">
                              <button onClick={saveEdit} className="px-3 py-1 rounded bg-green-600 text-white font-mono">Save</button>
                              <button onClick={cancelEdit} className="px-3 py-1 rounded bg-gray-700 text-white font-mono">Cancel</button>
                            </div>
                          </div>
                        ) : (

                          // Not editing session (normal display) html
                          <div>
                            <div className="text-sm text-gray-400 font-mono">{new Date(s.startAt).toLocaleString()} — {new Date(s.endAt).toLocaleString()}</div>
                            <div className="text-lg font-medium mb-2 font-mono">{formatDuration(s.durationMs)}</div>

                            <div className="mb-2">
                              <div className="text-xs text-gray-400 font-mono">Topic</div>
                              <div className="text-sm font-mono break-words">{s.topic}</div>
                            </div>

                            <div className="mb-2">
                              <div className="text-xs text-gray-400 font-mono">Notes</div>
                              <div className="whitespace-pre-wrap text-sm font-mono break-words max-w-[1300px]">{s.notes}</div>
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