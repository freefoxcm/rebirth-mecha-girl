import * as THREE from 'three';
import { SHMUP } from '../../data/config';
import type { BossSpec, Difficulty } from '../../data/types';
import type { ShmupBullets } from './bullets';

export interface ShmupBossContext {
  camZ: number;
  player: { x: number; zRel: number; dead: boolean };
  bullets: ShmupBullets;
  difficulty: Difficulty;
  onPlayerDamage: (amount: number) => void;
  spawnAdds: (count: number) => void;
  radio: (speaker: string, text: string) => void;
}

interface BossVisual {
  group: THREE.Group;
  ring: THREE.Mesh | null;
  shield: THREE.Mesh;
  beam: THREE.Mesh | null;
  radius: number;
  y: number;
}

const MAT = {
  dark: () => new THREE.MeshStandardMaterial({ color: 0x1a2026, roughness: 0.5, metalness: 0.7 }),
  armor: () => new THREE.MeshStandardMaterial({ color: 0x2a333c, roughness: 0.45, metalness: 0.6 }),
  steel: () => new THREE.MeshStandardMaterial({ color: 0x5b6266, roughness: 0.42, metalness: 0.7 }),
  red: () => new THREE.MeshBasicMaterial({ color: 0xff5a3d, toneMapped: false }),
  cyan: () => new THREE.MeshBasicMaterial({ color: 0x5fd8e8, toneMapped: false }),
  gold: () => new THREE.MeshBasicMaterial({ color: 0xf2b01e, toneMapped: false }),
};

function shieldFor(radius: number): THREE.Mesh {
  const shield = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.24, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0x5fd8e8, wireframe: true, transparent: true, opacity: 0.08, toneMapped: false }),
  );
  shield.visible = false;
  return shield;
}

function beamFor(color: number, width = 24): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.4, 170),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
  );
}

function buildIronjaw(): BossVisual {
  const group = new THREE.Group();
  const dark = MAT.dark();
  const armor = MAT.armor();
  const steel = MAT.steel();
  const red = MAT.red();
  // 宽体重型炮艇
  const hull = new THREE.Mesh(new THREE.BoxGeometry(34, 7, 46), armor);
  hull.position.y = 0;
  hull.castShadow = true;
  group.add(hull);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(17, 20, 4), dark);
  nose.rotation.x = -Math.PI / 2;
  nose.rotation.y = Math.PI / 4;
  nose.position.set(0, 0, -32);
  nose.scale.set(1, 0.18, 1);
  group.add(nose);
  // 后掠主翼与尾翼，让俯视轮廓不再是一块方盒
  for (const sign of [-1, 1]) {
    const wing = new THREE.Mesh(new THREE.BoxGeometry(30, 1.6, 17), armor);
    wing.position.set(sign * 27, 1, 1);
    wing.rotation.y = sign * 0.22;
    wing.rotation.z = sign * -0.05;
    group.add(wing);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(2, 1.2, 12), dark);
    tip.position.set(sign * 41, 1, 5);
    group.add(tip);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 7, 12), dark);
    fin.position.set(sign * 13, 4, 23);
    fin.rotation.z = sign * -0.3;
    group.add(fin);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(24, 0.18, 1.2), red);
    stripe.position.set(sign * 25, 2.1, 1);
    group.add(stripe);
  }
  const tail = new THREE.Mesh(new THREE.BoxGeometry(20, 1.4, 8), dark);
  tail.position.set(0, 1.2, 25);
  group.add(tail);
  const spine = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 38), dark);
  spine.position.set(0, 4.2, 4);
  group.add(spine);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(15, 5, 12), steel);
  bridge.position.set(0, 5.5, 12);
  group.add(bridge);
  const cockpit = new THREE.Mesh(new THREE.BoxGeometry(8, 1.6, 5), MAT.cyan());
  cockpit.position.set(0, 8.2, 13);
  group.add(cockpit);
  // 双联重炮
  for (const sign of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(5.2, 6.2, 9, 10), dark);
    pod.rotation.z = Math.PI / 2;
    pod.position.set(sign * 22, -1, -6);
    group.add(pod);
    for (let i = 0; i < 2; i++) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.5, 21, 8), steel);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(sign * 22, -1 + i * 2.6, -21);
      group.add(barrel);
      const tip = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.3, 1.2, 8), red);
      tip.rotation.x = Math.PI / 2;
      tip.position.set(sign * 22, -1 + i * 2.6, -32);
      group.add(tip);
    }
    // 侧舷导弹舱
    const rack = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 20), armor);
    rack.position.set(sign * 19, 4, 14);
    group.add(rack);
    for (let i = 0; i < 3; i++) {
      const cell = new THREE.Mesh(new THREE.BoxGeometry(4.8, 0.6, 4.4), steel);
      cell.position.set(sign * 19, 6.4, 7 + i * 6);
      group.add(cell);
    }
    // 引擎
    const engine = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.4, 12, 10), dark);
    engine.rotation.x = Math.PI / 2;
    engine.position.set(sign * 10, 0, 32);
    group.add(engine);
    const nozzle = new THREE.Mesh(new THREE.CircleGeometry(2.9, 14), MAT.cyan());
    nozzle.position.set(sign * 10, 0, 38.2);
    group.add(nozzle);
    const light = new THREE.Mesh(new THREE.SphereGeometry(1.2, 8, 6), red);
    light.position.set(sign * 30, 2, 18);
    group.add(light);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(44, 0.8, 5, 48), red);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 1.2;
  group.add(ring);
  const shield = shieldFor(52);
  group.add(shield);
  return { group, ring, shield, beam: null, radius: 48, y: SHMUP.altitude + 22 };
}

function buildTide(): BossVisual {
  const group = new THREE.Group();
  const dark = MAT.dark();
  const armor = MAT.armor();
  const steel = MAT.steel();
  const red = MAT.red();
  const cyan = MAT.cyan();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(34, 8, 112), dark);
  hull.position.y = 2;
  hull.castShadow = true;
  group.add(hull);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(31, 2, 106), armor);
  deck.position.y = 7;
  group.add(deck);
  const bow = new THREE.Mesh(new THREE.ConeGeometry(18, 28, 4), dark);
  bow.rotation.x = -Math.PI / 2;
  bow.rotation.y = Math.PI / 4;
  bow.scale.set(1, 0.4, 1);
  bow.position.set(0, 4, -66);
  group.add(bow);
  // 船体侧舷色带/舷号
  for (const sign of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 84), MAT.cyan());
    stripe.position.set(sign * 17.2, 6, 0);
    group.add(stripe);
    const hullBand = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 90), MAT.armor());
    hullBand.position.set(sign * 17.3, 3, 0);
    group.add(hullBand);
  }
  // 烟囱、后桅
  const funnel = new THREE.Mesh(new THREE.BoxGeometry(8, 16, 10), dark);
  funnel.position.set(0, 15, 40);
  group.add(funnel);
  const funnelTop = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 8), MAT.red());
  funnelTop.position.set(0, 24, 40);
  group.add(funnelTop);
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(20, 20, 26), steel);
  bridge.position.set(0, 17, 26);
  group.add(bridge);
  const bridgeTop = new THREE.Mesh(new THREE.BoxGeometry(16, 2, 20), armor);
  bridgeTop.position.set(0, 28, 26);
  group.add(bridgeTop);
  const window = new THREE.Mesh(new THREE.BoxGeometry(17, 2, 1), cyan);
  window.position.set(0, 22, 13.2);
  group.add(window);
  // 导弹舱
  for (let i = 0; i < 3; i++) {
    for (const sign of [-1, 1]) {
      const cell = new THREE.Mesh(new THREE.BoxGeometry(8, 1.6, 10), armor);
      cell.position.set(sign * 8, 8.2, -28 + i * 10);
      group.add(cell);
      const cover = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.4, 7.6), new THREE.MeshBasicMaterial({ color: 0x2b3f66 }));
      cover.position.set(sign * 8, 9.1, -28 + i * 10);
      group.add(cover);
    }
  }
  // 主炮塔
  for (const sign of [-1, 1]) {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 6.5, 3, 10), steel);
    base.position.set(sign * 10, 8.6, -38);
    group.add(base);
    const head = new THREE.Mesh(new THREE.BoxGeometry(7, 3, 7), armor);
    head.position.set(sign * 10, 11.2, -38);
    group.add(head);
    for (const side of [-1, 1]) {
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 11, 7), steel);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(sign * 10 + side * 1.4, 11.4, -47);
      group.add(barrel);
    }
  }
  // 近防炮/雷达
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.7, 18, 6), steel);
  mast.position.set(0, 34, 30);
  group.add(mast);
  const radar = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 3), steel);
  radar.position.set(0, 41, 30);
  group.add(radar);
  const radarLight = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), red);
  radarLight.position.set(0, 43, 30);
  group.add(radarLight);
  // 舰艏/舰艉灯
  for (const [x, z] of [
    [-15, -54],
    [15, -54],
    [-15, 54],
    [15, 54],
  ]) {
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.8, 8, 6), cyan);
    light.position.set(x, 7.5, z);
    group.add(light);
  }
  const ring = new THREE.Mesh(new THREE.TorusGeometry(52, 0.7, 5, 64), cyan);
  ring.rotation.x = Math.PI / 2;
  ring.position.y = 9;
  group.add(ring);
  // 舰艉航迹
  const wake = new THREE.Mesh(
    new THREE.PlaneGeometry(70, 120),
    new THREE.MeshBasicMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.08, depthWrite: false, side: THREE.DoubleSide }),
  );
  wake.rotation.x = -Math.PI / 2;
  wake.position.set(0, 0.6, 90);
  group.add(wake);
  const shield = shieldFor(58);
  group.add(shield);
  return { group, ring, shield, beam: null, radius: 56, y: 4 };
}

function buildCandle(): BossVisual {
  const group = new THREE.Group();
  const dark = MAT.dark();
  const armor = MAT.armor();
  const red = MAT.red();
  const gold = MAT.gold();
  const shell = new THREE.Mesh(new THREE.DodecahedronGeometry(24, 0), armor);
  shell.scale.set(1.5, 0.6, 1.25);
  group.add(shell);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(34, 1.6, 7, 56), dark);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const wing = new THREE.Mesh(new THREE.BoxGeometry(10, 2.4, 28), armor);
    wing.position.set(Math.cos(a) * 30, 0, Math.sin(a) * 30);
    wing.rotation.y = -a;
    group.add(wing);
    const tip = new THREE.Mesh(new THREE.ConeGeometry(3, 14, 6), dark);
    tip.rotation.z = Math.PI / 2;
    tip.position.set(Math.cos(a) * 44, 0, Math.sin(a) * 44);
    group.add(tip);
    const light = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), i % 2 === 0 ? gold : red);
    light.position.set(Math.cos(a) * 46, 3, Math.sin(a) * 46);
    group.add(light);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(10, 20, 14), red);
  core.position.y = 6;
  group.add(core);
  const crown = new THREE.Mesh(new THREE.TorusGeometry(30, 1, 6, 56), gold);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 8;
  group.add(crown);
  const shield = shieldFor(54);
  group.add(shield);
  const beam = beamFor(0xffb050, 22);
  beam.position.set(0, -1, 86);
  group.add(beam);
  return { group, ring, shield, beam, radius: 50, y: SHMUP.altitude + 30 };
}

function buildTianshu(): BossVisual {
  const group = new THREE.Group();
  const dark = MAT.dark();
  const armor = MAT.armor();
  const glow = MAT.red();
  const cyan = MAT.cyan();
  const shell = new THREE.Mesh(new THREE.DodecahedronGeometry(26, 0), armor);
  shell.scale.set(1.6, 0.55, 1.2);
  shell.castShadow = true;
  group.add(shell);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(34, 2.2, 8, 48), dark);
  ring.rotation.x = Math.PI / 2;
  group.add(ring);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 30), armor);
    arm.position.set(Math.cos(a) * 30, 0, Math.sin(a) * 30);
    arm.rotation.y = -a;
    group.add(arm);
    const pod = new THREE.Mesh(new THREE.CylinderGeometry(4, 5, 10, 8), dark);
    pod.position.set(Math.cos(a) * 46, -2, Math.sin(a) * 46);
    pod.rotation.z = Math.PI / 2;
    group.add(pod);
    const light = new THREE.Mesh(new THREE.SphereGeometry(1.4, 8, 6), i % 2 === 0 ? glow : cyan);
    light.position.set(Math.cos(a) * 46, 2, Math.sin(a) * 46);
    group.add(light);
  }
  const core = new THREE.Mesh(new THREE.SphereGeometry(12, 24, 16), glow);
  core.position.set(0, 7, -20);
  group.add(core);
  const iris = new THREE.Mesh(new THREE.SphereGeometry(5.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd08a, toneMapped: false }));
  iris.position.set(0, 7, -30);
  group.add(iris);
  const crown = new THREE.Mesh(new THREE.TorusGeometry(38, 0.9, 6, 64), glow);
  crown.rotation.x = Math.PI / 2;
  crown.position.y = 4;
  group.add(crown);
  const shield = shieldFor(50);
  group.add(shield);
  const beam = beamFor(0xff5a3d, 24);
  beam.position.set(0, -2, 90);
  group.add(beam);
  return { group, ring, shield, beam, radius: 48, y: SHMUP.altitude + 35 };
}

export class ShmupBoss {
  readonly group: THREE.Group;
  readonly spec: BossSpec;
  readonly name: string;
  readonly radius: number;
  readonly score: number;
  readonly tags = ['boss'];
  x: number;
  zRel: number;
  hp: number;
  maxHp: number;
  phase = 1;
  dead = false;
  shieldActive = false;
  generatorsAlive = 0;
  private readonly stageX: number;
  private readonly usesShield: boolean;
  private readonly usesBeam: boolean;
  private readonly ring: THREE.Mesh | null;
  private readonly shield: THREE.Mesh;
  private readonly beam: THREE.Mesh | null;
  private fireTimer = 1.6;
  private aimedTimer = 2.8;
  private missileTimer = 4;
  private addsTimer = 7;
  private beamTimer = 0;
  private beamTelegraph = 0;
  private age = 0;

  constructor(spec: BossSpec, stageX: number, camZ: number) {
    this.spec = spec;
    this.name = spec.name;
    this.score = spec.score;
    this.maxHp = spec.hp;
    this.hp = spec.hp;
    this.stageX = stageX;
    this.usesShield = spec.generators > 0;
    this.usesBeam = spec.kind === 'candle' || spec.kind === 'tianshu';
    const visual = spec.kind === 'ironjaw' ? buildIronjaw() : spec.kind === 'tide' ? buildTide() : spec.kind === 'candle' ? buildCandle() : buildTianshu();
    this.group = visual.group;
    this.ring = visual.ring;
    this.shield = visual.shield;
    this.beam = visual.beam;
    this.radius = visual.radius;
    this.x = stageX;
    this.zRel = spec.kind === 'ironjaw' ? -38 : spec.kind === 'tide' ? -22 : spec.kind === 'candle' ? -34 : -36;
    this.group.position.set(this.x, visual.y, camZ + this.zRel);
    if (spec.kind === 'ironjaw') this.group.rotation.y = Math.PI;
  }

  setRemainingGenerators(n: number): void {
    this.generatorsAlive = n;
  }

  update(dt: number, ctx: ShmupBossContext): void {
    if (this.dead) return;
    this.age += dt;
    const kind = this.spec.kind;
    if (kind === 'ironjaw') {
      this.x = this.stageX + Math.sin(this.age * 0.38) * 46;
      this.group.rotation.y = Math.PI + Math.sin(this.age * 0.2) * 0.05;
    } else if (kind === 'tide') {
      this.x = this.stageX + Math.sin(this.age * 0.26) * 52;
      this.group.rotation.y = Math.sin(this.age * 0.12) * 0.03;
    } else {
      this.x = this.stageX + Math.sin(this.age * (kind === 'candle' ? 0.46 : 0.55)) * (kind === 'candle' ? 52 : 55);
      this.group.rotation.y = Math.sin(this.age * 0.2) * 0.03;
    }
    const y = kind === 'tide' ? 4 : SHMUP.altitude + (kind === 'ironjaw' ? 22 : kind === 'candle' ? 30 : 35);
    this.group.position.set(this.x, y, ctx.camZ + this.zRel);
    if (this.ring) {
      this.ring.rotation.z += dt * (kind === 'tide' ? 0.12 : 0.3);
      (this.ring.material as THREE.MeshBasicMaterial).opacity = this.phase >= 2 ? 0.9 : 0.55;
    }
    this.shield.visible = this.shieldActive;
    const rateBase = kind === 'ironjaw' ? 2.2 : kind === 'tide' ? 2.15 : kind === 'candle' ? 1.85 : 1.75;
    const rate = rateBase * (this.phase === 3 ? 0.55 : this.phase === 2 ? 0.72 : 1) * (ctx.difficulty === 'hard' ? 0.82 : 1);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = rate;
      this.fireFan(ctx);
    }
    if (kind === 'ironjaw' || kind === 'tide') {
      this.aimedTimer -= dt;
      if (this.aimedTimer <= 0) {
        this.aimedTimer = this.phase === 3 ? 1.9 : 2.8;
        this.fireAimed(ctx);
      }
    }
    this.missileTimer -= dt;
    if (this.missileTimer <= 0) {
      this.missileTimer = kind === 'tide' ? (this.phase === 3 ? 2.6 : 3.8) : this.phase === 3 ? 3 : 4.4;
      this.fireMissiles(ctx);
    }
    this.addsTimer -= dt;
    if (this.addsTimer <= 0) {
      this.addsTimer = this.phase === 3 ? 6 : 8.5;
      ctx.spawnAdds(this.phase === 3 ? 3 : 2);
      ctx.radio(this.name, kind === 'tide' ? '「护航艇，出港。」' : '「子机，放出。」');
    }
    if (this.usesBeam && this.phase >= 2) this.updateBeam(dt, ctx);
  }

  private fireFan(ctx: ShmupBossContext): void {
    const kind = this.spec.kind;
    const count = this.phase === 3 ? 9 : 7;
    const spread = kind === 'tide' ? 1.1 : kind === 'ironjaw' ? 0.82 : 0.9;
    const speed = kind === 'ironjaw' ? 150 : kind === 'tide' ? 168 : 185;
    const color = kind === 'ironjaw' ? 0xff7a3d : kind === 'tide' ? 0x5fd8e8 : kind === 'candle' ? 0xffb050 : 0xff5a3d;
    for (let i = 0; i < count; i++) {
      const a = (i / (count - 1) - 0.5) * spread;
      ctx.bullets.spawnEnemy(this.x, this.zRel + (kind === 'tide' ? 6 : 12), Math.sin(a) * speed, Math.cos(a) * speed, this.phase === 3 ? 9 : 8, {
        color,
        scale: kind === 'ironjaw' ? 1.5 : 1.3,
      });
    }
  }

  private fireAimed(ctx: ShmupBossContext): void {
    const base = Math.atan2(ctx.player.x - this.x, ctx.player.zRel - this.zRel);
    const color = this.spec.kind === 'tide' ? 0x9fe8ff : 0xffb050;
    for (let i = -1; i <= 1; i += 2) {
      const a = base + i * 0.09;
      ctx.bullets.spawnEnemy(this.x, this.zRel + 8, Math.sin(a) * 220, Math.cos(a) * 220, this.phase === 3 ? 13 : 11, {
        color,
        scale: 1.5,
      });
    }
  }

  private fireMissiles(ctx: ShmupBossContext): void {
    const base = Math.atan2(ctx.player.x - this.x, ctx.player.zRel - this.zRel);
    const count = this.spec.kind === 'tide' ? 4 : 3;
    for (let i = 0; i < count; i++) {
      const a = base + (i - (count - 1) / 2) * 0.16;
      ctx.bullets.spawnEnemy(this.x, this.zRel + 10, Math.sin(a) * 155, Math.cos(a) * 155, this.phase === 3 ? 12 : 10, {
        homing: true,
        color: this.spec.kind === 'tide' ? 0x8fe8ff : 0xffb050,
        scale: 1.45,
      });
    }
  }

  private updateBeam(dt: number, ctx: ShmupBossContext): void {
    if (!this.beam) return;
    const mat = this.beam.material as THREE.MeshBasicMaterial;
    if (this.beamTimer > 0) {
      this.beamTimer -= dt;
      mat.opacity = 0.35;
      if (Math.abs(ctx.player.x - this.x) < 14 && !ctx.player.dead) ctx.onPlayerDamage(26 * dt);
      if (this.beamTimer <= 0) {
        mat.opacity = 0;
        this.beamTelegraph = 1.4;
      }
      return;
    }
    this.beamTelegraph -= dt;
    mat.opacity = this.beamTelegraph > 0 ? 0.06 + Math.sin(this.age * 18) * 0.03 : 0;
    if (this.beamTelegraph <= 0) {
      this.beamTimer = 2;
      mat.opacity = 0.35;
    }
  }

  damage(amount: number): boolean {
    if (this.dead) return false;
    let dmg = amount;
    if (this.shieldActive) {
      dmg *= 0.22;
      this.hp = Math.max(this.maxHp * this.spec.phaseAt[1], this.hp - dmg);
    } else {
      this.hp -= dmg;
    }
    if (this.phase === 1 && this.hp <= this.maxHp * this.spec.phaseAt[0]) {
      this.phase = 2;
      if (this.usesShield) {
        this.shieldActive = true;
        this.shield.visible = true;
      }
    }
    if (this.phase === 2 && this.hp <= this.maxHp * this.spec.phaseAt[1] && (!this.usesShield || !this.shieldActive)) {
      this.phase = 3;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      return true;
    }
    return false;
  }

  releaseShield(): void {
    this.shieldActive = false;
    this.shield.visible = false;
    if (this.hp <= this.maxHp * this.spec.phaseAt[1]) this.phase = 3;
  }

  stun(seconds?: number): void {
    void seconds;
  }

  mark(seconds?: number, multiplier?: number): void {
    void seconds;
    void multiplier;
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
