// hooks/useAlerts.ts — FIXED
// Now passes userId to backend GET /alerts/user/:id
// Falls back to localStorage when backend is unreachable.

import { useState, useEffect, useCallback, useRef } from "react";
import {
  setAlert as apiSetAlert,
  checkAlerts,
  deleteAlert as apiDeleteAlert,
  AlertRecord,
  SetAlertRequest,
  ApiError,
} from "@/lib/api";

const POLL_INTERVAL_MS = 30_000;
const STORAGE_KEY = "skymind_price_alerts";

interface UseAlertsReturn {
  alerts: AlertRecord[];
  triggered: AlertRecord[];
  loading: boolean;
  error: string | null;
  addAlert: (req: SetAlertRequest) => Promise<{ ok: boolean; message: string }>;
  removeAlert: (id: string) => Promise<void>;
  lastChecked: Date | null;
}

const _notifiedIds = new Set<string>();

function loadAlertsFromStorage(): AlertRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as AlertRecord[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAlertsToStorage(alerts: AlertRecord[]) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(alerts));
  } catch { /* quota exceeded */ }
}

function removeAlertFromStorage(id: string) {
  saveAlertsToStorage(loadAlertsFromStorage().filter((a) => a.id !== id));
}

function upsertAlertInStorage(alert: AlertRecord) {
  const existing = loadAlertsFromStorage();
  const idx = existing.findIndex((a) => a.id === alert.id);
  if (idx >= 0) existing[idx] = alert;
  else existing.push(alert);
  saveAlertsToStorage(existing);
}

// Get current user id from Supabase session (async, best-effort)
async function getCurrentUserId(): Promise<string | undefined> {
  try {
    const { supabase } = await import("@/lib/supabase");
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id;
  } catch {
    return undefined;
  }
}

export function useAlerts(): UseAlertsReturn {
  const [alerts, setAlerts] = useState<AlertRecord[]>(() => loadAlertsFromStorage());
  const [triggered, setTriggered] = useState<AlertRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const poll = useCallback(async () => {
    try {
      const userId = await getCurrentUserId();
      const data = await checkAlerts(userId);

      setAlerts(data.alerts);
      setTriggered(data.triggered);
      setLastChecked(new Date());
      saveAlertsToStorage(data.alerts);

      for (const alert of data.triggered) {
        if (!_notifiedIds.has(alert.id)) {
          _notifiedIds.add(alert.id);
          _notify(alert);
        }
      }
    } catch {
      // Backend unreachable — use localStorage
      const stored = loadAlertsFromStorage();
      if (stored.length > 0) {
        setAlerts(stored);
        setTriggered(stored.filter((a) => a.triggered));
      }
    }
  }, []);

  useEffect(() => {
    const stored = loadAlertsFromStorage();
    if (stored.length > 0) setAlerts(stored);
    poll();
    timerRef.current = setInterval(poll, POLL_INTERVAL_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [poll]);

  const addAlert = useCallback(async (req: SetAlertRequest) => {
    setLoading(true);
    setError(null);
    try {
      // Inject current userId if not provided
      if (!req.user_id) {
        req.user_id = await getCurrentUserId();
      }
      const res = await apiSetAlert(req);

      const localAlert: AlertRecord = {
        id: res.alert_id,
        origin: req.origin.toUpperCase(),
        destination: req.destination.toUpperCase(),
        target_price: req.target_price,
        departure_date: req.departure_date,
        user_label: req.user_label,
        created_at: new Date().toISOString(),
        triggered: false,
        current_price: undefined,
      };

      upsertAlertInStorage(localAlert);
      setAlerts((prev) => [...prev.filter((a) => a.id !== res.alert_id), localAlert]);
      await poll();
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
    setAlerts((prev) => prev.filter((a) => a.id !== id));
    removeAlertFromStorage(id);
    _notifiedIds.delete(id);
    try {
      await apiDeleteAlert(id);
    } catch { /* local removal still stands */ }
  }, []);

  return { alerts, triggered, loading, error, addAlert, removeAlert, lastChecked };
}

function _notify(alert: AlertRecord) {
  const title = `🎯 Price Alert: ${alert.origin} → ${alert.destination}`;
  const body = `Current price ₹${alert.current_price?.toLocaleString("en-IN")} is at or below your target ₹${alert.target_price.toLocaleString("en-IN")}!`;

  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "granted") {
      new Notification(title, { body, icon: "/favicon.ico" });
    } else if (Notification.permission !== "denied") {
      Notification.requestPermission().then((perm) => {
        if (perm === "granted") new Notification(title, { body });
      });
    }
  }
}
