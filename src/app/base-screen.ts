import type * as THREE from 'three';
import type { App, Screen, ScreenParams } from './app';
import { el } from '../ui/dom';

/** 屏幕基类：统一清理定时器、事件监听和键盘钩子。 */
export abstract class BaseScreen implements Screen {
  readonly root: HTMLDivElement;
  protected cleanups: Array<() => void> = [];
  protected timers: number[] = [];

  constructor(protected readonly app: App) {
    this.root = el('div', 'screen');
  }

  abstract enter(params?: ScreenParams): void;

  exit(): void {
    for (const fn of this.cleanups) {
      try {
        fn();
      } catch {
        /* noop */
      }
    }
    this.cleanups = [];
    for (const t of this.timers) window.clearTimeout(t);
    this.timers = [];
    this.root.classList.add('is-leaving');
    this.root.style.pointerEvents = 'none';
  }

  backdrop(): { scene: THREE.Scene; camera: THREE.Camera } | null {
    return null;
  }

  protected onWindow<K extends keyof WindowEventMap>(
    type: K,
    handler: (event: WindowEventMap[K]) => void,
    options?: AddEventListenerOptions,
  ): void {
    window.addEventListener(type, handler as EventListener, options);
    this.cleanups.push(() => window.removeEventListener(type, handler as EventListener, options));
  }

  protected addCleanup(fn: () => void): void {
    this.cleanups.push(fn);
  }

  protected later(fn: () => void, ms: number): number {
    const id = window.setTimeout(fn, ms);
    this.timers.push(id);
    return id;
  }

  protected interval(fn: () => void, ms: number): void {
    const id = window.setInterval(fn, ms);
    this.cleanups.push(() => window.clearInterval(id));
  }

  protected go(id: Parameters<App['show']>[0], params?: ScreenParams): void {
    this.app.show(id, params);
  }
}
