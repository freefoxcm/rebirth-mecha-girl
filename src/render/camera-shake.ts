/**
 * 创伤值驱动的相机震动：平滑多频噪声 + 方向冲量 + zoom punch。
 * 不使用逐帧随机数，避免抖动生硬；暂停/结算/失去焦点时可归零。
 */
export class CameraShake {
  private trauma = 0;
  private time = 0;
  private impulseX = 0;
  private impulseZ = 0;
  private zoomPulse = 0;
  private seed = Math.random() * 100;

  add(amount: number, options: { zoom?: number; impulseX?: number; impulseZ?: number } = {}): void {
    this.trauma = Math.min(1.15, this.trauma + Math.max(0, amount));
    this.zoomPulse = Math.min(0.02, this.zoomPulse + (options.zoom ?? 0));
    this.impulseX += options.impulseX ?? 0;
    this.impulseZ += options.impulseZ ?? 0;
  }

  update(dt: number): void {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 1.55);
    this.zoomPulse *= Math.pow(0.06, dt);
    this.impulseX *= Math.pow(0.04, dt);
    this.impulseZ *= Math.pow(0.04, dt);
  }

  reset(): void {
    this.trauma = 0;
    this.zoomPulse = 0;
    this.impulseX = 0;
    this.impulseZ = 0;
  }

  get value(): number {
    return this.trauma;
  }

  sample(enabled: boolean): { x: number; z: number; roll: number; zoom: number } {
    if (!enabled || this.trauma <= 0.001) return { x: 0, z: 0, roll: 0, zoom: 1 };
    const t = this.time + this.seed;
    const a = this.trauma * this.trauma;
    const x =
      (Math.sin(t * 31.7) * 0.62 + Math.sin(t * 17.3 + 1.7) * 0.28 + Math.sin(t * 7.1 + 0.4) * 0.1) * a * 2.4 +
      this.impulseX * a;
    const z =
      (Math.sin(t * 27.1 + 2.1) * 0.58 + Math.sin(t * 11.9 + 0.6) * 0.3 + Math.sin(t * 43.7) * 0.12) * a * 2.2 +
      this.impulseZ * a;
    const roll = (Math.sin(t * 19.7 + 0.7) * 0.65 + Math.sin(t * 47.1 + 1.2) * 0.35) * a * 0.012;
    const zoom = 1 - a * 0.0045 - this.zoomPulse;
    return { x, z, roll, zoom };
  }
}
