export function sanitizeNumber(val: any, fallback = 0): number {
  if (typeof val === 'number') {
    return isNaN(val) || !isFinite(val) ? fallback : val;
  }
  if (val === null || val === undefined) return fallback;
  const cleaned = String(val).replace(/[^0-9.-]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) || !isFinite(parsed) ? fallback : parsed;
}

/**
 * Recursively cleans an object for Firestore by replacing `undefined` with `null`,
 * and replacing `NaN` / `Infinity` numbers with fallback numeric values.
 */
export function sanitizeFirestoreData<T>(obj: T): T {
  if (obj === null || obj === undefined) {
    return null as any;
  }
  if (typeof obj === 'number') {
    return (isNaN(obj) || !isFinite(obj) ? 0 : obj) as any;
  }
  if (typeof obj !== 'object') {
    return obj;
  }
  if (Array.isArray(obj)) {
    return obj.map(item => sanitizeFirestoreData(item)) as any;
  }
  const result: any = {};
  for (const key of Object.keys(obj)) {
    const val = (obj as any)[key];
    if (val === undefined) {
      result[key] = null;
    } else {
      result[key] = sanitizeFirestoreData(val);
    }
  }
  return result;
}
