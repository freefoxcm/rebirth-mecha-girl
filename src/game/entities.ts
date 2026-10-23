import * as THREE from 'three';
import type { Difficulty, GirlSpec, SpecialKind } from '../data/types';
import { ALTITUDE, PLAYER, MAP_HALF } from '../data/config';
import { clamp, damp, moveAngle } from '../core/math';
import type { Rng } from '../core/rng';
import type { AudioEngine } from '../core/audio';
import type { LoadoutStats } from '../app/save';
import { buildGirlJet, buildEnemyJet, type JetVisual } from '../render/jets';
import type { BoxCollider } from '../render/city';
import type { Effects } from './effects';

export interface Target {
  readonly pos: THREE.Vector3;
  readonly radius: number;
  readonly dead: boolean;
  readonly tags: string[];
  readonly name: string;
  damage(amount: number): boolean;
  stun(seconds: number): void;
  mark(seconds: number, multiplier: number): void;
}

const ENEMY_STATS: Record<
  string,
  { hp: number; speed: number; radius: number; fire: number; damage: number; bullet: number; score: number; homing?: boolean }
> = {
  drone: { hp: 22, speed: 118, radius: 10, fire: 1.9, damage: 5, bullet: 190, score: 160 },
  jet: { hp: 55, speed: 138, radius: 13, fire: 1.6, damage: 7, bullet: 230, score: 260 },
  gunship: { hp: 190, speed: 62, radius: 22, fire: 2.6, damage: 10, bullet: 170, score: 520, homing: true },
  turret: { hp: 55, speed: 0, radius: 12, fire: 2.2, damage: 7, bullet: 210, score: 220 },
  sam: { hp: 50, speed: 0, radius: 12, fire: 3.6, damage: 11, bullet: 150, score: 240, homing: true },
  supply: { hp: 35, speed: 0, radius: 12, fire: 999, damage: 0, bullet: 0, score: 90 },
  radar: { hp: 40, speed: 0, radius: 12, fire: 999, damage: 0, bullet: 0, score: 180 },
  ace: { hp: 420, speed: 152, radius: 16, fire: 1.4, damage: 9, bullet: 250, score: 900 },
  generator: { hp: 260, speed: 0, radius: 14, fire: 3.2, damage: 8, bullet: 180, score: 500 },
  boat: { hp: 230, speed: 0, radius: 20, fire: 3.4, damage: 10, bullet: 180, score: 620, homing: true },
};

export interface CombatContext {
  player: Player;
  projectiles: ProjectileSystem;
  effects: Effects;
  audio: AudioEngine;
  difficulty: Difficulty;
  onEnemyKilled: (enemy: Enemy, retreated: boolean) => void;
  onBossPhase: (phase: number) => void;
  onPlayerDamage: (amount: number) => void;
  spawnGenerators: () => void;
  spawnAdds: (count: number) => void;
  radio: (speaker: string, text: string) => void;
}

/** 敌方子弹池：一个 InstancedMesh 承担所有弹幕。 */
export class ProjectileSystem {
  readonly mesh: THREE.InstancedMesh;
  private readonly data: Array<{
    active: boolean;
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    life: number;
    damage: number;
    homing: boolean;
    turn: number;
  }> = [];
  private readonly dummy = new THREE.Object3D();
  private cursor = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(0.55, 6, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.mesh = new THREE.InstancedMesh(geo, mat, 140);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    for (let i = 0; i < 140; i++) {
      this.data.push({
        active: false,
        pos: new THREE.Vector3(0, -1000, 0),
        vel: new THREE.Vector3(),
        life: 0,
        damage: 0,
        homing: false,
        turn: 0,
      });
      this.dummy.position.set(0, -1000, 0);
      this.dummy.scale.setScalar(0.001);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
      this.mesh.setColorAt(i, new THREE.Color(0xff6a3d));
    }
    scene.add(this.mesh);
  }

  spawn(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    speed: number,
    damage: number,
    color = 0xff6a3d,
    homing = false,
  ): void {
    const i = this.cursor++ % this.data.length;
    const d = this.data[i];
    d.active = true;
    d.pos.copy(origin);
    d.vel.copy(dir).normalize().multiplyScalar(speed);
    d.life = homing ? 6 : 4;
    d.damage = damage;
    d.homing = homing;
    d.turn = homing ? 1.7 : 0;
    this.dummy.position.copy(origin);
    this.dummy.scale.setScalar(homing ? 1.5 : 1);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
    this.mesh.setColorAt(i, new THREE.Color(color));
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  /** 返回本帧命中玩家的总伤害。 */
  update(dt: number, player: Player): number {
    let damage = 0;
    for (let i = 0; i < this.data.length; i++) {
      const d = this.data[i];
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        this.deactivate(i, d);
        continue;
      }
      if (d.homing && !player.dead) {
        const to = new THREE.Vector3().subVectors(player.pos, d.pos).normalize();
        const current = d.vel.clone().normalize();
        const angle = current.angleTo(to);
        if (angle > 0.001) {
          const axis = new THREE.Vector3().crossVectors(current, to).normalize();
          current.applyAxisAngle(axis, Math.min(angle, d.turn * dt));
        }
        d.vel.copy(current.multiplyScalar(d.vel.length()));
      }
      d.pos.addScaledVector(d.vel, dt);
      if (!player.dead && d.pos.distanceToSquared(player.pos) < 9 * 9) {
        damage += d.damage;
        this.deactivate(i, d);
        continue;
      }
      if (d.pos.y < -20 || Math.abs(d.pos.x) > 1500 || Math.abs(d.pos.z) > 1500) {
        this.deactivate(i, d);
        continue;
      }
      this.dummy.position.copy(d.pos);
      this.dummy.scale.setScalar(d.homing ? 1.5 : 1);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    return damage;
  }

  private deactivate(i: number, d: (typeof this.data)[number]): void {
    d.active = false;
    d.life = 0;
    this.dummy.position.set(0, -1000, 0);
    this.dummy.scale.setScalar(0.001);
    this.dummy.updateMatrix();
    this.mesh.setMatrixAt(i, this.dummy.matrix);
  }

  clear(): number {
    let n = 0;
    this.data.forEach((d, i) => {
      if (d.active) {
        n++;
        this.deactivate(i, d);
      }
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    return n;
  }

  get activeCount(): number {
    return this.data.filter((d) => d.active).length;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
    this.mesh.removeFromParent();
  }
}

/** 玩家机娘：只负责飞行、装甲、热量、弹药与特技状态；命中判定在 Runner 里。 */
export class Player {
  readonly group = new THREE.Group();
  readonly visual: JetVisual;
  readonly pos = new THREE.Vector3();
  readonly velocity = new THREE.Vector3();
  readonly maxHp: number;
  readonly stats: LoadoutStats;
  readonly girl: GirlSpec;
  hp: number;
  heading = 0;
  speed = PLAYER.cruise;
  bank = 0;
  pitch = 0;
  heat = 0;
  overheated = false;
  heatLock = 0;
  gunCooldown = 0;
  missiles = PLAYER.missileCharges;
  missileRecharge = 0;
  specialCd = 0;
  overdrive = 0;
  overdriveActive = false;
  overdriveTimer = 0;
  invuln = 0;
  dead = false;
  reviveUsed = false;
  lastEvent: 'revive' | 'dead' | null = null;
  dashTimer = 0;
  dashCooldown = 0;
  private baseSpeed: number;
  private turnRate: number;
  private smokeTimer = 0;
  private fireHeld = false;

  constructor(girl: GirlSpec, stats: LoadoutStats, spawn: { x: number; z: number; heading: number }) {
    this.girl = girl;
    this.stats = stats;
    this.maxHp = stats.maxHp;
    this.hp = stats.maxHp;
    this.baseSpeed = stats.speed;
    this.turnRate = stats.turn;
    this.pos.set(spawn.x, ALTITUDE, spawn.z);
    this.heading = spawn.heading;
    this.visual = buildGirlJet(girl.jet, girl.palette);
    this.visual.group.scale.setScalar(1.7);
    this.visual.group.position.copy(this.pos);
    this.visual.group.rotation.y = this.heading;
    this.visual.setThrottle(0.55);
    this.group.add(this.visual.group);
  }

  get forward(): THREE.Vector3 {
    return new THREE.Vector3(-Math.sin(this.heading), 0, -Math.cos(this.heading));
  }

  get muzzle(): THREE.Vector3 {
    return this.pos.clone().addScaledVector(this.forward, 13).add(new THREE.Vector3(0, 1.4, 0));
  }

  update(
    dt: number,
    input: { throttleUp: boolean; throttleDown: boolean; boost: boolean; pointer: THREE.Vector3; arrows: { left: boolean; right: boolean; up: boolean; down: boolean } },
    colliders: BoxCollider[],
  ): 'wall' | 'boundary' | null {
    if (this.dead) return null;
    this.lastEvent = null;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.gunCooldown > 0) this.gunCooldown -= dt;
    if (this.heatLock > 0) {
      this.heatLock -= dt;
      if (this.heatLock <= 0) this.overheated = false;
    }
    this.heat = Math.max(0, this.heat - PLAYER.gunCool * dt);
    if (this.overheated && this.heat <= 0) this.overheated = false;
    if (this.specialCd > 0) this.specialCd = Math.max(0, this.specialCd - dt);
    if (this.dashCooldown > 0) this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    if (this.overdriveActive) {
      this.overdriveTimer -= dt;
      if (this.overdriveTimer <= 0) {
        this.overdriveActive = false;
        this.overdriveTimer = 0;
      }
    }
    if (this.missiles < PLAYER.missileCharges) {
      this.missileRecharge += dt;
      if (this.missileRecharge >= PLAYER.missileRecharge) {
        this.missileRecharge = 0;
        this.missiles = Math.min(PLAYER.missileCharges, this.missiles + 1);
      }
    }

    const desired = this.aimHeading(input.pointer, input.arrows);
    const speedNorm = clamp((this.speed - PLAYER.minSpeed) / (PLAYER.maxSpeed - PLAYER.minSpeed), 0, 1);
    const turnRate = this.turnRate * (1 - PLAYER.highSpeedTurnPenalty * speedNorm) * (Math.PI / 180);
    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
      this.speed = PLAYER.maxSpeed * 2.8;
    } else {
      const wanted =
        this.baseSpeed *
        (input.throttleUp ? 1.12 : input.throttleDown ? 0.72 : 1) *
        (input.boost ? PLAYER.boost : 1) *
        (this.overdriveActive ? 1.08 : 1);
      this.speed = damp(this.speed, clamp(wanted, PLAYER.minSpeed, PLAYER.maxSpeed * (input.boost ? 1.35 : 1.02)), 2.6, dt);
      this.heading = moveAngle(this.heading, desired, turnRate * dt);
    }

    const delta = ((desired - this.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const targetBank = clamp(delta * 1.6, -0.78, 0.78);
    this.bank = damp(this.bank, targetBank, 6, dt);
    this.pitch = damp(this.pitch, clamp((this.speed - PLAYER.cruise) / 320, -0.14, 0.14), 4, dt);
    this.visual.inner.rotation.z = this.bank;
    this.visual.inner.rotation.x = this.pitch;
    this.visual.setThrottle(clamp((this.speed - PLAYER.minSpeed) / (PLAYER.maxSpeed - PLAYER.minSpeed), 0.15, 1));

    const fwd = this.forward;
    this.velocity.copy(fwd).multiplyScalar(this.speed);
    this.pos.addScaledVector(fwd, this.speed * dt);

    let event: 'wall' | 'boundary' | null = null;
    if (Math.abs(this.pos.x) > MAP_HALF - 20 || Math.abs(this.pos.z) > MAP_HALF - 20) {
      this.pos.x = clamp(this.pos.x, -MAP_HALF + 20, MAP_HALF - 20);
      this.pos.z = clamp(this.pos.z, -MAP_HALF + 20, MAP_HALF - 20);
      event = 'boundary';
      if (this.invuln <= 0) this.hp -= 5 * dt;
    }
    for (const c of colliders) {
      const hw = c.w / 2 + 6;
      const hd = c.d / 2 + 6;
      if (Math.abs(this.pos.x - c.x) < hw && Math.abs(this.pos.z - c.z) < hd && this.pos.y < c.h) {
        this.pos.x += Math.sign(this.pos.x - c.x) * (hw - Math.abs(this.pos.x - c.x) + 0.5);
        this.pos.z += Math.sign(this.pos.z - c.z) * (hd - Math.abs(this.pos.z - c.z) + 0.5);
        this.hp -= 16;
        this.invuln = Math.max(this.invuln, 0.9);
        this.speed *= 0.55;
        this.visual.setDamage(1 - this.hp / this.maxHp);
        event = 'wall';
        break;
      }
    }
    if (this.hp <= 0) {
      const r = this.handleZeroHp();
      this.lastEvent = r;
    }

    this.visual.group.position.copy(this.pos);
    this.visual.group.rotation.y = this.heading;
    if (this.hp / this.maxHp < 0.35) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.08;
        // 由 Runner 触发的烟雾更合适，这里仅保留计时
      }
    }
    return event;
  }

  private aimHeading(pointer: THREE.Vector3, arrows: { left: boolean; right: boolean; up: boolean; down: boolean }): number {
    let yaw = this.heading;
    const dx = pointer.x - this.pos.x;
    const dz = pointer.z - this.pos.z;
    if (!arrows.left && !arrows.right && !arrows.up && !arrows.down && Math.hypot(dx, dz) > 12) {
      yaw = Math.atan2(-dx, -dz);
    }
    if (arrows.left) yaw += 0.06;
    if (arrows.right) yaw -= 0.06;
    if (arrows.up) yaw += 0;
    if (arrows.down) yaw += 0;
    return yaw;
  }

  canFire(): boolean {
    return !this.dead && this.gunCooldown <= 0 && !this.overheated;
  }

  consumeShot(): void {
    const rate = PLAYER.gunRate * (this.overdriveActive ? 1.35 : 1);
    this.gunCooldown = 1 / rate;
    if (!this.overdriveActive) {
      this.heat += PLAYER.gunHeatPerShot;
      if (this.heat >= 100) {
        this.heat = 100;
        this.overheated = true;
        this.heatLock = PLAYER.gunOverheatLock;
      }
    }
  }

  consumeMissiles(n: number): boolean {
    if (this.missiles <= 0) return false;
    this.missiles = Math.max(0, this.missiles - 1);
    this.missileRecharge = 0;
    return n > 0;
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
    this.dashTimer = 0.42;
    this.invuln = Math.max(this.invuln, 0.6);
    this.dashCooldown = 1.2;
    this.speed = PLAYER.maxSpeed * 1.6;
  }

  damage(amount: number): 'ignored' | 'hit' | 'revive' | 'dead' {
    if (this.dead) return 'ignored';
    if (this.invuln > 0 || this.dashTimer > 0) return 'ignored';
    this.hp -= amount;
    this.invuln = 0.18;
    this.visual.setDamage(1 - this.hp / this.maxHp);
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
      this.hp = Math.round(this.maxHp * PLAYER.reviveHp);
      this.invuln = 3;
      this.visual.setDamage(1 - this.hp / this.maxHp);
      return 'revive';
    }
    this.dead = true;
    this.hp = 0;
    return 'dead';
  }

  addKillCharge(score: number): void {
    this.addOverdrive(score >= 500 ? 14 : 8);
  }

  dispose(): void {
    this.visual.dispose();
    this.group.clear();
  }
}

/** 敌方单位：空中三种、地面四种、王牌与护盾发生器。 */
export class Enemy implements Target {
  readonly pos = new THREE.Vector3();
  readonly group = new THREE.Group();
  readonly type: string;
  readonly tags: string[];
  readonly name: string;
  readonly radius: number;
  readonly score: number;
  maxHp: number;
  hp: number;
  dead = false;
  retreated = false;
  handled = false;
  stunTimer = 0;
  markTimer = 0;
  markMultiplier = 1;
  private readonly stats: (typeof ENEMY_STATS)[string];
  private readonly isGround: boolean;
  private heading = 0;
  private fireTimer = 0;
  private model: THREE.Group | THREE.Object3D;
  private turretHead: THREE.Group | null = null;
  private readonly hpScale: number;
  private escaped = false;

  constructor(
    type: string,
    x: number,
    z: number,
    tags: string[],
    opts: { name?: string; hpScale?: number; ground?: boolean; y?: number } = {},
  ) {
    this.type = type;
    this.tags = tags;
    this.name = opts.name ?? type;
    this.stats = ENEMY_STATS[type] ?? ENEMY_STATS.jet;
    this.isGround = Boolean(opts.ground);
    this.hpScale = opts.hpScale ?? 1;
    this.maxHp = Math.round(this.stats.hp * this.hpScale);
    this.hp = this.maxHp;
    this.radius = this.stats.radius;
    this.score = this.stats.score;
    this.pos.set(x, opts.y ?? (this.isGround ? 0 : ALTITUDE), z);
    this.fireTimer = 0.8 + Math.random() * 2;
    this.model = this.isGround ? this.buildGround() : buildEnemyJet(this.airKind(), type === 'ace' ? 0xff3b30 : 0xff5a44);
    if (!this.isGround) {
      const m = this.model as THREE.Group;
      m.scale.setScalar(type === 'drone' ? 0.9 : type === 'gunship' ? 1.25 : 1.05);
    }
    this.group.add(this.model);
    this.group.position.copy(this.pos);
  }

  private airKind(): 'drone' | 'jet' | 'gunship' {
    return this.type === 'drone' ? 'drone' : this.type === 'gunship' ? 'gunship' : 'jet';
  }

  private buildGround(): THREE.Group {
    const g = new THREE.Group();
    const dark = new THREE.MeshStandardMaterial({ color: 0x2a3138, roughness: 0.7, metalness: 0.4 });
    const green = new THREE.MeshStandardMaterial({ color: 0x4a5138, roughness: 0.8, metalness: 0.2 });
    const red = new THREE.MeshBasicMaterial({ color: 0xff3b30, toneMapped: false });
    if (this.type === 'turret' || this.type === 'generator') {
      const base = new THREE.Mesh(new THREE.CylinderGeometry(7, 8, 3, 8), dark);
      base.position.y = 1.5;
      base.castShadow = true;
      g.add(base);
      const head = new THREE.Group();
      const body = new THREE.Mesh(new THREE.BoxGeometry(7, 3.4, 7), green);
      body.position.y = 3.2;
      head.add(body);
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.7, 9, 8), dark);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(0, 3.6, -5.5);
      head.add(barrel);
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.5, 6, 4), red);
      eye.position.set(0, 3.8, -1.2);
      head.add(eye);
      g.add(head);
      this.turretHead = head;
      // 沙袋环
      const ring = new THREE.Mesh(new THREE.TorusGeometry(11, 1.3, 5, 16), new THREE.MeshStandardMaterial({ color: 0x7a6b4f, roughness: 1 }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.7;
      g.add(ring);
    } else if (this.type === 'boat') {
      const hull = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 30), dark);
      hull.position.y = 2;
      hull.castShadow = true;
      g.add(hull);
      const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 1.2, 26), green);
      deck.position.y = 4.6;
      g.add(deck);
      const bridge = new THREE.Mesh(new THREE.BoxGeometry(7, 8, 7), dark);
      bridge.position.set(0, 8.5, 7);
      g.add(bridge);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 9, 5), dark);
      mast.position.set(0, 13, 5);
      g.add(mast);
      const launcher = new THREE.Mesh(new THREE.BoxGeometry(5, 2.4, 8), green);
      launcher.position.set(0, 5.8, -8);
      g.add(launcher);
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 4), red);
      light.position.set(0, 14.2, 5);
      g.add(light);
      const wake = new THREE.Mesh(new THREE.BoxGeometry(16, 0.1, 46), new THREE.MeshBasicMaterial({ color: 0x6fa8b8, transparent: true, opacity: 0.18 }));
      wake.position.y = 0.2;
      wake.position.z = 6;
      g.add(wake);
    } else if (this.type === 'sam' || this.type === 'supply') {
      const truck = new THREE.Mesh(new THREE.BoxGeometry(6, 3, 11), this.type === 'sam' ? green : dark);
      truck.position.y = 2.2;
      truck.castShadow = true;
      g.add(truck);
      const cab = new THREE.Mesh(new THREE.BoxGeometry(5.4, 2.4, 3), dark);
      cab.position.set(0, 3.5, -5);
      g.add(cab);
      for (const sx of [-2.6, 2.6]) {
        for (const sz of [-3.6, 3.2]) {
          const wheel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 0.7, 10), dark);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(sx, 1.1, sz);
          g.add(wheel);
        }
      }
      if (this.type === 'sam') {
        for (const sx of [-1.4, 1.4]) {
          const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 6, 8), dark);
          tube.rotation.x = -0.5;
          tube.position.set(sx, 4.5, 1.4);
          g.add(tube);
        }
      }
    } else {
      const dish = new THREE.Mesh(new THREE.CylinderGeometry(4, 1, 2.4, 8), dark);
      dish.position.y = 1.2;
      g.add(dish);
      const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 5, 5), dark);
      mast.position.y = 4;
      g.add(mast);
      const panel = new THREE.Mesh(new THREE.BoxGeometry(6, 0.4, 2.2), green);
      panel.position.y = 6;
      panel.rotation.x = 0.5;
      g.add(panel);
      const light = new THREE.Mesh(new THREE.SphereGeometry(0.4, 6, 4), red);
      light.position.y = 7;
      g.add(light);
    }
    g.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    return g;
  }

  update(dt: number, ctx: CombatContext): void {
    if (this.dead) return;
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      return;
    }
    if (this.markTimer > 0) this.markTimer -= dt;
    const player = ctx.player;
    if (!this.isGround) {
      const to = new THREE.Vector3().subVectors(player.pos, this.pos);
      const dist = to.length();
      const dir = to.clone().normalize();
      const tangent = new THREE.Vector3(-dir.z, 0, dir.x);
      const desiredDist = this.type === 'gunship' ? 330 : this.type === 'ace' ? 250 : 210;
      const radial = clamp((dist - desiredDist) / 220, -1, 1);
      const move = dir.clone().multiplyScalar(radial * 0.9).addScaledVector(tangent, this.type === 'ace' ? 0.8 : 0.55);
      move.y = 0;
      move.normalize().multiplyScalar(this.stats.speed);
      this.pos.addScaledVector(move, dt);
      this.pos.y = ALTITUDE + Math.sin(ctx.effects ? performance.now() * 0.001 + this.pos.x : 0) * 2;
      this.heading = Math.atan2(-move.x, -move.z);
      this.group.position.copy(this.pos);
      this.group.rotation.y = this.heading;
      this.group.rotation.z = clamp(-radial * 0.3, -0.35, 0.35);
    } else if (this.turretHead) {
      const dx = player.pos.x - this.pos.x;
      const dz = player.pos.z - this.pos.z;
      this.turretHead.rotation.y = Math.atan2(-dx, -dz);
    }

    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && player.pos.distanceTo(this.pos) < 900 && !player.dead) {
      this.fireTimer = this.stats.fire * (0.85 + Math.random() * 0.3);
      this.fire(ctx);
    }
    if (this.type === 'ace' && this.name === '夜枭' && !this.escaped && this.hp <= this.maxHp * 0.3) {
      this.escaped = true;
      this.retreated = true;
      this.dead = true;
      this.group.visible = false;
    }
  }

  private fire(ctx: CombatContext): void {
    const player = ctx.player;
    const origin = this.pos.clone();
    if (this.isGround) origin.y = this.pos.y + 4;
    const dist = origin.distanceTo(player.pos);
    const lead = player.velocity.clone().multiplyScalar((dist / this.stats.bullet) * 0.5);
    const aim = player.pos.clone().add(lead);
    const dir = aim.sub(origin).normalize();
    if (this.stats.homing) {
      ctx.projectiles.spawn(origin, dir, this.stats.bullet, this.stats.damage + (ctx.difficulty === 'hard' ? 3 : 0), 0xffa040, true);
      ctx.effects.smoke(origin, 0x333333, 2);
    } else if (this.type === 'drone') {
      ctx.projectiles.spawn(origin, dir, this.stats.bullet, this.stats.damage, 0xff6040);
    } else {
      for (let i = -1; i <= 1; i++) {
        const spread = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.025);
        ctx.projectiles.spawn(origin, spread, this.stats.bullet, this.stats.damage + (ctx.difficulty === 'hard' ? 2 : 0), 0xff7a3d);
      }
    }
  }

  damage(amount: number): boolean {
    if (this.dead) return false;
    const dmg = amount * (this.markTimer > 0 ? this.markMultiplier : 1);
    this.hp -= dmg;
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.group.visible = false;
      return true;
    }
    return false;
  }

  stun(seconds: number): void {
    this.stunTimer = Math.max(this.stunTimer, seconds);
  }

  mark(seconds: number, multiplier: number): void {
    this.markTimer = Math.max(this.markTimer, seconds);
    this.markMultiplier = multiplier;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mat = o.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.group.removeFromParent();
  }
}

/** 天枢要塞：三阶段 Boss，第二阶段需要先拆四台护盾发生器。 */
export class Boss implements Target {
  readonly group = new THREE.Group();
  readonly pos = new THREE.Vector3();
  readonly radius = 70;
  readonly tags = ['boss'];
  readonly name = '天枢';
  hp: number;
  maxHp: number;
  phase = 1;
  dead = false;
  shieldActive = false;
  generatorsAlive = 0;
  private readonly core: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly shield: THREE.Mesh;
  private readonly beam: THREE.Mesh;
  private readonly owner: THREE.Group;
  private fireTimer = 2;
  private missileTimer = 5;
  private addsTimer = 8;
  private beamTelegraph = 0;
  private beamTimer = 0;
  private beamAngle = 0;
  private rotation = 0;
  private center: THREE.Vector3;
  private orbit = 0;

  constructor(center: { x: number; z: number }) {
    this.center = new THREE.Vector3(center.x, ALTITUDE + 40, center.z);
    this.pos.copy(this.center);
    this.maxHp = 3400;
    this.hp = this.maxHp;
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a2026, roughness: 0.5, metalness: 0.7 });
    const armor = new THREE.MeshStandardMaterial({ color: 0x2a333c, roughness: 0.45, metalness: 0.6 });
    const glow = new THREE.MeshBasicMaterial({ color: 0xff5a3d, toneMapped: false });
    const cyan = new THREE.MeshBasicMaterial({ color: 0x5fd8e8, toneMapped: false });

    const shell = new THREE.Mesh(new THREE.DodecahedronGeometry(26, 0), armor);
    shell.scale.set(1.6, 0.55, 1.2);
    shell.castShadow = true;
    this.group.add(shell);

    this.ring = new THREE.Mesh(new THREE.TorusGeometry(34, 2.2, 8, 48), dark);
    this.ring.rotation.x = Math.PI / 2;
    this.ring.castShadow = true;
    this.group.add(this.ring);

    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 30), armor);
      arm.position.set(Math.cos(a) * 30, 0, Math.sin(a) * 30);
      arm.rotation.y = -a;
      arm.castShadow = true;
      this.group.add(arm);
      const pod = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 10, 8), dark);
      pod.position.set(Math.cos(a) * 46, -2, Math.sin(a) * 46);
      pod.rotation.z = Math.PI / 2;
      this.group.add(pod);
      const light = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), i % 2 === 0 ? glow : cyan);
      light.position.set(Math.cos(a) * 46, 2, Math.sin(a) * 46);
      this.group.add(light);
    }

    this.core = new THREE.Mesh(new THREE.SphereGeometry(12, 24, 16), glow);
    this.core.position.set(0, 7, -20);
    this.group.add(this.core);
    const halo = new THREE.Mesh(new THREE.TorusGeometry(16, 0.55, 6, 40), cyan);
    halo.rotation.x = Math.PI / 2;
    this.core.add(halo);
    const iris = new THREE.Mesh(
      new THREE.SphereGeometry(5.5, 16, 12),
      new THREE.MeshBasicMaterial({ color: 0xffd08a, toneMapped: false }),
    );
    iris.position.set(0, 7, -30);
    this.group.add(iris);
    const crown = new THREE.Mesh(new THREE.TorusGeometry(38, 0.9, 6, 64), glow);
    crown.rotation.x = Math.PI / 2;
    crown.position.y = 4;
    this.group.add(crown);

    this.shield = new THREE.Mesh(
      new THREE.SphereGeometry(62, 24, 16),
      new THREE.MeshBasicMaterial({ color: 0x5fd8e8, wireframe: true, transparent: true, opacity: 0.08, toneMapped: false }),
    );
    this.shield.visible = false;
    this.group.add(this.shield);

    this.beam = new THREE.Mesh(
      new THREE.CylinderGeometry(2.2, 2.2, 900, 8, 1, true),
      new THREE.MeshBasicMaterial({ color: 0xff5a3d, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
    );
    this.beam.rotation.z = Math.PI / 2;
    this.beam.position.set(450, 0, 0);
    this.group.add(this.beam);

    this.owner = this.group;
    this.group.position.copy(this.pos);
  }

  private get tough(): boolean {
    return this.shieldActive;
  }

  update(dt: number, ctx: CombatContext): void {
    if (this.dead) return;
    this.rotation += dt * 0.18;
    this.orbit += dt * 0.11;
    this.pos.set(
      this.center.x + Math.cos(this.orbit) * 70,
      this.center.y + Math.sin(this.orbit * 2.1) * 8,
      this.center.z + Math.sin(this.orbit) * 55,
    );
    this.group.position.copy(this.pos);
    this.group.rotation.y = this.rotation;
    this.core.rotation.y -= dt * 0.7;
    this.shield.rotation.y += dt * 0.2;
    this.shield.visible = this.shieldActive;
    this.ring.rotation.z += dt * 0.4;

    let fireRate = this.phase === 3 ? 1.05 : this.phase === 2 ? 1.45 : 1.9;
    if (ctx.difficulty === 'hard') fireRate *= 0.82;
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = fireRate;
      this.fireRadial(ctx, this.phase === 3 ? 16 : 10, this.phase === 3 ? 210 : 185, this.phase === 3 ? 9 : 7);
      this.fireAimed(ctx);
    }
    this.missileTimer -= dt;
    if (this.missileTimer <= 0) {
      this.missileTimer = this.phase === 3 ? 3.2 : 4.6;
      const dir = ctx.player.pos.clone().sub(this.pos).normalize();
      for (let i = -1; i <= 1; i++) {
        const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.1);
        ctx.projectiles.spawn(this.pos.clone().add(new THREE.Vector3(0, -10, 0)), d, 165, this.phase === 3 ? 14 : 11, 0xffb050, true);
      }
      ctx.audio.play('missile');
    }
    this.addsTimer -= dt;
    if (this.addsTimer <= 0) {
      this.addsTimer = this.phase === 3 ? 6 : 9;
      ctx.spawnAdds(this.phase === 3 ? 3 : 2);
      ctx.radio('天枢', '「蚀灵子机，放出。」');
    }
    if (this.phase >= 2) this.updateBeam(dt, ctx);
  }

  private fireRadial(ctx: CombatContext, count: number, speed: number, damage: number): void {
    const base = Math.random() * Math.PI * 2;
    for (let i = 0; i < count; i++) {
      const a = base + (i / count) * Math.PI * 2;
      const dir = new THREE.Vector3(Math.cos(a), 0, Math.sin(a));
      ctx.projectiles.spawn(this.pos.clone(), dir, speed, damage, 0xff7a3d);
    }
    ctx.audio.play('hit');
  }

  private fireAimed(ctx: CombatContext): void {
    const target = ctx.player.pos.clone().addScaledVector(ctx.player.velocity, 0.35);
    const dir = target.sub(this.pos).normalize();
    for (let i = -1; i <= 1; i++) {
      const d = dir.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), i * 0.035);
      ctx.projectiles.spawn(this.pos.clone(), d, 300, this.phase === 3 ? 12 : 9, 0xffc060);
    }
  }

  private updateBeam(dt: number, ctx: CombatContext): void {
    if (this.beamTelegraph > 0) {
      this.beamTelegraph -= dt;
      this.beamAngle += dt * 0.6;
      const mat = this.beam.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.06 + Math.sin((1.5 - this.beamTelegraph) * 18) * 0.03;
      this.group.rotation.y = this.beamAngle;
      if (this.beamTelegraph <= 0) {
        this.beamTimer = 2.2;
        ctx.audio.play('alarm');
      }
      return;
    }
    if (this.beamTimer > 0) {
      this.beamTimer -= dt;
      const mat = this.beam.material as THREE.MeshBasicMaterial;
      mat.opacity = 0.45;
      this.beamAngle += dt * 1.1;
      this.group.rotation.y = this.beamAngle;
      // 玩家到射线距离
      const origin = this.pos;
      const dir = new THREE.Vector3(Math.cos(this.beamAngle), 0, -Math.sin(this.beamAngle));
      const to = new THREE.Vector3().subVectors(ctx.player.pos, origin);
      const t = clamp(to.dot(dir), 0, 900);
      const closest = origin.clone().addScaledVector(dir, t);
      if (closest.distanceTo(ctx.player.pos) < 16 && t < 900) {
        ctx.onPlayerDamage(24 * dt);
      }
      if (this.beamTimer <= 0) mat.opacity = 0;
      return;
    }
    // 间隙后重新起手
    this.beamTelegraph = 1.6;
  }

  damage(amount: number): boolean {
    if (this.dead) return false;
    let dmg = amount;
    if (this.shieldActive) {
      dmg *= 0.22;
      this.hp = Math.max(this.maxHp * 0.34, this.hp - dmg);
    } else {
      this.hp -= dmg;
    }
    if (this.phase === 1 && this.hp <= this.maxHp * 0.66) {
      this.phase = 2;
      this.shieldActive = true;
    }
    if (this.phase === 2 && this.hp <= this.maxHp * 0.33 && !this.shieldActive) {
      this.phase = 3;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  stun(): void {
    /* Boss 不吃眩晕 */
  }

  mark(): void {
    /* Boss 不吃标记 */
  }

  releaseShield(): void {
    this.shieldActive = false;
    if (this.hp <= this.maxHp * 0.33) this.phase = 3;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        o.geometry.dispose();
        const mat = o.material as THREE.Material | THREE.Material[];
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat.dispose();
      }
    });
    this.group.removeFromParent();
  }
}
