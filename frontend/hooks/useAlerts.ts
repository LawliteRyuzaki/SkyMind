// hooks/useAlerts.ts
// =====================================================================
// Polls /check-alerts every 10 seconds.
// Shows browser Notification + in-app toast when an alert is triggered.
// =====================================================================

import { useState, useEffect, useCallback, useRef } from "react";
import {
  setAlert as apiSetAlert,
  checkAlerts,
  deleteAlert as apiDeleteAlert,
  AlertRecord,
  SetAlertRequest,
  ApiError,
} from "@/lib/api";

const POLL_INTERVAL_MS = 10_000;

interface UseAlertsReturn {
  alerts: AlertRecord[];
  triggered: AlertRecord[];
  loading: boolean;
  error: string | null;
  addAlert: (req: SetAlertRequest) => Promise<{ ok: boolean; message: string }>;
  removeAlert: (id: string) => Promise<void>;
  lastChecked: Date | null;
}

// Track which alert IDs we've already notified so we don't spam
const _notifiedIds = new Set<string>();

export function useAlerts(): UseAlertsReturn {
  const [alerts, setAlerts] = useState<AlertRecord[]>([]);
  const [triggered, setTriggered] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const data = await checkAlerts();
      setAlerts(data.alerts);
      setTriggered(data.triggered);
      setLastChecked(new Date());

      // Fire notifications for newly triggered alerts
      for (const alert of data.triggered) {
        if (!_notifiedIds.has(alert.id)) {
          _notifiedIds.add(alert.id);
          _notify(alert);
        }
      }
    } catch {
      // Silently swallow poll errors — network may be flaky
    }
  }, []);

  useEffect(() => {
    // Initial check
    poll();
    // Schedule polling
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [poll]);

  const addAlert = useCallback(async (req: SetAlertRequest) => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiSetAlert(req);
      await poll(); // refresh immediately
      return { ok: true, message: res.message };
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : "Failed to set alert";
      setError(msg);
      return { ok: false, message: msg };
    } finally {
      setLoading(false);
    }
  }, [poll]);

  const removeAlert = useCallback(async (id: string) => {
    try {
      await apiDeleteAlert(id);
      await poll();
    } catch {
      // ignore
    }
  }, [poll]);

  return { alerts, triggered, loading, error, addAlert, removeAlert, lastChecked };
}

// ---------------------------------------------------------------------------
// Notification helper
// ---------------------------------------------------------------------------
function _notify(alert: AlertRecord) {
  const title = `🎯 Price Alert: ${alert.origin} → ${alert.destination}`;
  const body = `Current price ₹${alert.current_price?.toLocaleString("en-IN")} is at or below your target ₹${alert.target_price.toLocaleString("en-IN")}!`;

  // Browser Notification API
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico" });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") new Notification(title, { body });
      });
    }
  }

  // Fallback: console log (sonner toast wired in component layer)
  console.info("[SkyMind Alert]", title, body);
}
