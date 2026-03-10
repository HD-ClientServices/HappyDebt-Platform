/**
 * PLG event tracking. Call from client; fire-and-forget to Edge Function + feature_usage upsert.
 */
const SESSION_ID_KEY = "happydebt_session_id";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  let id = localStorage.getItem(SESSION_ID_KEY);
  if (!id) {
    id = `s_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
    localStorage.setItem(SESSION_ID_KEY, id);
  }
  return id;
}

export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>
): void {
  if (typeof window === "undefined") return;
  const sessionId = getSessionId();
  const payload = {
    event_name: eventName,
    event_properties: properties ?? {},
    session_id: sessionId,
  };
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (url && key) {
      fetch(`${url}/functions/v1/track-plg-event`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify(payload),
      }).catch(() => {});
    }
  } catch {
    // ignore
  }
}

export function trackFeatureUsage(featureKey: string): void {
  trackEvent("feature_used", { feature_key: featureKey });
}
