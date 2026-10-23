import * as THREE from 'three';
import type { GirlSpec } from '../../data/types';
import type { LoadoutStats } from '../../app/save';
import { SHMUP } from '../../data/config';
import { clamp, damp } from '../../core/math';
import { buildGirlJet, type JetVisual } from '../../render/girl-jets';
import type { ShmupInput } from './types';

/** 雷电式玩家机：屏幕坐标 x / zRel，八方向移动，机头永远朝上。 */
export class ShmupPlayer {
  readonly group = new THREE.Group();
  readonly visual: JetVisual;
  readonly pos = new THREE.Vector3();
  readonly stats: LoadoutStats;
  readonly girl: GirlSpec;
  readonly maxHp: number;
  readonly radius = SHMUP.radius;
  x = 0;
  zRel = SHMUP.playerZ;
  hp: number;
  heat = 0;
  overheated = false;
  heatLock = 0;
  gunCooldown = 0;
  missiles = SHMUP.missileCharges;
  missileRecharge = 0;
  missileCooldown = 0;
  specialCd = 0;
  overdrive = 0;
  overdriveActive = false;
  overdriveTimer = 0;
  invuln = 0;
  dead = false;
  reviveUsed = false;
  lastEvent: 'revive' | 'dead' | null = null;
  dashTimer = 0;
  bank = 0;
  focus = false;
  private smokeTimer = 0;

  constructor(girl: GirlSpec, stats: LoadoutStats, stageX: number, camZ: number) {
    this.girl = girl;
    this.stats = stats;
    this.maxHp = stats.maxHp;
    this.hp = stats.maxHp;
    this.x = stageX;
    this.visual = buildGirlJet(girl, { lod: 'game' });
    this.visual.group.scale.setScalar(1.1);
    this.visual.group.rotation.y = 0;
    this.visual.setThrottle(0.8);
    this.group.add(this.visual.group);
    this.updateWorld(camZ);
  }

  private updateWorld(camZ: number): void {
    this.pos.set(this.x, SHMUP.altitude, camZ + this.zRel);
    this.group.position.copy(this.pos);
    this.group.rotation.y = 0;
    this.visual.inner.rotation.z = this.bank;
  }

  update(dt: number, input: ShmupInput, camZ: number, stageX: number): void {
    if (this.dead) return;
    this.focus = input.focus;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.gunCooldown > 0) this.gunCooldown -= dt;
    if (this.missileCooldown > 0) this.missileCooldown -= dt;
    if (this.heatLock > 0) {
      this.heatLock -= dt;
      if (this.heatLock <= 0) this.overheated = false;
    }
    this.heat = Math.max(0, this.heat - 26 * dt);
    if (this.overheated && this.heat <= 0) this.overheated = false;
    if (this.specialCd > 0) this.specialCd = Math.max(0, this.specialCd - dt);
    if (this.overdriveActive) {
      this.overdriveTimer -= dt;
      if (this.overdriveTimer <= 0) {
        this.overdriveActive = false;
        this.overdriveTimer = 0;
      }
    }
    if (this.missiles < SHMUP.missileCharges) {
      this.missileRecharge += dt;
      if (this.missileRecharge >= SHMUP.missileRecharge) {
        this.missileRecharge = 0;
        this.missiles = Math.min(SHMUP.missileCharges, this.missiles + 1);
      }
    }

    const speed = SHMUP.speed * (this.stats.speed / 175) * (input.focus ? SHMUP.focusSpeed / SHMUP.speed : 1);
    const mx = clamp(input.x, -1, 1);
    const mz = clamp(input.z, -1, 1);
    const len = Math.hypot(mx, mz) || 1;
    const vx = (mx / len) * speed;
    const vz = (mz / len) * speed * 0.86;
    this.x = clamp(this.x + vx * dt, stageX - SHMUP.xLimit, stageX + SHMUP.xLimit);
    this.zRel = clamp(this.zRel + vz * dt, -SHMUP.zLimit, SHMUP.zLimit);
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.zRel = clamp(this.zRel - 260 * dt, -SHMUP.zLimit, SHMUP.zLimit);
      this.invuln = Math.max(this.invuln, 0.1);
    }
    const targetBank = -mx * 0.5;
    this.bank = damp(this.bank, targetBank, 9, dt);
    this.visual.setThrottle(this.focus ? 0.45 : 0.8);

    if (this.hp / this.maxHp < 0.35) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) this.smokeTimer = 0.09;
    }
    this.updateWorld(camZ);
  }

  canFire(): boolean {
    return !this.dead && this.gunCooldown <= 0 && !this.overheated;
  }

  consumeShot(): void {
    const rate = SHMUP.gunRate * (this.overdriveActive ? 1.3 : 1);
    this.gunCooldown = 1 / rate;
    if (!this.overdriveActive) {
      this.heat += 3.3;
      if (this.heat >= 100) {
        this.heat = 100;
        this.overheated = true;
        this.heatLock = 1.2;
      }
    }
  }

  canMissile(): boolean {
    return !this.dead && this.missiles > 0 && this.missileCooldown <= 0;
  }

  consumeMissile(): void {
    this.missiles = Math.max(0, this.missiles - 1);
    this.missileRecharge = 0;
    this.missileCooldown = SHMUP.missileCooldown;
  }

  startSpecial(): boolean {
    if (this.specialCd > 0 || this.dead) return false;
    this.specialCd = this.stats.specialCooldown;
    return true;
  }

  addOverdrive(n: number): void {
    if (this.overdriveActive) return;
    this.overdrive = clamp(this.overdrive + n * this.stats.overdriveGain, 0, 100);
  }

  startOverdrive(): boolean {
    if (this.overdrive < 100 || this.overdriveActive || this.dead) return false;
    this.overdrive = 0;
    this.overdriveActive = true;
    this.overdriveTimer = 8;
    return true;
  }

  startDash(): void {
    this.dashTimer = 0.35;
    this.invuln = Math.max(this.invuln, 0.5);
  }

  addKillCharge(score: number): void {
    this.addOverdrive(score >= 500 ? 14 : 8);
  }

  damage(amount: number): 'ignored' | 'hit' | 'revive' | 'dead' {
    if (this.dead) return 'ignored';
    if (this.invuln > 0) return 'ignored';
    this.hp -= amount;
    this.invuln = 0.4;
    if (this.hp <= 0) {
      const r = this.handleZeroHp();
      this.lastEvent = r;
      return r;
    }
    return 'hit';
  }

  private handleZeroHp(): 'revive' | 'dead' {
    if (!this.reviveUsed) {
      this.reviveUsed = true;
      this.hp = Math.round(this.maxHp * 0.5);
      this.invuln = 3;
      return 'revive';
    }
    this.dead = true;
    this.hp = 0;
    return 'dead';
  }

  dispose(): void {
    this.visual.dispose();
    this.group.clear();
  }
}
