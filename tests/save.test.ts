import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SAVE_KEY, SETTINGS_KEY } from '../src/data/config';
import { SaveService } from '../src/app/save';
import type { MissionResult } from '../src/data/types';

const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, String(value));
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
  clear: () => store.clear(),
  key: (index: number) => [...store.keys()][index] ?? null,
  get length() {
    return store.size;
  },
});

const result = (overrides: Partial<MissionResult> = {}): MissionResult => ({
  missionId: 'm1',
  girlId: 'qingluan',
  difficulty: 'normal',
  success: true,
  score: 12000,
  rank: 'S',
  kills: 20,
  totalTargets: 25,
  accuracy: 0.6,
  bestCombo: 35,
  time: 120,
  alloy: 500,
  medals: ['fullClear', 'noDamage'],
  medalsNew: [],
  damageTaken: 0,
  revives: 0,
  baseAlloy: 160,
  rankMultiplier: 1.5,
  medalAlloy: 180,
  firstClear: false,
  newGirls: [],
  newWeapons: [],
  isNewBest: false,
  bossDefeated: false,
  ...overrides,
});

describe('SaveService', () => {
  beforeEach(() => store.clear());

  it('新存档默认只有青鸾', () => {
    const save = new SaveService();
    expect(save.data.unlocks.girls).toEqual(['qingluan']);
    expect(save.data.progress.completed).toEqual([]);
    expect(save.hasProgress).toBe(false);
    expect(save.selectedGirl).toBe('qingluan');
  });

  it('首通写入进度、解锁、合金、勋章与信赖', () => {
    const save = new SaveService();
    const info = save.commitResult(result());
    expect(info.firstClear).toBe(true);
    expect(info.newGirls).toContain('akari');
    expect(info.newWeapons).toContain('missile');
    expect(info.newMedals).toContain('fullClear');
    expect(save.data.progress.completed).toContain('m1');
    expect(save.data.progress.lastMission).toBe('m2');
    expect(save.data.economy.alloy).toBe(500);
    expect(save.data.unlocks.girls).toContain('akari');
    expect(save.data.unlocks.weapons).toContain('missile');
    expect(save.data.trust.qingluan).toBe(2); // 首通 + 无伤
    expect(save.data.records.m1?.bestRank).toBe('S');
    expect(save.data.records.m1?.clears).toBe(1);
    expect(save.hasProgress).toBe(true);
  });

  it('重复通关不会重复解锁，但会累计通关次数', () => {
    const save = new SaveService();
    save.commitResult(result());
    const info = save.commitResult(result({ score: 13000, isNewBest: true }));
    expect(info.firstClear).toBe(false);
    expect(info.newGirls).toEqual([]);
    expect(save.data.records.m1?.clears).toBe(2);
    expect(save.data.records.m1?.bestScore).toBe(13000);
    expect(save.data.economy.alloy).toBe(1000);
  });

  it('失败结算不写合金与进度', () => {
    const save = new SaveService();
    const info = save.commitResult(result({ success: false, rank: '-', alloy: 0, medals: [] }));
    expect(info.firstClear).toBe(false);
    expect(save.data.progress.completed).toEqual([]);
    expect(save.data.economy.alloy).toBe(0);
  });

  it('升级消耗合金并提升机体数值', () => {
    const save = new SaveService();
    save.data.economy.alloy = 1000;
    const before = save.getLoadoutStats('qingluan').maxHp;
    expect(save.buyUpgrade('hull')).toBe(true);
    expect(save.data.upgrades.hull).toBe(1);
    expect(save.data.economy.alloy).toBe(850);
    expect(save.getLoadoutStats('qingluan').maxHp).toBeGreaterThan(before);
    expect(save.upgradeCost('hull')).toBe(300);
  });

  it('未解锁机娘不能选择', () => {
    const save = new SaveService();
    expect(save.selectGirl('snega')).toBe(false);
    expect(save.selectedGirl).toBe('qingluan');
    save.data.unlocks.girls.push('snega');
    expect(save.selectGirl('snega')).toBe(true);
    expect(save.selectedGirl).toBe('snega');
  });

  it('设置独立保存，重置进度不清设置', () => {
    const save = new SaveService();
    save.updateSettings({ quality: 'low', master: 0.3 });
    save.selectGirl('qingluan');
    save.commitResult(result());
    save.resetProgress();
    expect(save.data.progress.completed).toEqual([]);
    expect(save.settings.quality).toBe('low');
    expect(save.settings.master).toBe(0.3);

    const reloaded = new SaveService();
    expect(reloaded.settings.quality).toBe('low');
    expect(reloaded.data.progress.completed).toEqual([]);
  });

  it('损坏存档会备份并回退到新档', () => {
    store.set(SAVE_KEY, '{broken json');
    const save = new SaveService();
    expect(save.data.progress.completed).toEqual([]);
    expect([...store.keys()].some((k) => k.startsWith(`${SAVE_KEY}.corrupt.`))).toBe(true);
    expect(store.get(SAVE_KEY)).toBeUndefined();
  });

  it('设置中的非法数值会被夹取', () => {
    store.set(SETTINGS_KEY, JSON.stringify({ master: 5, sfx: -1, music: 0.4, quality: 'high' }));
    const save = new SaveService();
    expect(save.settings.master).toBeLessThanOrEqual(1);
    expect(save.settings.sfx).toBeGreaterThanOrEqual(0);
  });
});
