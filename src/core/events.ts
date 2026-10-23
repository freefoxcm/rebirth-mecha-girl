export type Listener<T> = (value: T) => void;

/** 极简类型化事件总线，屏幕与模拟层之间只通过它通信。 */
export class Emitter<E extends Record<string, unknown>> {
  private listeners = new Map<keyof E, Set<Listener<never>>>();

  on<K extends keyof E>(type: K, fn: Listener<E[K]>): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(fn as Listener<never>);
    return () => {
      set?.delete(fn as Listener<never>);
    };
  }

  emit<K extends keyof E>(type: K, value: E[K]): void {
    const set = this.listeners.get(type);
    if (!set) return;
    for (const fn of [...set]) (fn as Listener<E[K]>)(value);
  }

  clear(): void {
    this.listeners.clear();
  }
}
