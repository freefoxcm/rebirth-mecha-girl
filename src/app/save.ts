import {
  DEFAULT_SETTINGS,
  SAVE_KEY,
  SETTINGS_KEY,
  UPGRADES,
  type UpgradeId,
} from '../data/config';
import { GIRL_ORDER, GIRLS } from '../data/girls';
import { MISSIONS, MISSION_ORDER, nextMission } from '../data/missions';
import type { GirlId, MissionId, MissionResult, Rank, SaveV1, Settings } from '../data/types';
import { readJSON, removeKey, writeJSON } from '../core/storage';

export interface LoadoutStats {
  maxHp: number;
  gunDamage: number;
  gunRate: number;
  missileDamage: number;
  specialCooldown: number;
  overdriveGain: number;
  speed: number;
  turn: number;
}

export interface CommitInfo {
  firstClear: boolean;
  newGirls: GirlId[];
  newWeapons: string[];
  newMedals: string[];
  isNewBest: boolean;
  trustGain: number;
  alloyAdded: number;
}

const freshSave = (): SaveV1 => ({
  version: 1,
  updatedAt: Date.now(),
  progress: { completed: [], storySeen: [], ending: false, lastMission: 'm1' },
  economy: { alloy: 0, medals: {} },
  unlocks: { girls: ['qingluan'], weapons: [] },
  upgrades: { hull: 0, gun: 0, link: 0 },
  trust: {},
  loadout: { girl: 'qingluan' },
  records: {},
});

function clampLevel(n: unknown): number {
  return Math.max(0, Math.min(3, Number.isFinite(Number(n)) ? Math.floor(Number(n)) : 0));
}

function normalize(raw: Partial<SaveV1> | null | undefined): SaveV1 {
  const base = freshSave();
  if (!raw || typeof raw !== 'object') return base;
  const completed = Array.isArray(raw.progress?.completed)
    ? raw.progress!.completed.filter((m): m is MissionId => MISSION_ORDER.includes(m as MissionId))
    : [];
  const girls = Array.isArray(raw.unlocks?.girls)
    ? raw.unlocks!.girls.filter((g): g is GirlId => GIRL_ORDER.includes(g as GirlId))
    : [];
  if (!girls.includes('qingluan')) girls.unshift('qingluan');
  const seen = Array.isArray(raw.progress?.storySeen) ? raw.progress!.storySeen.filter((s) => typeof s === 'string') : [];
  const trust: Partial<Record<GirlId, number>> = {};
  for (const g of GIRL_ORDER) {
    const v = raw.trust?.[g];
    if (typeof v === 'number') trust[g] = Math.max(0, Math.min(3, Math.floor(v)));
  }
  const last = raw.progress?.lastMission;
  return {
    version: 1,
    updatedAt: Date.now(),
    progress: {
      completed,
      storySeen: seen,
      ending: Boolean(raw.progress?.ending),
      lastMission: MISSION_ORDER.includes(last as MissionId) ? (last as MissionId) : 'm1',
    },
    economy: {
      alloy: Math.max(0, Math.floor(Number(raw.economy?.alloy) || 0)),
      medals: raw.economy?.medals && typeof raw.economy.medals === 'object' ? raw.economy.medals : {},
    },
    unlocks: {
      girls,
      weapons: Array.isArray(raw.unlocks?.weapons) ? raw.unlocks!.weapons.filter(Boolean) : [],
    },
    upgrades: {
      hull: clampLevel(raw.upgrades?.hull),
      gun: clampLevel(raw.upgrades?.gun),
      link: clampLevel(raw.upgrades?.link),
    },
    trust,
    loadout: { girl: girls.includes(raw.loadout?.girl as GirlId) ? (raw.loadout!.girl as GirlId) : 'qingluan' },
    records: raw.records && typeof raw.records === 'object' ? raw.records : {},
  };
}

const RANK_VALUE: Record<Rank, number> = { S: 4, A: 3, B: 2, C: 1 };

export class SaveService {
  data: SaveV1;
  settings: Settings;

  constructor() {
    this.data = normalize(readJSON<Partial<SaveV1> | null>(SAVE_KEY, null));
    this.settings = { ...DEFAULT_SETTINGS, ...(readJSON<Partial<Settings>>(SETTINGS_KEY, {}) ?? {}) };
    this.settings.master = Math.max(0, Math.min(1, Number(this.settings.master) || 0));
    this.settings.sfx = Math.max(0, Math.min(1, Number(this.settings.sfx) || 0));
    this.settings.music = Math.max(0, Math.min(1, Number(this.settings.music) || 0));
  }

  get hasProgress(): boolean {
    return this.data.progress.storySeen.length > 0 || this.data.progress.completed.length > 0;
  }

  save(): void {
    this.data.updatedAt = Date.now();
    writeJSON(SAVE_KEY, this.data);
  }

  saveSettings(): void {
    writeJSON(SETTINGS_KEY, this.settings);
  }

  updateSettings(patch: Partial<Settings>): void {
    Object.assign(this.settings, patch);
    this.saveSettings();
  }

  resetProgress(): void {
    this.data = freshSave();
    this.save();
    removeKey('rebirth.lastRun');
  }

  resetSettings(): void {
    this.settings = { ...DEFAULT_SETTINGS };
    this.saveSettings();
  }

  isGirlUnlocked(id: GirlId): boolean {
    return this.data.unlocks.girls.includes(id);
  }

  isMissionUnlocked(id: MissionId): boolean {
    const index = MISSION_ORDER.indexOf(id);
    if (index <= 0) return true;
    return this.data.progress.completed.includes(MISSION_ORDER[index - 1]);
  }

  isMissionCompleted(id: MissionId): boolean {
    return this.data.progress.completed.includes(id);
  }

  getNextMission(): MissionId {
    for (const id of MISSION_ORDER) {
      if (!this.data.progress.completed.includes(id)) return id;
    }
    return 'm4';
  }

  get selectedGirl(): GirlId {
    return this.data.loadout.girl;
  }

  selectGirl(id: GirlId): boolean {
    if (!this.isGirlUnlocked(id)) return false;
    this.data.loadout.girl = id;
    this.save();
    return true;
  }

  getTrust(id: GirlId): number {
    return this.data.trust[id] ?? 0;
  }

  getRank(id: MissionId): Rank | '-' {
    return this.data.records[id]?.bestRank ?? '-';
  }

  getMedals(id: MissionId): string[] {
    return this.data.economy.medals[id] ?? [];
  }

  getLoadoutStats(girlId: GirlId): LoadoutStats {
    const girl = GIRLS[girlId];
    const up = this.data.upgrades;
    return {
      maxHp: Math.round(girl.stats.hull * (1 + 0.2 * up.hull)),
      gunDamage: girl.stats.gun * (1 + 0.15 * up.gun),
      gunRate: 1,
      missileDamage: 1 + 0.1 * up.gun,
      specialCooldown: girl.special.cooldown * (1 - 0.1 * up.link),
      overdriveGain: 1 + 0.1 * up.link,
      speed: girl.stats.speed,
      turn: girl.stats.turn,
    };
  }

  upgradeLevel(id: UpgradeId): number {
    return this.data.upgrades[id] ?? 0;
  }

  upgradeCost(id: UpgradeId): number | null {
    const level = this.upgradeLevel(id);
    if (level >= 3) return null;
    return UPGRADES[id].costs[level] ?? null;
  }

  buyUpgrade(id: UpgradeId): boolean {
    const cost = this.upgradeCost(id);
    if (cost === null || this.data.economy.alloy < cost) return false;
    this.data.economy.alloy -= cost;
    this.data.upgrades[id] += 1;
    this.save();
    return true;
  }

  markStory(id: string): void {
    if (!this.data.progress.storySeen.includes(id)) {
      this.data.progress.storySeen.push(id);
    }
    this.save();
  }

  hasSeenStory(id: string): boolean {
    return this.data.progress.storySeen.includes(id);
  }

  /** 结算：写入纪录、合金、解锁、信赖，并返回给结算界面用的额外信息。 */
  commitResult(result: MissionResult): CommitInfo {
    const info: CommitInfo = {
      firstClear: false,
      newGirls: [],
      newWeapons: [],
      newMedals: [],
      isNewBest: false,
      trustGain: 0,
      alloyAdded: 0,
    };
    if (!result.success) return info;

    const mission = MISSIONS[result.missionId];
    const prevRecord = this.data.records[result.missionId];
    info.firstClear = !this.data.progress.completed.includes(result.missionId);
    info.isNewBest = !prevRecord || result.score > prevRecord.bestScore;

    if (info.firstClear) {
      this.data.progress.completed.push(result.missionId);
      for (const g of mission.rewards.girls ?? []) {
        if (!this.data.unlocks.girls.includes(g)) {
          this.data.unlocks.girls.push(g);
          info.newGirls.push(g);
        }
      }
      if (mission.rewards.weapon && !this.data.unlocks.weapons.includes(mission.rewards.weapon)) {
        this.data.unlocks.weapons.push(mission.rewards.weapon);
        info.newWeapons.push(mission.rewards.weapon);
      }
    }

    const existingMedals = new Set(this.data.economy.medals[result.missionId] ?? []);
    for (const medal of result.medals) {
      if (!existingMedals.has(medal)) info.newMedals.push(medal);
      existingMedals.add(medal);
    }
    this.data.economy.medals[result.missionId] = [...existingMedals] as typeof result.medals;

    const record = prevRecord ?? { bestScore: 0, bestCombo: 0, bestRank: 'C' as Rank, clears: 0, bestTime: Number.POSITIVE_INFINITY };
    this.data.records[result.missionId] = {
      bestScore: Math.max(record.bestScore, result.score),
      bestCombo: Math.max(record.bestCombo, result.bestCombo),
      bestRank:
        RANK_VALUE[(result.rank === '-' ? 'C' : result.rank) as Rank] > RANK_VALUE[record.bestRank]
          ? (result.rank as Rank)
          : record.bestRank,
      clears: record.clears + 1,
      bestTime: Math.min(record.bestTime, result.time),
    };

    const gain =
      (info.firstClear ? 1 : 0) +
      (result.medals.includes('noDamage') ? 1 : 0) +
      (result.missionId === 'm4' ? 1 : 0);
    if (gain > 0) {
      const before = this.getTrust(result.girlId);
      const after = Math.min(3, before + gain);
      this.data.trust[result.girlId] = after;
      info.trustGain = after - before;
    }

    const next = nextMission(result.missionId);
    this.data.progress.lastMission = next ?? result.missionId;
    if (result.missionId === 'm4') this.data.progress.ending = true;

    this.data.economy.alloy += result.alloy;
    info.alloyAdded = result.alloy;
    this.save();
    return info;
  }

  /** 升级面板用：返回当前等级对应的数值变化预览。 */
  upgradePreview(id: UpgradeId): string {
    const level = this.upgradeLevel(id);
    if (level >= 3) return '已满级';
    const def = UPGRADES[id];
    return `${def.desc}（当前 ${level}/3）`;
  }
}
