const GAME_KEYS = new Set([
  'Space',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ShiftLeft',
  'ShiftRight',
  'Tab',
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyE',
  'KeyR',
]);

/** 键鼠输入：pressed 集合在每个渲染帧末清空。 */
export class InputService {
  readonly keys = new Set<string>();
  readonly pressed = new Set<string>();
  pointer = { x: 0, y: 0 };
  pointerNdc = { x: 0, y: 0 };
  pointerInside = false;
  pointerMoved = false;
  pointerDown = false;
  rightDown = false;
  enabled = true;
  onFirstGesture?: () => void;
  private gestureFired = false;
  private disposers: Array<() => void> = [];

  constructor(private readonly canvas: HTMLCanvasElement) {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!this.enabled) return;
      if (GAME_KEYS.has(e.code)) e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
      this.fireGesture();
    };
    const onKeyUp = (e: KeyboardEvent) => {
      this.keys.delete(e.code);
    };
    const onBlur = () => {
      this.keys.clear();
      this.pointerDown = false;
      this.rightDown = false;
    };
    const onPointerMove = (e: PointerEvent) => {
      const rect = this.canvas.getBoundingClientRect();
      this.pointer.x = e.clientX - rect.left;
      this.pointer.y = e.clientY - rect.top;
      this.pointerNdc.x = (this.pointer.x / Math.max(1, rect.width)) * 2 - 1;
      this.pointerNdc.y = -((this.pointer.y / Math.max(1, rect.height)) * 2 - 1);
      this.pointerInside =
        e.clientX >= rect.left && e.clientX <= rect.right && e.clientY >= rect.top && e.clientY <= rect.bottom;
      this.pointerMoved = true;
    };
    const onPointerDown = (e: PointerEvent) => {
      if (!this.enabled) return;
      if (e.target === this.canvas) {
        if (e.button === 0) this.pointerDown = true;
        if (e.button === 2) this.rightDown = true;
      }
      this.fireGesture();
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.button === 0) this.pointerDown = false;
      if (e.button === 2) this.rightDown = false;
    };
    const onContext = (e: Event) => {
      if (e.target === this.canvas) e.preventDefault();
    };
    const onVisibility = () => {
      if (document.hidden) onBlur();
    };

    window.addEventListener('keydown', onKeyDown, { passive: false });
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    window.addEventListener('pointermove', onPointerMove, { passive: true });
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    this.canvas.addEventListener('contextmenu', onContext);
    document.addEventListener('visibilitychange', onVisibility);

    this.disposers.push(
      () => window.removeEventListener('keydown', onKeyDown),
      () => window.removeEventListener('keyup', onKeyUp),
      () => window.removeEventListener('blur', onBlur),
      () => window.removeEventListener('pointermove', onPointerMove),
      () => window.removeEventListener('pointerdown', onPointerDown),
      () => window.removeEventListener('pointerup', onPointerUp),
      () => window.removeEventListener('pointercancel', onPointerUp),
      () => this.canvas.removeEventListener('contextmenu', onContext),
      () => document.removeEventListener('visibilitychange', onVisibility),
    );
  }

  private fireGesture(): void {
    if (this.gestureFired) return;
    this.gestureFired = true;
    this.onFirstGesture?.();
  }

  isDown(code: string): boolean {
    return this.keys.has(code);
  }

  wasPressed(code: string): boolean {
    return this.pressed.has(code);
  }

  /** 鼠标瞄准点转换到 NDC 后再由相机投到玩家高度平面。 */
  endFrame(): void {
    this.pressed.clear();
  }

  clear(): void {
    this.keys.clear();
    this.pressed.clear();
    this.pointerDown = false;
    this.rightDown = false;
  }

  dispose(): void {
    this.disposers.forEach((fn) => fn());
    this.disposers = [];
  }
}
