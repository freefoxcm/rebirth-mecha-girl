import * as THREE from 'three';
import type { Difficulty } from '../../data/types';
import { SHMUP } from '../../data/config';
import { damp } from '../../core/math';
import { buildEnemyJet } from '../../render/jets';
import type { ShmupBullets } from './bullets';
import type { Effects } from '../effects';
import type { ShmupPlayer } from './player';
import type { ShmupTarget } from './types';

export interface ShmupEnemyContext {
  camZ: number;
  stageX: number;
  player: ShmupPlayer;
  bullets: ShmupBullets;
  effects: Effects;
  difficulty: Difficulty;
  fieldH: number;
}

const STATS: Record<string, { hp: number; radius: number; fire: number; damage: number; score: number; hold: number }> = {
  drone: { hp: 24, radius: 9, fire: 2.1, damage: 5, score: 140, hold: -30 },
  jet: { hp: 55, radius: 12, fire: 1.8, damage: 6, score: 240, hold: -22 },
  gunship: { hp: 170, radius: 18, fire: 3.4, damage: 10, score: 480, hold: -8 },
  ace: { hp: 520, radius: 15, fire: 1.7, damage: 7, score: 900, hold: -28 },
  turret: { hp: 55, radius: 12, fire: 2.4, damage: 6, score: 200, hold: 0 },
  sam: { hp: 50, radius: 12, fire: 3.8, damage: 9, score: 220, hold: 0 },
  supply: { hp: 30, radius: 10, fire: 999, damage: 0, score: 70, hold: 0 },
  radar: { hp: 35, radius: 10, fire: 999, damage: 0, score: 120, hold: 0 },
  boat: { hp: 180, radius: 18, fire: 3.2, damage: 9, score: 420, hold: 0 },
  generator: { hp: 220, radius: 12, fire: 2.8, damage: 7, score: 400, hold: 0 },
};

/** 雷电式敌机：空中单位固定在屏幕坐标系中编队飞行，地面单位随城市滚动。 */
export class ShmupEnemy implements ShmupTarget {
  readonly type: string;
  readonly tags: string[];
  readonly name: string;
  readonly radius: number;
  readonly score: number;
  readonly group = new THREE.Group();
  readonly maxHp: number;
  x: number;
  zRel: number;
  hp: number;
  dead = false;
  handled = false;
  escaped = false;
  stunTimer = 0;
  markTimer = 0;
  markMultiplier = 1;
  private readonly isGround: boolean;
  private readonly staticUnit: boolean;
  private readonly worldZ: number;
  readonly y: number;
  private readonly stats: (typeof STATS)[string];
  private readonly baseX: number;
  private readonly phase: number;
  private age = 0;
  private fireTimer: number;
  private turretHead: THREE.Group | null = null;
  private model: THREE.Object3D;

  constructor(
    type: string,
    x: number,
    zRel: number,
    tags: string[],
    options: {
      name?: string;
      hpScale?: number;
      ground?: boolean;
      worldZ?: number;
      y?: number;
      staticUnit?: boolean;
    } = {},
  ) {
    this.type = type;
    this.tags = tags;
    this.name = options.name ?? type;
    this.stats = STATS[type] ?? STATS.jet;
    this.radius = this.stats.radius;
    this.score = this.stats.score;
    this.maxHp = Math.round(this.stats.hp * (options.hpScale ?? 1));
    this.hp = this.maxHp;
    this.isGround = Boolean(options.ground);
    this.staticUnit = Boolean(options.staticUnit);
    this.y = options.y ?? (this.isGround ? 0 : SHMUP.altitude);
    this.baseX = x;
    this.phase = Math.random() * Math.PI * 2;
    this.x = x;
    this.zRel = zRel;
    this.worldZ = options.worldZ ?? 0;
    this.fireTimer = 0.8 + Math.random() * 2.2;
    this.model = this.isGround ? this.buildGround() : buildEnemyJet(this.airKind(), type === 'ace' ? 0xff3b30 : 0xff5a44);
    if (!this.isGround) {
      const m = this.model as THREE.Group;
      m.scale.setScalar(type === 'drone' ? 1.25 : type === 'gunship' ? 1.5 : 1.3);
      m.rotation.y = Math.PI;
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(1.4, 8, 6),
        new THREE.MeshBasicMaterial({ color: type === 'ace' ? 0xff3b30 : 0xff6a3d, toneMapped: false }),
      );
      marker.position.set(0, 1.8, type === 'drone' ? 2 : 5);
      m.add(marker);
    }
    this.group.add(this.model);
    this.syncGroup(0);
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

  private syncGroup(camZ: number): void {
    if (this.isGround) {
      this.zRel = this.worldZ - camZ;
      this.group.position.set(this.x, this.y, this.worldZ);
    } else {
      this.group.position.set(this.x, this.y, camZ + this.zRel);
    }
  }

  update(dt: number, ctx: ShmupEnemyContext): void {
    if (this.dead) return;
    this.age += dt;
    if (this.stunTimer > 0) {
      this.stunTimer -= dt;
      this.syncGroup(ctx.camZ);
      return;
    }
    if (this.markTimer > 0) this.markTimer -= dt;
    if (this.isGround) {
      this.syncGroup(ctx.camZ);
      if (this.zRel > ctx.fieldH * 0.72) {
        this.escaped = true;
        this.dead = true;
        return;
      }
      if (this.turretHead) {
        const dx = ctx.player.x - this.x;
        const dz = ctx.player.zRel - this.zRel;
        this.turretHead.rotation.y = Math.atan2(-dx, -dz);
      }
    } else if (!this.staticUnit) {
      const hold = this.stats.hold;
      this.zRel = damp(this.zRel, hold, 1.3, dt);
      const t = this.age + this.phase;
      if (this.type === 'drone') {
        this.x = this.baseX + Math.sin(t * 1.7) * 30;
      } else if (this.type === 'jet') {
        this.x = this.baseX + Math.sin(t * 0.9) * 46;
      } else if (this.type === 'gunship') {
        this.x = this.baseX + Math.sin(t * 0.45) * 26;
      } else if (this.type === 'ace') {
        this.x += (ctx.player.x - this.x) * 0.18 * dt;
        this.x += Math.sin(t * 1.2) * 0.6;
      }
      this.x = THREE.MathUtils.clamp(this.x, ctx.stageX - 145, ctx.stageX + 145);
      this.syncGroup(ctx.camZ);
    } else {
      this.syncGroup(ctx.camZ);
    }

    if (Math.abs(this.zRel) > ctx.fieldH * 0.55) return;
    this.fireTimer -= dt;
    if (this.fireTimer <= 0 && this.stats.damage > 0 && !ctx.player.dead) {
      this.fireTimer = this.stats.fire * (this.type === 'ace' ? 1 : 0.85 + Math.random() * 0.35);
      this.fire(ctx);
    }
  }

  private fire(ctx: ShmupEnemyContext): void {
    const diff = ctx.difficulty === 'hard' ? 1.2 : 1;
    const dx = ctx.player.x - this.x;
    const dz = ctx.player.zRel - this.zRel;
    const distance = Math.hypot(dx, dz) || 1;
    const speed = SHMUP.enemyBulletSpeed;
    const base = Math.atan2(dx, dz);
    const damage = this.stats.damage * diff;
    const spawn = (angle: number, dmg: number, homing = false, color = 0xff7a3d, scale = 1.15) => {
      ctx.bullets.spawnEnemy(
        this.x,
        this.zRel,
        Math.sin(angle) * speed,
        Math.cos(angle) * speed,
        dmg,
        { homing, color, scale },
      );
    };
    if (this.type === 'drone') {
      spawn(base, damage);
    } else if (this.type === 'jet') {
      spawn(base, damage);
      spawn(base - 0.08, damage * 0.8);
      spawn(base + 0.08, damage * 0.8);
    } else if (this.type === 'gunship') {
      spawn(base, damage, true, 0xffb050, 1.4);
      spawn(base - 0.12, damage * 0.7);
      spawn(base + 0.12, damage * 0.7);
    } else if (this.type === 'ace') {
      for (let i = -2; i <= 2; i++) spawn(base + i * 0.1, damage, false, 0xff4a3d, 1.25);
    } else {
      spawn(base, damage, this.type === 'sam' || this.type === 'boat', 0xffb050, 1.3);
    }
    void distance;
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
