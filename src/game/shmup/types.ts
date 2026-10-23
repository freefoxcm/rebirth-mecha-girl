import type { MissionId, MissionResult, MissionSpec, ObjectiveSpec } from '../../data/types';

export interface ShmupTarget {
  x: number;
  zRel: number;
  radius: number;
  dead: boolean;
  tags: string[];
  name: string;
  damage(amount: number): boolean;
  stun(seconds: number): void;
  mark(seconds: number, multiplier: number): void;
}

export interface ShmupObjectiveState extends ObjectiveSpec {
  current: number;
  done: boolean;
  optional: boolean;
}

export interface ShmupBossStatus {
  name: string;
  subtitle: string;
  hp: number;
  maxHp: number;
  phase: number;
  shielded: boolean;
}

export interface ShmupSnapshot {
  missionId: MissionId;
  missionTitle: string;
  missionChapter: string;
  score: number;
  combo: number;
  bestCombo: number;
  comboRank: string;
  multiplier: number;
  hp: number;
  maxHp: number;
  heat: number;
  overheated: boolean;
  missiles: number;
  maxMissiles: number;
  missileRecharge: number;
  specialCooldown: number;
  specialMax: number;
  overdrive: number;
  overdriveActive: boolean;
  objectives: ShmupObjectiveState[];
  time: number;
  boss: ShmupBossStatus | null;
  stageProgress: number;
  stageName: string;
  playerX: number;
  playerZRel: number;
  camZ: number;
  stageX: number;
  fieldW: number;
  fieldH: number;
  focus: boolean;
  kills: number;
  totalTargets: number;
}

export interface ShmupInput {
  x: number;
  z: number;
  fire: boolean;
  missile: boolean;
  special: boolean;
  overdrive: boolean;
  focus: boolean;
}

export interface ShmupCallbacks {
  onCutIn: (kind: 'special' | 'revive' | 'overdrive' | 'boss', text: string, speaker: string) => void;
  onRadio: (speaker: string, text: string) => void;
  onResult: (result: MissionResult) => void;
  onShake: (amount: number) => void;
  onFlash: (amount: number) => void;
}
