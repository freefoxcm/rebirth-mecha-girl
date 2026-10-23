import { COMBO_TIERS, MEDAL_RULES } from '../data/config';
import type { MedalId, MissionSpec, Rank } from '../data/types';

export class Scoring {
  score = 0;
  combo = 0;
  bestCombo = 0;
  comboTimer = 0;
  kills = 0;
  shots = 0;
  hits = 0;
  damageTaken = 0;
  revives = 0;

  update(dt: number): void {
    if (this.combo > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) {
        this.combo = 0;
        this.comboTimer = 0;
      }
    }
  }

  addShot(): void {
    this.shots++;
  }

  addHit(): void {
    this.hits++;
  }

  addKill(baseValue: number, overdrive: boolean, hard: boolean): number {
    this.combo++;
    this.bestCombo = Math.max(this.bestCombo, this.combo);
    this.comboTimer = 3.5;
    this.kills++;
    const points = Math.round(baseValue * this.multiplier * (overdrive ? 2 : 1) * (hard ? 1.5 : 1));
    this.score += points;
    return points;
  }

  addDamage(amount: number): void {
    this.damageTaken += amount;
    this.combo = 0;
    this.comboTimer = 0;
  }

  get multiplier(): number {
    return Math.min(5, 1 + this.combo * 0.1);
  }

  get tier(): string {
    for (const t of COMBO_TIERS) {
      if (this.combo >= t.at) return t.label;
    }
    return 'OK';
  }

  get accuracy(): number {
    return this.shots > 0 ? this.hits / this.shots : 0;
  }
}

export const RANK_MULTIPLIER: Record<Rank, number> = { S: 1.5, A: 1.25, B: 1.0, C: 0.75 };

export function rankFor(score: number, thresholds: MissionSpec['rank']): Rank {
  if (score >= thresholds.S) return 'S';
  if (score >= thresholds.A) return 'A';
  if (score >= thresholds.B) return 'B';
  return 'C';
}

export function evaluateMedals(
  objectives: Array<{ optional?: boolean; done: boolean }>,
  bestCombo: number,
  damageTaken: number,
  revives: number,
): MedalId[] {
  const medals: MedalId[] = [];
  const required = objectives.filter((o) => !o.optional);
  const optional = objectives.filter((o) => o.optional);
  if (required.length > 0 && required.every((o) => o.done)) medals.push('fullClear');
  if (optional.length > 0 && optional.every((o) => o.done)) medals.push('sweep');
  if (damageTaken === 0 && revives === 0) medals.push('noDamage');
  if (bestCombo >= 30) medals.push('comboMaster');
  return medals;
}

export function medalAlloy(medals: MedalId[]): number {
  return medals.reduce((sum, id) => sum + (MEDAL_RULES.find((m) => m.id === id)?.alloy ?? 0), 0);
}
