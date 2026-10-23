export type GirlId = 'qingluan' | 'akari' | 'haneul' | 'astra' | 'snega';
export type MissionId = 'm1' | 'm2' | 'm3' | 'm4';
export type Rank = 'S' | 'A' | 'B' | 'C';
export type MedalId = 'fullClear' | 'sweep' | 'noDamage' | 'comboMaster';
export type WeaponId = 'missile' | 'lockPlus' | 'piercer';
export type DistrictId = 'toll' | 'harbor' | 'downtown' | 'bay';
export type TimeOfDay = 'golden' | 'blue' | 'dusk' | 'storm';
export type Difficulty = 'normal' | 'hard';
export type SpecialKind = 'multilock' | 'railgun' | 'emp' | 'drones' | 'dash';
export type EnemyType = 'drone' | 'jet' | 'gunship' | 'turret' | 'sam' | 'supply' | 'ace' | 'boss' | 'generator' | 'boat';
export type MusicCue = 'menu' | 'combat' | 'boss' | 'ending' | 'none';
export type QualityLevel = 'low' | 'medium' | 'high';
export type ScreenId =
  | 'title'
  | 'hub'
  | 'briefing'
  | 'hangar'
  | 'codex'
  | 'dialogue'
  | 'mission'
  | 'results'
  | 'settings'
  | 'ending';

export interface Palette {
  base: number;
  secondary: number;
  accent: number;
  glow: number;
  dark: number;
}

export interface JetSpec {
  length: number;
  span: number;
  fuselageWidth: number;
  wingSweep: number;
  wingRootChord: number;
  wingTipChord: number;
  canards: boolean;
  twinTail: boolean;
  tailCant: number;
  tailHeight: number;
  engines: 1 | 2;
  engineSpacing: number;
  dihedral: number;
}

export interface GirlStats {
  hull: number;
  speed: number;
  turn: number;
  gun: number;
}

export interface GirlArt {
  poster: string;
  face: string;
  bust: string;
  transform: string;
  stages: string[];
  plane: string;
  humanoid: string;
  early: string | null;
}

export interface GirlQuotes {
  launch: string;
  intro: string;
  combo: string[];
  lowHp: string;
  special: string;
  revive: string;
  clear: string;
}

export interface GirlSpec {
  id: GirlId;
  name: string;
  en: string;
  role: string;
  tagline: string;
  bio: string;
  personality: string;
  stats: GirlStats;
  special: {
    kind: SpecialKind;
    name: string;
    desc: string;
    cooldown: number;
    quote: string;
  };
  palette: Palette;
  jet: JetSpec;
  art: GirlArt;
  unlockAfter: MissionId | null;
  quotes: GirlQuotes;
  trustLines: [string, string, string];
}

export interface ObjectiveSpec {
  id: string;
  label: string;
  tags: string[];
  count: number;
  optional?: boolean;
}

export interface SpawnGroup {
  type: EnemyType;
  count: number;
  tags: string[];
  ground?: boolean;
  pattern?: 'ring' | 'line' | 'scatter';
  radius?: number;
  name?: string;
  hpScale?: number;
}

export interface WaveSpec {
  at: number;
  groups: SpawnGroup[];
  message?: string;
  bark?: string;
}

export interface BossSpec {
  name: string;
  subtitle: string;
  hp: number;
  generators: number;
  phaseAt: [number, number];
}

export interface StageSpec {
  /** 卷轴固定所在的 X 轴。 */
  x: number;
  /** 相机起点 Z，向 -Z 滚动。 */
  startZ: number;
  /** 相机终点 Z。 */
  endZ: number;
  /** 米/秒。 */
  scrollSpeed: number;
}

export interface MissionSpec {
  id: MissionId;
  index: number;
  chapter: string;
  title: string;
  subtitle: string;
  district: DistrictId;
  timeOfDay: TimeOfDay;
  stage: StageSpec;
  spawn: { x: number; z: number; heading: number };
  zone: { x: number; z: number; radius: number };
  objectives: ObjectiveSpec[];
  waves: WaveSpec[];
  boss?: BossSpec;
  rewards: { alloy: number; girls?: GirlId[]; weapon?: WeaponId };
  storyBefore?: string;
  storyAfter?: string;
  rank: { S: number; A: number; B: number };
  tips: string[];
  intel: string[];
  threat: string;
  duration: string;
}

export type Speaker =
  | '陆沉'
  | '青鸾'
  | '明璃'
  | '苍穹'
  | '星隼'
  | '霜翼'
  | '夜枭'
  | '天枢'
  | '系统';

export interface DialogueLine {
  speaker: Speaker;
  text: string;
  girl?: GirlId;
  mood?: 'normal' | 'serious' | 'smug' | 'hurt';
  bg?: 'carrier' | 'sky' | 'city' | 'black' | 'harbor' | 'storm';
  sfx?: 'radio' | 'alarm' | 'revive';
  shake?: boolean;
}

export interface DialogueScene {
  id: string;
  chapter: string;
  title: string;
  bg: string;
  lines: DialogueLine[];
}

export interface MedalRule {
  id: MedalId;
  name: string;
  desc: string;
  alloy: number;
}

export interface MissionRecord {
  bestScore: number;
  bestCombo: number;
  bestRank: Rank;
  clears: number;
  bestTime: number;
}

export interface MissionResult {
  missionId: MissionId;
  girlId: GirlId;
  difficulty: Difficulty;
  success: boolean;
  score: number;
  rank: Rank | '-';
  kills: number;
  totalTargets: number;
  accuracy: number;
  bestCombo: number;
  time: number;
  alloy: number;
  medals: MedalId[];
  medalsNew: MedalId[];
  damageTaken: number;
  revives: number;
  baseAlloy: number;
  rankMultiplier: number;
  medalAlloy: number;
  firstClear: boolean;
  newGirls: GirlId[];
  newWeapons: WeaponId[];
  isNewBest: boolean;
  bossDefeated: boolean;
  objectives?: Array<{ label: string; current: number; count: number; optional: boolean; done: boolean }>;
}

export interface SaveV1 {
  version: 1;
  updatedAt: number;
  progress: {
    completed: MissionId[];
    storySeen: string[];
    ending: boolean;
    lastMission: MissionId;
  };
  economy: {
    alloy: number;
    medals: Partial<Record<MissionId, MedalId[]>>;
  };
  unlocks: {
    girls: GirlId[];
    weapons: WeaponId[];
  };
  upgrades: {
    hull: number;
    gun: number;
    link: number;
  };
  trust: Partial<Record<GirlId, number>>;
  loadout: {
    girl: GirlId;
  };
  records: Partial<Record<MissionId, MissionRecord>>;
}

export interface Settings {
  master: number;
  sfx: number;
  music: number;
  quality: QualityLevel;
  shake: boolean;
  flash: boolean;
  subtitles: boolean;
  showFps: boolean;
}

export interface HudSnapshot {
  score: number;
  combo: number;
  bestCombo: number;
  comboRank: string;
  multiplier: number;
  alloy: number;
  hp: number;
  maxHp: number;
  heat: number;
  overheat: boolean;
  missiles: number;
  maxMissiles: number;
  missileCooldown: number;
  specialCooldown: number;
  specialMax: number;
  overdrive: number;
  overdriveActive: boolean;
  lockCount: number;
  lockMax: number;
  objectiveText: string;
  objectiveCurrent: number;
  objectiveTotal: number;
  missionTitle: string;
  bossHp: number;
  bossMax: number;
  bossName: string;
  bossPhase: number;
  time: number;
  revived: boolean;
}
