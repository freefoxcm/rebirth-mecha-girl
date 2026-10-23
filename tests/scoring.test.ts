import { describe, expect, it } from 'vitest';
import { Scoring, evaluateMedals, medalAlloy, rankFor } from '../src/game/scoring';

describe('Scoring', () => {
  it('累积连击、倍率与分数', () => {
    const s = new Scoring();
    s.addShot();
    s.addHit();
    const first = s.addKill(100, false, false);
    expect(first).toBe(110);
    expect(s.score).toBe(110);
    expect(s.combo).toBe(1);
    expect(s.kills).toBe(1);
    expect(s.bestCombo).toBe(1);
    expect(s.tier).toBe('OK');

    for (let i = 0; i < 9; i++) s.addKill(100, false, false);
    expect(s.combo).toBe(10);
    expect(s.bestCombo).toBe(10);
    expect(s.tier).toBe('GREAT');
    expect(s.multiplier).toBeCloseTo(2);
    expect(s.score).toBeGreaterThan(1000);
  });

  it('受伤重置连击，但不回滚分数', () => {
    const s = new Scoring();
    s.addKill(100, false, false);
    const before = s.score;
    s.addDamage(12);
    expect(s.combo).toBe(0);
    expect(s.comboTimer).toBe(0);
    expect(s.damageTaken).toBe(12);
    expect(s.score).toBe(before);
  });

  it('连击窗口超时后清空', () => {
    const s = new Scoring();
    s.addKill(50, false, false);
    s.update(1);
    expect(s.combo).toBe(1);
    s.update(3);
    expect(s.combo).toBe(0);
  });

  it('解限与困难难度会放大得分', () => {
    const a = new Scoring();
    const b = new Scoring();
    const c = new Scoring();
    expect(a.addKill(100, false, false)).toBe(110);
    expect(b.addKill(100, true, false)).toBe(220);
    expect(c.addKill(100, false, true)).toBe(165);
  });
});

describe('评级与勋章', () => {
  const rank = { S: 12000, A: 8000, B: 5000 };

  it('按阈值给 S/A/B/C', () => {
    expect(rankFor(13000, rank)).toBe('S');
    expect(rankFor(9000, rank)).toBe('A');
    expect(rankFor(6000, rank)).toBe('B');
    expect(rankFor(1000, rank)).toBe('C');
  });

  it('全歼、扫荡、无伤、连击大师', () => {
    const medals = evaluateMedals(
      [
        { done: true },
        { done: true },
        { done: true, optional: true },
      ],
      30,
      0,
      0,
    );
    expect(medals).toContain('fullClear');
    expect(medals).toContain('sweep');
    expect(medals).toContain('noDamage');
    expect(medals).toContain('comboMaster');
    expect(medalAlloy(medals)).toBe(300);
  });

  it('失败/受伤/低连击不给对应勋章', () => {
    const medals = evaluateMedals([{ done: false }, { done: false, optional: true }], 3, 10, 1);
    expect(medals).toEqual([]);
  });
});
