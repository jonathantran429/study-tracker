import React, { useEffect, useState, useRef, useLayoutEffect, useMemo, memo } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import { loadSessions, saveSessions } from "./db";
import useStopwatch from "./hooks/stopwatch";

// ==========================================
// UTILITY FUNCTIONS 
// ==========================================

const DEFAULT_THRESHOLDS = [1, 1800, 3600, 7200, 10800, 14400, 18000, 21600, 25200];
const TILE_SIZE = 15;
const TILE_GAP = 5;
const MS_PER_DAY = 86400000;
const MS_PER_SECOND = 1000;
const SEC_PER_HOUR = 3600;
const MIN_PER_HOUR = 60;
const HEATMAP_DAYS = 365;

const GRID_STYLE = {
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

const WEEKDAYS_STYLE = {
  display: "grid",
  gridTemplateRows: `repeat(7, ${TILE_SIZE}px)`,
  gap: `${TILE_GAP}px`,
  justifyContent: "center",
};


function copyStyles(sourceDoc, targetDoc) {
  Array.from(sourceDoc.styleSheets).forEach((styleSheet) => {
    try {
      if (styleSheet.cssRules) {
        const newStyleEl = targetDoc.createElement("style");
        Array.from(styleSheet.cssRules).forEach((cssRule) => {
          newStyleEl.appendChild(targetDoc.createTextNode(cssRule.cssText));
        });
        targetDoc.head.appendChild(newStyleEl);
      } else if (styleSheet.href) {
        const newLinkEl = targetDoc.createElement("link");
        newLinkEl.rel = "stylesheet";
        newLinkEl.href = styleSheet.href;
        targetDoc.head.appendChild(newLinkEl);
      }
    } catch (e) {
      console.warn("Could not copy a stylesheet:", e);
    }
  });
}

function formatDuration(ms) {
  const s = Math.floor(ms / MS_PER_SECOND);
  const hh = Math.floor(s / SEC_PER_HOUR).toString().padStart(2, "0");
  const mm = Math.floor((s % SEC_PER_HOUR) / MIN_PER_HOUR).toString().padStart(2, "0");
  const ss = Math.floor(s % MIN_PER_HOUR).toString().padStart(2, "0");
  return `${hh}:${mm}:${ss}`;
}

function startOfDayISO(tsOrDate) {
  const d = new Date(tsOrDate);
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

function daysArray(days = HEATMAP_DAYS) {
  const arr = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const base = today.getTime();
  for (let i = days - 1; i >= 0; i--) {
    arr.push(new Date(base - i * MS_PER_DAY));
  }
  return arr;
}

function colorForCount(seconds) {
  if (!seconds || seconds <= 0) return "bg-gray-700";
  const t = DEFAULT_THRESHOLDS;
  if (seconds >= t[8]) return "bg-green-200";
  if (seconds >= t[7]) return "bg-green-300";
  if (seconds >= t[6]) return "bg-green-400";
  if (seconds >= t[5]) return "bg-green-500";
  if (seconds >= t[4]) return "bg-green-600";
  if (seconds >= t[3]) return "bg-green-700";
  if (seconds >= t[2]) return "bg-green-800";
  if (seconds >= t[1]) return "bg-green-900";
  if (seconds >= t[0]) return "bg-green-950";
  return "bg-gray-700";
}

function secondsToHMS(sec) {
  const s = Math.floor(sec);
  return { 
    hh: Math.floor(s / SEC_PER_HOUR), 
    mm: Math.floor((s % SEC_PER_HOUR) / MIN_PER_HOUR), 
    ss: s % MIN_PER_HOUR 
  };
}

function toLocalDatetimeString(ms) {
  if (!ms) return "";
  const d = new Date(Number(ms));
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n) => n.toString().padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalDatetimeString(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function getDateCutoff(range) {
  const now = new Date();
  const cutoff = new Date(now); // Create copy
  switch (range) {
    case "week": cutoff.setDate(cutoff.getDate() - 7); break;
    case "2weeks": cutoff.setDate(cutoff.getDate() - 14); break;
    case "month": cutoff.setMonth(cutoff.getMonth() - 1); break;
    case "3months": cutoff.setMonth(cutoff.getMonth() - 3); break;
    case "6months": cutoff.setMonth(cutoff.getMonth() - 6); break;
    case "year": default: cutoff.setFullYear(cutoff.getFullYear() - 1); break;
  }
  return cutoff;
}

// ==========================================
// 2. ISOLATED TIMER COMPONENT
// ==========================================
/** * This component handles high-frequency updates.
 * The parent (App) only re-renders when onSessionComplete is called.
 */
const StopwatchSection = memo(({ onSessionComplete }) => {
  const stopwatch = useStopwatch();
  const [timerHidden, setTimerHidden] = useState(false);
  const [pipWindow, setPipWindow] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);

  // Handle opening/closing the Picture-in-Picture window
  const togglePiP = async () => {
    // If open, close it
    if (pipWindow) {
      pipWindow.close();
      setPipWindow(null);
      return;
    }

    // Check browser support
    if (!window.documentPictureInPicture) {
      alert("Your browser doesn't support Document Picture-in-Picture (Try Chrome or Edge).");
      return;
    }

    try {
      // 1. Request the window
      const pip = await window.documentPictureInPicture.requestWindow({
        width: 350,
        height: 200,
      });

      // 2. Copy all app styles (CSS/Tailwind) to the new window
      copyStyles(document, pip.document);

      // 3. Add background color to match app
      pip.document.body.style.backgroundColor = "black";
      pip.document.body.style.color = "white";
      pip.document.body.style.display = "flex";
      pip.document.body.style.justifyContent = "center";
      pip.document.body.style.alignItems = "center";

      // 4. Listen for close event (clicking X on the window)
      pip.addEventListener("pagehide", () => {
        setPipWindow(null);
      });

      setPipWindow(pip);
    } catch (err) {
      console.error("Failed to open PiP window:", err);
    }
  };

  const handleStopAndSave = () => {
    // If the timer is at 0, don't even bother confirming
    if (stopwatch.currentElapsed === 0) return;
    
    // Just show the inline UI instead of a browser popup
    setShowConfirm(true);
  };

  const confirmSave = () => {
    const result = stopwatch.stop();
    if (result) {
      onSessionComplete({
        ...result,
        id: Math.random().toString(36).slice(2),
        topic: "(no topic)",
        notes: "",
        tags: [],
      });
    }
    setShowConfirm(false);
  };

  {/* STOPWATCH CONTENT */}
  const stopwatchContent = (
    <div className="p-4 rounded-lg shadow-sm flex flex-col items-center bg-black w-full h-full justify-center">
      <div className="text-4xl font-mono mb-4">
        {timerHidden ? "--:--:--" : formatDuration(stopwatch.currentElapsed)}
      </div>

      {/* CONDITIONAL CONTROLS */}
      {showConfirm ? (
        <div className="flex flex-col items-center">
          <span className="text-xs font-mono text-blue-400 mb-2 font-bold uppercase tracking-widest">Confirm Save?</span>
          <div className="space-x-2 flex">
            <button 
              onClick={confirmSave} 
              className="px-4 py-2 font-mono rounded bg-blue-600 text-white border border-blue-400"
            >
              YES
            </button>
            <button 
              onClick={() => setShowConfirm(false)} 
              className="px-4 py-2 font-mono rounded bg-gray-700 text-white"
            >
              NO
            </button>
          </div>
        </div>
      ) : (
        <div className="space-x-2 mb-4 flex flex-wrap justify-center gap-y-2">
          {!stopwatch.isRunning && stopwatch.currentElapsed === 0 && (
            <button onClick={stopwatch.start} className="px-4 py-2 font-mono rounded bg-green-600 text-white" aria-label="Start">▶️</button>
          )}
          {stopwatch.isRunning && (
            <button onClick={stopwatch.pause} className="px-4 py-2 font-mono rounded bg-yellow-500 text-black" aria-label="Pause">⏸️</button>
          )}
          {!stopwatch.isRunning && stopwatch.currentElapsed > 0 && (
            <button onClick={stopwatch.resume} className="px-4 py-2 font-mono rounded bg-green-600 text-white" aria-label="Resume">▶️</button>
          )}
          
          {/* Only show save if there is time elapsed */}
          {stopwatch.currentElapsed > 0 && (
            <button onClick={handleStopAndSave} className="px-4 py-2 font-mono rounded bg-blue-600 text-white" aria-label="Save">💾</button>
          )}
          
          <button
            onClick={() => setTimerHidden(!timerHidden)}
            className="px-4 py-2 font-mono rounded bg-gray-700 text-white"
            aria-label={timerHidden ? "Show" : "Hide"}
          >
            {timerHidden ? "👁️" : "🙈"}
          </button>

          <button
            onClick={togglePiP}
            className="px-4 py-2 font-mono rounded bg-purple-600 text-white"
            title="Pop Out Player"
          >
            {pipWindow ? "🗙" : "🗖"}
          </button>
        </div>
      )}

      {pipWindow && !showConfirm && <div className="text-xs text-gray-500 font-mono mt-2">Always on top</div>}
    </div>
  );

  // If PiP is active, use a Portal to render content into the PiP window.
  // Otherwise, render normally.
  if (pipWindow) {
    return (
      <div className="p-4 mb-6 border border-dashed border-gray-700 rounded text-center text-gray-500 font-mono">
        Timer is popped out 
        <button onClick={togglePiP} className="ml-2 underline text-green-500">Bring back</button>
        {createPortal(stopwatchContent, pipWindow.document.body)}
      </div>
    );
  }

  return <div className="mb-6">{stopwatchContent}</div>;
});
StopwatchSection.displayName = 'StopwatchSection';

// ==========================================
// HEATMAP COMPONENT
// ==========================================
const Heatmap = memo(({ countsByDay }) => {  
  
  // date math
  const dayList = useMemo(() => {
    const today = new Date();
    return daysArray(365 + today.getDay());
  }, []);

  return (
    <div className="p-4 rounded-lg shadow-sm mb-6 flex flex-col items-center">    
       <div className="flex justify-center w-full gap-x-2">
            <div style={WEEKDAYS_STYLE}>
              <div className="font-mono text-sm text-right">Su</div>
              <div className="font-mono text-sm text-right">Mo</div>
              <div className="font-mono text-sm text-right">Tu</div>
              <div className="font-mono text-sm text-right">We</div>
              <div className="font-mono text-sm text-right">Th</div> 
              <div className="font-mono text-sm text-right">Fr</div>
              <div className="font-mono text-sm text-right">Sa</div> 
            </div>
          <div className="custom-scrollbar overflow-x-auto">
            <div style={GRID_STYLE} className="custom-scrollbar">
            {dayList.map((d) => {
              const key = startOfDayISO(d);
              const seconds = countsByDay[key] || 0;
              const { hh, mm, ss } = secondsToHMS(seconds);
              return (  
                <div
                  key={key}
                  title={`${key} — ${hh}h ${mm}m ${ss}s`}
                  className={`rounded-sm border border-gray-700 ${colorForCount(seconds)}`}
                  style={{ width: TILE_SIZE, height: TILE_SIZE }}
                />
              );
            })}
            </div>
          </div>
       </div>
    </div>
  );
});
Heatmap.displayName = 'Heatmap';

// ==========================================
// MAIN APP 
// ==========================================
export default function App() {
  const [sessions, setSessions] = useState([]);
  const [logOpen, setLogOpen] = useState(false);
  const [filterRange, setFilterRange] = useState("year");
  const [selectedTags, setSelectedTags] = useState([]);

  // Editing state
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const notesRef = useRef(null);

  // Load Initial Data
  useEffect(() => {
    loadSessions()
      .then((stored) => {
        if (stored && stored.length > 0) {
        const normalized = stored.map((s) => ({
          ...s,
          id: s.id || Math.random().toString(36).slice(2),
          endAt: s.endAt || (s.date ? new Date(s.date).getTime() : Date.now()),
          startAt: s.startAt ?? (s.endAt ? s.endAt - (s.durationMs || 0) : Date.now()),
          durationMs: s.durationMs || 0,
          topic: s.topic || "(no topic)",
          notes: s.notes || "",
          tags: Array.isArray(s.tags) ? s.tags : []
        }));
        normalized.sort((a, b) => (b.endAt || 0) - (a.endAt || 0));
        setSessions(normalized);
        }
      })
      .catch((err) => console.error("Failed to load sessions", err));
  }, []);

  // save on change
  useEffect(() => {
    saveSessions(sessions).catch((err) => console.error("Failed to save sessions", err));
  }, [sessions]);

  const handleSessionComplete = (newSession) => {
    setSessions((prev) => [newSession, ...prev]);
  };

  const deleteSession = (id) => {
    if (window.confirm("Are you sure you want to delete this session?")) {
      setSessions((prev) => prev.filter((s) => s.id !== id));
    }
  };

  // Memoized Derived State
  const allTags = useMemo(() => {
    const set = new Set();
    sessions.forEach(s => (s.tags || []).forEach(t => set.add(t)));
    return Array.from(set).sort();
  }, [sessions]);

  const filteredSessions = useMemo(() => {
    const cutoff = getDateCutoff(filterRange);
    const dateFiltered = sessions.filter(
      (s) => (s.endAt || s.startAt) >= cutoff.getTime()
    );

    return selectedTags.length === 0
      ? dateFiltered
      : dateFiltered.filter(s => (s.tags || []).some(tag => selectedTags.includes(tag)));
  }, [sessions, filterRange, selectedTags]);

const countsByDay = useMemo(() => {
  const counts = {};
  filteredSessions.forEach((sess) => {
    const start = sess.startAt || (sess.endAt ? sess.endAt - sess.durationMs : null);
    const end = sess.endAt || (sess.startAt ? sess.startAt + sess.durationMs : null);
    
    let sMs = new Date(start).getTime();
    let eMs = new Date(end).getTime();
    
    if (!sMs || !eMs || eMs <= sMs) return;

    let cursor = sMs;
    while (cursor < eMs) {
      const d = new Date(cursor);
      d.setHours(24, 0, 0, 0); // Move to start of next day
      const segEnd = Math.min(eMs, d.getTime());
      const seconds = Math.round((segEnd - cursor) / 1000);
      const key = startOfDayISO(cursor);
      
      counts[key] = (counts[key] || 0) + seconds;
      cursor = segEnd;    
    }
  });
  return counts;
}, [filteredSessions]);

const stats = useMemo(() => {
  const totalTime = filteredSessions.reduce((sum, s) => sum + (s.durationMs || 0), 0);
  const studyDays = Object.keys(countsByDay).length || 1;
  
  return {
    total: secondsToHMS(totalTime / 1000),
    avg: secondsToHMS(Math.floor(totalTime / 1000 / studyDays)),
    daysStudied: studyDays
  };
}, [filteredSessions, countsByDay]);

  // Export Logic
  const exportSessions = () => {
    if (!sessions.length) return alert("No sessions to export!");
    const blob = new Blob([JSON.stringify(sessions, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `study_sessions_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Edit Logic
  const openEditor = (session) => {
    setEditingId(session.id);
    setEditDraft({ ...session, tagsInput: (session.tags || []).join(", ") });
  };

  const saveEdit = () => {
    if (!editDraft) return;
    const sa = Number(editDraft.startAt);
    const ea = Number(editDraft.endAt);
    if (isNaN(sa) || isNaN(ea)) {
      return alert("Please enter valid dates");
    }
    if (ea <= sa) {
      return alert("End time must be after start time");
    }
    if (ea > Date.now()) {
      return alert("End time cannot be in the future");
    }

    const updated = {
        ...editDraft,
        durationMs: ea - sa,
        tags: (editDraft.tagsInput || "").split(",").map(t => t.trim()).filter(Boolean)
    };
    delete updated.tagsInput;

    setSessions((prev) => prev.map((s) => (s.id === editingId ? { ...s, ...updated } : s)));
    setEditingId(null);
    setEditDraft(null);
  };

  // Auto-resize text area
  useLayoutEffect(() => {
    if (notesRef.current) {
        notesRef.current.style.height = "auto";
        notesRef.current.style.height = `${notesRef.current.scrollHeight + 2}px`;
    }
  }, [editDraft?.notes, editingId]); // Depend on notes content or editing ID

  return (
    <div className="min-h-screen bg-black text-white p-6 overflow-x-hidden">
      
      {/* STOPWATCH */}
      <StopwatchSection onSessionComplete={handleSessionComplete} />

      {/* HEATMAP */}
      <Heatmap countsByDay={countsByDay} /> 


      {/* LOGS AREA */}
      <div className="flex flex-col items-center">
        <button onClick={() => setLogOpen(!logOpen)} className="text-2xl font-semibold mb-3">
          {logOpen ? "▲" : "▼"}
        </button>

        {logOpen && (
          <div className="p-4 rounded-lg shadow-sm mb-6 flex flex-col items-center w-full max-w-4xl">
            <div className="text-gray-500 font-mono text-center mb-4">
              {stats.total.hh}h {stats.total.mm}m {stats.total.ss}s total<br />
              {stats.avg.hh}h {stats.avg.mm}m {stats.avg.ss}s avg study day <br />
              {stats.daysStudied} days studied
            </div>

            {/* Controls */}
            <div className="flex flex-wrap justify-center gap-2 mb-4">
              <select 
                value={filterRange} 
                onChange={(e) => setFilterRange(e.target.value)}
                className="bg-gray-800 text-white rounded px-2 py-1 font-mono"
              >
                <option value="week">Past Week</option>
                <option value="2weeks">Past 2 Weeks</option>
                <option value="month">Past Month</option>
                <option value="3months">Past 3 Months</option>
                <option value="6months">Past 6 Months</option>
                <option value="year">Past Year</option>
              </select>
              <button onClick={exportSessions} className="bg-gray-800 text-white rounded px-2 py-1 font-mono">
                Export
              </button>
            </div>

            {/* Tags Filter */}
            <div className="flex flex-wrap justify-center gap-2 mb-4">
              {allTags.map(tag => (
                <button
                  key={tag}
                  onClick={() => setSelectedTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}
                  className={`px-2 py-1 rounded text-xs font-mono border ${selectedTags.includes(tag) ? "bg-green-700 border-green-500" : "bg-gray-800 border-gray-600 text-gray-300"}`}
                >
                  {tag}
                </button>
              ))}
            </div>

            {/* Session List */}
            <div className="space-y-3 w-full">
              {filteredSessions.map((s) => (
                <div key={s.id} className="p-3 border border-gray-700 rounded bg-gray-900/50">
                  {editingId === s.id && editDraft ? (
                    // EDIT MODE
                    <div className="flex flex-col gap-2">
                        <div className="text-sm text-gray-400 font-mono">Editing</div>
                        <input 
                            className="bg-gray-800 border border-gray-600 rounded p-1 font-mono text-sm"
                            value={editDraft.topic} 
                            onChange={e => setEditDraft({...editDraft, topic: e.target.value})} 
                            placeholder="Topic"
                        />
                        <input 
                            className="bg-gray-800 border border-gray-600 rounded p-1 font-mono text-sm"
                            value={editDraft.tagsInput} 
                            onChange={e => setEditDraft({...editDraft, tagsInput: e.target.value})} 
                            placeholder="Tags (comma separated)"
                        />
                        <textarea 
                            ref={notesRef}
                            className="bg-gray-800 border border-gray-600 rounded p-1 font-mono text-sm resize-none overflow-hidden"
                            value={editDraft.notes} 
                            onChange={e => setEditDraft({...editDraft, notes: e.target.value})} 
                            placeholder="Notes"
                            rows={3}
                        />
                        <div className="grid grid-cols-2 gap-2">
                            <input type="datetime-local" className="bg-gray-800 border border-gray-600 rounded p-1 text-xs" value={toLocalDatetimeString(editDraft.startAt)} onChange={e => setEditDraft({...editDraft, startAt: fromLocalDatetimeString(e.target.value)})} />
                            <input type="datetime-local" className="bg-gray-800 border border-gray-600 rounded p-1 text-xs" value={toLocalDatetimeString(editDraft.endAt)} onChange={e => setEditDraft({...editDraft, endAt: fromLocalDatetimeString(e.target.value)})} />
                        </div>
                        <div className="flex gap-2 mt-2">
                            <button onClick={saveEdit} className="bg-green-700 px-3 py-1 rounded text-sm font-mono">Save</button>
                            <button onClick={() => {setEditingId(null); setEditDraft(null)}} className="bg-gray-700 px-3 py-1 rounded text-sm font-mono">Cancel</button>
                        </div>
                    </div>
                  ) : (
                    // VIEW MODE
                    <div>
                      <div className="text-sm text-gray-400 font-mono flex justify-between">
                         <span>{new Date(s.startAt).toLocaleString()}</span>
                         <span>{formatDuration(s.durationMs)}</span>
                      </div>
                      <div className="font-bold font-mono mt-1">{s.topic}</div>
                      {s.tags.length > 0 && (
                          <div className="flex gap-1 mt-1 flex-wrap">
                              {s.tags.map(t => <span key={t} className="bg-gray-700 text-xs px-1 rounded font-mono">{t}</span>)}
                          </div>
                      )}
                      {s.notes && <div className="mt-2 whitespace-pre-wrap text-sm font-mono text-gray-300">{s.notes}</div>}
                      <div className="flex gap-2 mt-3">
                          <button onClick={() => openEditor(s)} className="text-xs border border-gray-600 px-2 py-1 rounded font-mono">Edit</button>
                          <button onClick={() => deleteSession(s.id)} className="text-xs border border-red-900 text-red-400 px-2 py-1 rounded font-mono">Delete</button>
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