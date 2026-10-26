import type { MedalRule, Settings } from './types';

export const GAME_TITLE = '重生之我和机娘杀疯了';
export const GAME_TITLE_EN = 'REBIRTH // SKY RAMPAGE';
export const GAME_VERSION = '0.2.0';
export const PILOT_NAME = '陆沉';
export const CARRIER_NAME = '栖霞号';
export const CITY_NAME = '临港市';
export const RIVAL_NAME = '夜枭';

export const SAVE_KEY = 'rebirth.progress.v1';
export const SETTINGS_KEY = 'rebirth.settings.v1';

export const DEFAULT_SETTINGS: Settings = {
  master: 0.85,
  sfx: 0.75,
  music: 0.45,
  quality: 'high',
  shake: true,
  flash: true,
  subtitles: true,
  showFps: false,
};

export const COLORS = {
  ink: '#07090c',
  ink2: '#0c1118',
  panel: '#10161f',
  line: 'rgba(237, 230, 214, 0.14)',
  bone: '#ede6d6',
  dim: 'rgba(237, 230, 214, 0.56)',
  amber: '#f2b01e',
  amberDeep: '#a8760f',
  red: '#e2483d',
  cyan: '#5fd8e8',
  jade: '#9db7a4',
  green: '#7fd18b',
};

export const ALTITUDE = 90;
export const MAP_HALF = 1250;

export const CAMERA = {
  height: 255,
  back: 56,
  fov: 46,
  boostFov: 55,
  follow: 5.2,
  lookAhead: 30,
  shakeDecay: 5,
};

export const PLAYER = {
  radius: 7.5,
  cruise: 172,
  minSpeed: 118,
  maxSpeed: 252,
  boost: 1.38,
  brake: 0.72,
  baseTurn: 74,
  highSpeedTurnPenalty: 0.34,
  gunRate: 12,
  gunDamage: 20,
  gunSpeed: 1500,
  gunHeatPerShot: 2.1,
  gunCool: 26,
  gunOverheatLock: 1.4,
  missileDamage: 62,
  missileSplash: 14,
  missileSpeed: 190,
  missileTurn: 2.6,
  missileLife: 5.5,
  lockTime: 0.7,
  lockRange: 720,
  lockCone: 0.5,
  missileCharges: 3,
  missileRecharge: 9,
  specialCd: 20,
  overdriveGain: 1,
  reviveHp: 0.5,
};

/** 雷电式竖版卷轴参数。 */
export const SHMUP = {
  fieldHeight: 160,
  cameraY: 620,
  altitude: 260,
  speed: 120,
  focusSpeed: 54,
  playerZ: 52,
  zLimit: 56,
  xLimit: 128,
  radius: 3,
  gunRate: 11,
  bulletDamage: 10,
  bulletSpeed: 620,
  bulletLife: 2.4,
  enemyBulletSpeed: 178,
  missileDamage: 66,
  missileCharges: 3,
  missileRecharge: 8,
  missileCooldown: 0.7,
  spawnZ: -88,
  scrollSpeed: 18,
};

export const MEDAL_RULES: MedalRule[] = [
  { id: 'fullClear', name: '全歼', desc: '完成全部指定目标', alloy: 80 },
  { id: 'sweep', name: '扫荡', desc: '摧毁全部可选目标', alloy: 60 },
  { id: 'noDamage', name: '无伤', desc: '未受伤且未使用重生', alloy: 100 },
  { id: 'comboMaster', name: '连击大师', desc: '最高连击达到 30', alloy: 60 },
];

export const UPGRADES = {
  hull: { name: '机体强化', desc: '装甲上限 +20% / 级', costs: [150, 300, 500] },
  gun: { name: '火力校准', desc: '主炮 +15%、导弹 +10% / 级', costs: [150, 300, 500] },
  link: { name: '灵契共鸣', desc: '特技冷却 −10%、解限获取 +10% / 级', costs: [150, 300, 500] },
} as const;

export type UpgradeId = keyof typeof UPGRADES;

export const COMBO_TIERS: Array<{ at: number; label: string; color: string }> = [
  { at: 30, label: 'RAMPAGE', color: '#f2b01e' },
  { at: 20, label: 'EXCELLENT', color: '#f2b01e' },
  { at: 10, label: 'GREAT', color: '#f2b01e' },
  { at: 5, label: 'GOOD', color: '#9db7a4' },
  { at: 0, label: 'OK', color: '#9aa6b8' },
];

export const QUALITY_PRESETS = {
  low: { dpr: 0.75, shadow: false, bloom: false, grain: 0.5, fog: true, maxParticles: 90 },
  medium: { dpr: 1.0, shadow: true, bloom: true, grain: 0.7, fog: true, maxParticles: 160 },
  high: { dpr: 1.25, shadow: true, bloom: true, grain: 1.0, fog: true, maxParticles: 260 },
} as const;
