import type * as THREE from 'three';
import { AudioEngine } from '../core/audio';
import { preloadImages, assetUrl } from '../core/assets';
import { InputService } from '../core/input';
import { Ticker } from '../core/loop';
import { GAME_TITLE, GAME_VERSION } from '../data/config';
import { GIRLS, GIRL_ORDER } from '../data/girls';
import { MISSION_ORDER } from '../data/missions';
import type { GirlId, MissionId, MissionResult, ScreenId } from '../data/types';
import { Viewport } from '../render/viewport';
import { SaveService } from './save';
import { el } from '../ui/dom';

export type ScreenParams = Record<string, unknown>;

export interface Screen {
  readonly root: HTMLElement;
  enter(params?: ScreenParams): void;
  exit(): void;
  update?(dt: number): void;
  backdrop?(): { scene: THREE.Scene; camera: THREE.Camera } | null;
}

export type ScreenFactory = (app: App) => Screen;

export interface DebugApi {
  app: App;
  show: (id: ScreenId, params?: ScreenParams) => void;
  state: () => unknown;
  unlockAll: () => void;
  addAlloy: (n: number) => void;
  startMission: (id: MissionId, girl?: GirlId) => void;
  winMission: () => void;
  damageBoss: (n: number) => void;
  advance: (seconds: number, fire?: boolean) => void;
  goto: (id: ScreenId, params?: ScreenParams) => void;
  capture: () => string;
}

export class App {
  readonly ui: HTMLElement;
  readonly canvas: HTMLCanvasElement;
  readonly input: InputService;
  readonly audio = new AudioEngine();
  readonly save = new SaveService();
  viewport: Viewport | null = null;
  current: Screen | null = null;
  currentId: ScreenId | null = null;
  exposure = 1.04;
  readonly isTest: boolean;
  readonly isPerf: boolean;
  private readonly factories = new Map<ScreenId, ScreenFactory>();
  private readonly ticker: Ticker;
  private time = 0;
  private toastNode: HTMLElement | null = null;
  private toastTimer = 0;
  private fpsNode: HTMLElement | null = null;
  private fpsAccum = 0;
  private fpsFrames = 0;

  constructor() {
    this.ui = document.getElementById('ui')!;
    this.canvas = document.getElementById('gl') as HTMLCanvasElement;
    this.input = new InputService(this.canvas);
    const params = new URLSearchParams(window.location.search);
    this.isTest = params.get('test') === '1';
    this.isPerf = params.get('perf') === '1';
    if (this.isTest) document.documentElement.classList.add('test-mode');
    this.ticker = new Ticker((dt, elapsed) => this.tick(dt, elapsed));
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.input.clear();
    });
  }

  register(id: ScreenId, factory: ScreenFactory): void {
    this.factories.set(id, factory);
  }

  hasScreen(id: ScreenId): boolean {
    return this.factories.has(id);
  }

  async boot(): Promise<void> {
    const status = document.getElementById('boot-status');
    const setStatus = (text: string) => {
      if (status) status.textContent = text;
    };

    const bootParams = new URLSearchParams(window.location.search);
    const forcedQuality = bootParams.get('quality');
    if (forcedQuality === 'low' || forcedQuality === 'medium' || forcedQuality === 'high') {
      this.save.settings.quality = forcedQuality;
    }

    try {
      this.viewport = new Viewport(this.canvas);
      this.viewport.setQuality(this.save.settings.quality);
    } catch (err) {
      console.error('[webgl] 初始化失败', err);
      this.failBoot('这台机器没有可用的 WebGL2 环境。<br>请用最新 Chrome / Edge 打开，并确认硬件加速已开启。');
      return;
    }

    this.audio.setVolumes(this.save.settings.master, this.save.settings.sfx, this.save.settings.music);
    this.input.onFirstGesture = () => {
      void this.audio.unlock();
    };
    window.addEventListener(
      'pointerdown',
      () => {
        void this.audio.unlock();
      },
      { passive: true },
    );
    this.ui.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest('button');
      if (target && !target.hasAttribute('data-silent')) this.audio.play('ui');
    });

    // 预载关键立绘：标题、HUD、对话、六段变形
    const paths: string[] = [];
    for (const g of GIRL_ORDER) {
      const art = GIRLS[g].art;
      paths.push(art.poster, art.face, art.bust, ...art.stages);
      if (art.early) paths.push(art.early);
    }
    await preloadImages([...new Set(paths)], (loaded, total) => {
      setStatus(`灵契同步中… ${Math.min(99, Math.round((loaded / total) * 100))}%`);
    });

    setStatus('栖霞号甲板已就绪');
    this.installDebugApi();
    if (this.isPerf || this.save.settings.showFps) this.enableFps();
    this.ticker.start();
    this.bindShortcuts();

    const params = new URLSearchParams(window.location.search);
    let screen = (params.get('screen') as ScreenId | null) ?? 'title';
    if (!this.hasScreen(screen)) screen = 'title';
    const initialParams: ScreenParams = {};
    for (const key of ['scene', 'mission', 'girl', 'from']) {
      const value = params.get(key);
      if (value) initialParams[key] = value;
    }
    if (screen === 'mission') initialParams.skipCutin = params.get('skipCutin') === '1';
    this.show(screen, initialParams);
    this.hideBoot();
    this.syncMusic();
  }

  private failBoot(html: string): void {
    const boot = document.getElementById('boot');
    if (!boot) return;
    boot.innerHTML = `<div class="boot-inner"><div class="boot-kicker">SYSTEM ERROR</div><h1>灵契断线</h1><p style="max-width:520px;margin:24px auto;color:rgba(237,230,214,.7);line-height:1.8">${html}</p></div>`;
    boot.style.display = 'grid';
  }

  private hideBoot(): void {
    const boot = document.getElementById('boot');
    if (!boot) return;
    boot.classList.add('boot-hide');
    window.setTimeout(() => boot.remove(), 700);
  }

  private bindShortcuts(): void {
    window.addEventListener('keydown', (e) => {
      if (e.code === 'F11') return;
      if (e.code === 'KeyM' && !this.input.isDown('F1')) {
        // 快速静音：保留给玩家在任务里使用
      }
    });
  }

  /** 注册后可被调试或截图脚本直接跳转。 */
  show(id: ScreenId, params: ScreenParams = {}): void {
    const factory = this.factories.get(id);
    if (!factory) {
      console.warn(`[screen] 未注册: ${id}`);
      this.toast(`界面尚未就绪：${id}`);
      return;
    }
    const previous = this.current;
    if (previous) {
      previous.exit();
      previous.root.classList.add('is-leaving');
      const node = previous.root;
      window.setTimeout(() => node.remove(), 220);
    }
    this.current = null;
    this.currentId = id;
    const screen = factory(this);
    this.current = screen;
    screen.enter(params);
    this.ui.appendChild(screen.root);
    const hasBackdrop = Boolean(screen.backdrop?.());
    this.canvas.classList.toggle('is-hidden', !hasBackdrop);
    this.input.enabled = id === 'mission';
    this.input.clear();
    this.syncMusic();
  }

  /** 部分界面自己就是音乐决策者；这里只处理默认兜底。 */
  syncMusic(): void {
    const id = this.currentId;
    if (id === 'title' || id === 'hub' || id === 'hangar' || id === 'codex' || id === 'settings' || id === 'results') {
      this.audio.startMusic('menu');
    }
  }

  captureFrame(): string {
    if (!this.viewport) return '';
    const bd = this.current?.backdrop?.();
    if (bd) this.viewport.render(bd.scene, bd.camera, this.time);
    try {
      return this.canvas.toDataURL('image/jpeg', 0.86);
    } catch {
      return '';
    }
  }

  toast(message: string, tone: 'normal' | 'warn' = 'normal'): void {
    if (!this.toastNode) {
      this.toastNode = el('div', 'toast');
      this.ui.appendChild(this.toastNode);
    }
    const node = this.toastNode;
    node.textContent = message;
    node.classList.toggle('toast-warn', tone === 'warn');
    node.classList.add('is-visible');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => node.classList.remove('is-visible'), 2400);
  }

  enableFps(): void {
    if (this.fpsNode) return;
    this.fpsNode = el('div', 'fps-meter');
    this.fpsNode.textContent = '-- FPS';
    this.ui.appendChild(this.fpsNode);
  }

  disableFps(): void {
    this.fpsNode?.remove();
    this.fpsNode = null;
  }

  unlockAll(): void {
    this.save.data.unlocks.girls = [...GIRL_ORDER];
    this.save.data.unlocks.weapons = ['missile', 'lockPlus', 'piercer'];
    for (const g of GIRL_ORDER) this.save.data.trust[g] = Math.max(this.save.getTrust(g), 2);
    this.save.data.economy.alloy = Math.max(this.save.data.economy.alloy, 2000);
    this.save.save();
  }

  startMission(id: MissionId, girl?: GirlId): void {
    if (girl && this.save.isGirlUnlocked(girl)) this.save.selectGirl(girl);
    this.show('mission', { missionId: id, skipCutin: true });
  }

  private installDebugApi(): void {
    const api: DebugApi = {
      app: this,
      show: (id, params) => this.show(id, params),
      state: () => ({
        screen: this.currentId,
        save: this.save.data,
        settings: this.save.settings,
        viewport: this.viewport?.stats,
      }),
      unlockAll: () => this.unlockAll(),
      addAlloy: (n) => {
        this.save.data.economy.alloy += n;
        this.save.save();
      },
      startMission: (id, girl) => this.startMission(id, girl),
      winMission: () => {
        const screen = this.current as unknown as { debugWin?: () => void };
        screen?.debugWin?.();
      },
      damageBoss: (n) => {
        const screen = this.current as unknown as { debugDamageBoss?: (v: number) => void };
        screen?.debugDamageBoss?.(n);
      },
      advance: (seconds, fire = false) => {
        const screen = this.current as unknown as { debugAdvance?: (v: number, f?: boolean) => void };
        screen?.debugAdvance?.(seconds, fire);
      },
      goto: (id, params) => this.show(id, params),
      capture: () => this.captureFrame(),
    };
    (window as unknown as { __REBIRTH__: DebugApi }).__REBIRTH__ = api;
  }

  private tick(dt: number, elapsed: number): void {
    this.time = elapsed;
    this.current?.update?.(dt);
    const bd = this.current?.backdrop?.();
    if (bd && this.viewport) {
      this.viewport.renderer.toneMappingExposure = this.exposure;
      this.viewport.render(bd.scene, bd.camera, elapsed);
    }
    this.input.endFrame();
    if (this.fpsNode) {
      this.fpsAccum += dt;
      this.fpsFrames++;
      if (this.fpsAccum >= 0.5) {
        const fps = Math.round(this.fpsFrames / this.fpsAccum);
        const stats = this.viewport?.stats;
        this.fpsNode.textContent = `${fps} FPS · ${stats?.calls ?? 0} calls · ${((stats?.triangles ?? 0) / 1000).toFixed(0)}k tris`;
        this.fpsAccum = 0;
        this.fpsFrames = 0;
      }
    }
  }

  // 调试用：暴露在 window 上时，截图脚本可直接完成关卡
  debugFinishMission(result: MissionResult): void {
    const screen = this.current as unknown as {
      handleResult?: (r: MissionResult) => void;
    };
    screen?.handleResult?.(result);
  }

  get version(): string {
    return GAME_VERSION;
  }

  get title(): string {
    return GAME_TITLE;
  }

  assetUrl(path: string): string {
    return assetUrl(path);
  }
}
