// FILE: src/hooks/useStopwatch.js
import { useEffect, useRef, useState } from "react";


export default function useStopwatch() {
    const [isRunning, setIsRunning] = useState(false);
    const [startAt, setStartAt] = useState(null);
    const [elapsedOffset, setElapsedOffset] = useState(0);
    const tickRef = useRef(null);
    const [tick, setTick] = useState(0);


    useEffect(() => {
        if (isRunning) {
            tickRef.current = setInterval(() => setTick((t) => t + 1), 500);
        } else {
            if (tickRef.current) {
                clearInterval(tickRef.current);
                tickRef.current = null;
            }
        }
        return () => clearInterval(tickRef.current);
    }, [isRunning]);


    const currentElapsed = isRunning ? Date.now() - startAt + elapsedOffset : elapsedOffset;


    function start() {
        if (isRunning) return;
        setStartAt(Date.now());
        setIsRunning(true);
    }


    function pause() {
        if (!isRunning) return;
        setElapsedOffset((prev) => prev + (Date.now() - startAt));
        setStartAt(null);
        setIsRunning(false);
    }


    function resume() {
        if (isRunning) return;
        setStartAt(Date.now());
        setIsRunning(true);
    }


    /**
    * Stop the stopwatch and reset the internal state.
    * Returns an object with startAt, endAt and durationMs if duration > 0, otherwise null.
    */
    function stop() {
        const endTime = Date.now();
        const duration = isRunning ? endTime - startAt + elapsedOffset : elapsedOffset;
        setIsRunning(false);
        setStartAt(null);
        setElapsedOffset(0);


        if (duration <= 0) return null;
        return {
            durationMs: duration,
            startAt: endTime - duration,
            endAt: endTime,
        };
    }


    return {
        currentElapsed,
        isRunning,
        start,
        pause,
        resume,
        stop,
        // exposing these for debugging/testing (optional)
        startAt,
        elapsedOffset,
    };
}