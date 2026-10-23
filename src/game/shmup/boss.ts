import * as THREE from 'three';
import { SHMUP } from '../../data/config';
import type { Difficulty } from '../../data/types';
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

export class ShmupBoss {
  readonly group = new THREE.Group();
  readonly name = '天枢';
  readonly radius = 48;
  readonly tags = ['boss'];
  x: number;
  zRel = -50;
  hp: number;
  maxHp: number;
  phase = 1;
  dead = false;
  shieldActive = false;
  generatorsAlive = 0;
  private readonly stageX: number;
  private readonly core: THREE.Mesh;
  private readonly ring: THREE.Mesh;
  private readonly shield: THREE.Mesh;
  private readonly beam: THREE.Mesh;
  private fireTimer = 1.6;
  private missileTimer = 4;
  private addsTimer = 7;
  private beamTimer = 0;
  private beamTelegraph = 0;
  private age = 0;

  constructor(stageX: number, camZ: number, hp: number) {
    this.stageX = stageX;
    this.x = stageX;
    this.maxHp = hp;
    this.hp = hp;
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
    this.group.add(this.ring);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(12, 3, 30), armor);
      arm.position.set(Math.cos(a) * 30, 0, Math.sin(a) * 30);
      arm.rotation.y = -a;
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
    const iris = new THREE.Mesh(new THREE.SphereGeometry(5.5, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffd08a, toneMapped: false }));
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
      new THREE.BoxGeometry(24, 0.4, 170),
      new THREE.MeshBasicMaterial({ color: 0xff5a3d, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }),
    );
    this.beam.position.set(0, -2, 90);
    this.group.add(this.beam);
    this.group.position.set(this.x, SHMUP.altitude + 35, camZ + this.zRel);
  }

  update(dt: number, ctx: ShmupBossContext): void {
    if (this.dead) return;
    this.age += dt;
    this.x = this.stageX + Math.sin(this.age * 0.55) * 72;
    this.group.position.set(this.x, SHMUP.altitude + 35, ctx.camZ + this.zRel);
    this.group.rotation.y += dt * 0.15;
    this.ring.rotation.z += dt * 0.35;
    this.shield.visible = this.shieldActive;
    const rate = (this.phase === 3 ? 1.0 : this.phase === 2 ? 1.35 : 1.75) * (ctx.difficulty === 'hard' ? 0.82 : 1);
    this.fireTimer -= dt;
    if (this.fireTimer <= 0) {
      this.fireTimer = rate;
      this.fireFan(ctx);
    }
    this.missileTimer -= dt;
    if (this.missileTimer <= 0) {
      this.missileTimer = this.phase === 3 ? 3 : 4.4;
      const base = Math.atan2(ctx.player.x - this.x, ctx.player.zRel - this.zRel);
      for (let i = -1; i <= 1; i++) {
        const a = base + i * 0.16;
        ctx.bullets.spawnEnemy(this.x, this.zRel + 10, Math.sin(a) * 155, Math.cos(a) * 155, this.phase === 3 ? 12 : 10, {
          homing: true,
          color: 0xffb050,
          scale: 1.45,
        });
      }
    }
    this.addsTimer -= dt;
    if (this.addsTimer <= 0) {
      this.addsTimer = this.phase === 3 ? 6 : 8.5;
      ctx.spawnAdds(this.phase === 3 ? 3 : 2);
      ctx.radio('天枢', '「蚀灵子机，放出。」');
    }
    if (this.phase >= 2) this.updateBeam(dt, ctx);
  }

  private fireFan(ctx: ShmupBossContext): void {
    const count = this.phase === 3 ? 9 : 7;
    const spread = this.phase === 3 ? 0.85 : 0.65;
    for (let i = 0; i < count; i++) {
      const a = (i / (count - 1) - 0.5) * spread;
      const speed = this.phase === 3 ? 195 : 175;
      ctx.bullets.spawnEnemy(this.x, this.zRel + 12, Math.sin(a) * speed, Math.cos(a) * speed, this.phase === 3 ? 9 : 8, {
        color: this.phase === 3 ? 0xff4a3d : 0xff7a3d,
        scale: 1.25,
      });
    }
  }

  private updateBeam(dt: number, ctx: ShmupBossContext): void {
    const mat = this.beam.material as THREE.MeshBasicMaterial;
    if (this.beamTimer > 0) {
      this.beamTimer -= dt;
      mat.opacity = 0.35;
      if (Math.abs(ctx.player.x - this.x) < 14 && !ctx.player.dead) {
        ctx.onPlayerDamage(26 * dt);
      }
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
      this.hp = Math.max(this.maxHp * 0.34, this.hp - dmg);
    } else {
      this.hp -= dmg;
    }
    if (this.phase === 1 && this.hp <= this.maxHp * 0.66) {
      this.phase = 2;
      this.shieldActive = true;
      this.shield.visible = true;
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

  releaseShield(): void {
    this.shieldActive = false;
    this.shield.visible = false;
    if (this.hp <= this.maxHp * 0.33) this.phase = 3;
  }

  stun(seconds?: number): void {
    void seconds;
    /* Boss 不吃眩晕 */
  }

  mark(seconds?: number, multiplier?: number): void {
    void seconds;
    void multiplier;
    /* Boss 不吃标记 */
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
