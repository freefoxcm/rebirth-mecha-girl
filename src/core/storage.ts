/** localStorage 读写封装：损坏数据自动备份并回退，不让坏存档卡死启动。 */
export function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as T;
    if (parsed === null || parsed === undefined) return fallback;
    return parsed;
  } catch (err) {
    console.warn(`[storage] ${key} 无法解析，已备份并重建`, err);
    try {
      const raw = localStorage.getItem(key);
      if (raw) localStorage.setItem(`${key}.corrupt.${Date.now()}`, raw);
      localStorage.removeItem(key);
    } catch {
      /* quota / privacy mode */
    }
    return fallback;
  }
}

export function writeJSON(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (err) {
    console.warn(`[storage] ${key} 写入失败`, err);
    return false;
  }
}

export function removeKey(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}
