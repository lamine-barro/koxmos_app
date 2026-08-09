type DebugFields = Record<string, unknown>;

// Diagnostic metadata stays enabled in device builds unless explicitly turned
// off. It never includes credentials, SDP or conversation text by default.
const enabled = process.env.EXPO_PUBLIC_KOXMOS_DEBUG !== 'false';

function clean(value: unknown): unknown {
  if (typeof value === 'string') return value.length > 1_200 ? `${value.slice(0, 1_200)}…` : value;
  if (Array.isArray(value)) return value.slice(0, 20).map(clean);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as DebugFields)
      .filter(([key]) => !/authorization|token|secret|password|sdp/i.test(key))
      .map(([key, item]) => [key, clean(item)]));
  }
  return value;
}

export function newTraceId(prefix = 'client') {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function debugLog(event: string, fields: DebugFields = {}) {
  if (!enabled) return;
  console.info('[Koxmos]', JSON.stringify({ at: new Date().toISOString(), event, ...(clean(fields) as DebugFields) }));
}

export function debugError(event: string, error: unknown, fields: DebugFields = {}) {
  if (!enabled) return;
  const diagnostic = error instanceof Error ? { name: error.name, message: error.message } : { message: String(error) };
  console.error('[Koxmos]', JSON.stringify({ at: new Date().toISOString(), event, ...(clean(fields) as DebugFields), error: diagnostic }));
}
