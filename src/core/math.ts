export const TAU = Math.PI * 2;
export const D2R = Math.PI / 180;
export const R2D = 180 / Math.PI;

export const clamp = (v: number, min: number, max: number): number =>
  v < min ? min : v > max ? max : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** 帧率无关的指数趋近。 */
export const damp = (a: number, b: number, lambda: number, dt: number): number =>
  lerp(a, b, 1 - Math.exp(-lambda * dt));

export const smoothstep = (t: number): number => {
  const x = clamp(t, 0, 1);
  return x * x * (3 - 2 * x);
};

export const wrapAngle = (a: number): number => {
  let x = a % TAU;
  if (x > Math.PI) x -= TAU;
  if (x < -Math.PI) x += TAU;
  return x;
};

export const angleDelta = (from: number, to: number): number => wrapAngle(to - from);

export const dampAngle = (from: number, to: number, lambda: number, dt: number): number =>
  from + angleDelta(from, to) * (1 - Math.exp(-lambda * dt));

export const moveAngle = (from: number, to: number, maxDelta: number): number => {
  const d = angleDelta(from, to);
  return from + clamp(d, -maxDelta, maxDelta);
};

export const rand = (min: number, max: number): number => min + Math.random() * (max - min);
export const randInt = (min: number, max: number): number => Math.floor(rand(min, max + 1));
export const pick = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];
export const chance = (p: number): boolean => Math.random() < p;

export const dist2 = (ax: number, az: number, bx: number, bz: number): number => {
  const dx = ax - bx;
  const dz = az - bz;
  return dx * dx + dz * dz;
};

export const formatScore = (n: number, digits = 6): string =>
  Math.max(0, Math.round(n)).toString().padStart(digits, '0');

export const formatTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

export const formatNumber = (n: number): string => Math.round(n).toLocaleString('zh-CN');

/** 从 1 开始缓动的计数，用于结算面板的数字滚动。 */
export const easeOutCubic = (t: number): number => 1 - Math.pow(1 - clamp(t, 0, 1), 3);

export const hashString = (s: string): number => {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
};
