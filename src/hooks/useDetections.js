/**
 * useDetections — Real-time Jetson detection WebSocket hook.
 *
 * Connects to /ws/detections and maintains:
 *   - latest:       the most recent detection payload
 *   - history:      last 100 events (newest first)
 *   - stats:        aggregate per-device totals, avg/min/max confidence
 *   - isConnected:  WebSocket connection state
 *
 * Usage:
 *   const { latest, history, stats, isConnected } = useDetections(apiBaseUrl);
 */
import { useEffect, useRef, useState, useCallback } from 'react';

const MAX_HISTORY = 100;

function buildWsUrl(apiBaseUrl) {
  try {
    const base = (apiBaseUrl || 'http://localhost:8000').replace(/\/$/, '');
    const url = new URL(base);
    const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${url.host}/ws/detections`;
  } catch {
    return 'ws://localhost:8000/ws/detections';
  }
}

export function useDetections(apiBaseUrl) {
  const [isConnected, setIsConnected] = useState(false);
  const [latest, setLatest] = useState(null);
  const [history, setHistory] = useState([]);      // [{...payload, receivedAt}]
  const [stats, setStats] = useState({
    byDevice: {},           // { device_id: { totalEvents, totalPersons, peakCount, avgFps } }
    globalTotalEvents: 0,
    globalTotalPersons: 0,
    confidenceStats: {      // across all detections
      avg: 0,
      min: 0,
      max: 0,
      samples: 0,
    },
  });

  const wsRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const reconnectDelayRef = useRef(1500);
  const confidenceSumRef = useRef(0);
  const confidenceCountRef = useRef(0);
  const confidenceMinRef = useRef(Infinity);
  const confidenceMaxRef = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
    }

    const wsUrl = buildWsUrl(apiBaseUrl);
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectDelayRef.current = 1500; // reset backoff
      console.log('[useDetections] Connected to', wsUrl);
      // Keep-alive ping every 20s
      ws._pingInterval = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, 20_000);
    };

    ws.onmessage = (evt) => {
      let data;
      try { data = JSON.parse(evt.data); } catch { return; }
      if (data.type === 'pong') return;

      const receivedAt = Date.now();
      const entry = { ...data, receivedAt };

      // Update latest
      setLatest(entry);

      // Update history (cap at MAX_HISTORY)
      setHistory(prev => [entry, ...prev].slice(0, MAX_HISTORY));

      // Update confidence running stats
      if (Array.isArray(data.detections)) {
        data.detections.forEach(d => {
          const c = d.confidence || 0;
          confidenceSumRef.current += c;
          confidenceCountRef.current += 1;
          if (c < confidenceMinRef.current) confidenceMinRef.current = c;
          if (c > confidenceMaxRef.current) confidenceMaxRef.current = c;
        });
      }

      // Update aggregate stats
      setStats(prev => {
        const deviceId = data.device_id || 'unknown';
        const existing = prev.byDevice[deviceId] || {
          totalEvents: 0, totalPersons: 0, peakCount: 0, avgFps: 0,
        };
        const newTotalEvents = existing.totalEvents + 1;
        const newTotalPersons = existing.totalPersons + (data.person_count || 0);
        const newPeak = Math.max(existing.peakCount, data.person_count || 0);
        const newAvgFps = (existing.avgFps * existing.totalEvents + (data.fps || 0)) / newTotalEvents;

        const n = confidenceCountRef.current;
        const avg = n > 0 ? confidenceSumRef.current / n : 0;
        const min = confidenceMinRef.current === Infinity ? 0 : confidenceMinRef.current;
        const max = confidenceMaxRef.current;

        return {
          byDevice: {
            ...prev.byDevice,
            [deviceId]: {
              totalEvents: newTotalEvents,
              totalPersons: newTotalPersons,
              peakCount: newPeak,
              avgFps: parseFloat(newAvgFps.toFixed(1)),
            },
          },
          globalTotalEvents: prev.globalTotalEvents + 1,
          globalTotalPersons: prev.globalTotalPersons + (data.person_count || 0),
          confidenceStats: { avg, min, max, samples: n },
        };
      });
    };

    ws.onerror = () => {
      setIsConnected(false);
    };

    ws.onclose = () => {
      clearInterval(ws._pingInterval);
      setIsConnected(false);
      // Exponential backoff reconnect (1.5s → 3s → 6s … max 30s)
      const delay = reconnectDelayRef.current;
      reconnectDelayRef.current = Math.min(delay * 2, 30_000);
      console.log(`[useDetections] Disconnected. Reconnecting in ${delay}ms…`);
      reconnectTimerRef.current = setTimeout(connect, delay);
    };
  }, [apiBaseUrl]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimerRef.current) clearTimeout(reconnectTimerRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [connect]);

  return { isConnected, latest, history, stats };
}
