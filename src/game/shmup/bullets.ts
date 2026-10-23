import * as THREE from 'three';
import { SHMUP } from '../../data/config';
import type { ShmupTarget } from './types';

interface Bullet {
  active: boolean;
  x: number;
  zRel: number;
  vx: number;
  vz: number;
  life: number;
  damage: number;
  radius: number;
  scale: number;
  homing: 'target' | 'player' | null;
  target: ShmupTarget | null;
  splash: number;
  color: number;
}

export interface BulletTarget {
  target: ShmupTarget;
  x: number;
  zRel: number;
  radius: number;
}

export interface BulletHooks {
  onPlayerHit: (amount: number, x: number, zRel: number) => void;
  onTargetHit: (target: ShmupTarget, damage: number, x: number, zRel: number, splash: number) => void;
}

const FRIENDLY_COUNT = 260;
const ENEMY_COUNT = 360;

const blank = (): Bullet => ({
  active: false,
  x: 0,
  zRel: 0,
  vx: 0,
  vz: 0,
  life: 0,
  damage: 0,
  radius: 1,
  scale: 1,
  homing: null,
  target: null,
  splash: 0,
  color: 0xffffff,
});

/** 屏幕坐标系下的双向弹幕池，玩家/敌机各一套实例化网格。 */
export class ShmupBullets {
  private readonly friendlyMesh: THREE.InstancedMesh;
  private readonly enemyMesh: THREE.InstancedMesh;
  private readonly friendly: Bullet[] = [];
  private readonly enemy: Bullet[] = [];
  private readonly dummy = new THREE.Object3D();
  private friendlyCursor = 0;
  private enemyCursor = 0;
  /** 由关卡运行器每帧写入，用于把屏幕 zRel 映射到世界坐标。 */
  camZ = 0;
  /** 关卡固定 X 轴，用于屏幕坐标系的越界判断。 */
  stageX = 0;

  constructor(scene: THREE.Scene) {
    const geo = new THREE.SphereGeometry(1, 6, 4);
    const friendlyMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    const enemyMat = new THREE.MeshBasicMaterial({ color: 0xffffff, toneMapped: false });
    this.friendlyMesh = new THREE.InstancedMesh(geo, friendlyMat, FRIENDLY_COUNT);
    this.enemyMesh = new THREE.InstancedMesh(geo, enemyMat, ENEMY_COUNT);
    for (const mesh of [this.friendlyMesh, this.enemyMesh]) {
      mesh.frustumCulled = false;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      scene.add(mesh);
    }
    for (let i = 0; i < FRIENDLY_COUNT; i++) {
      this.friendly.push(blank());
      this.hide(this.friendlyMesh, i);
      this.friendlyMesh.setColorAt(i, new THREE.Color(0x9fe8ff));
    }
    for (let i = 0; i < ENEMY_COUNT; i++) {
      this.enemy.push(blank());
      this.hide(this.enemyMesh, i);
      this.enemyMesh.setColorAt(i, new THREE.Color(0xff7a3d));
    }
  }

  private hide(mesh: THREE.InstancedMesh, slot: number): void {
    this.dummy.position.set(0, -1000, 0);
    this.dummy.scale.setScalar(0.001);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(slot, this.dummy.matrix);
  }

  private draw(mesh: THREE.InstancedMesh, slot: number, b: Bullet): void {
    this.dummy.position.set(b.x, SHMUP.altitude, this.camZ + b.zRel);
    this.dummy.scale.setScalar(b.scale);
    this.dummy.updateMatrix();
    mesh.setMatrixAt(slot, this.dummy.matrix);
    mesh.setColorAt(slot, new THREE.Color(b.color));
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }

  spawnFriendly(
    x: number,
    zRel: number,
    vx: number,
    vz: number,
    damage: number,
    options: { color?: number; scale?: number; homing?: ShmupTarget | null; splash?: number; radius?: number } = {},
  ): void {
    const slot = this.friendlyCursor++ % FRIENDLY_COUNT;
    const b = this.friendly[slot];
    b.active = true;
    b.x = x;
    b.zRel = zRel;
    b.vx = vx;
    b.vz = vz;
    b.life = SHMUP.bulletLife;
    b.damage = damage;
    b.radius = options.radius ?? 0.9;
    b.scale = options.scale ?? 1.3;
    b.homing = options.homing ? 'target' : null;
    b.target = options.homing ?? null;
    b.splash = options.splash ?? 0;
    b.color = options.color ?? 0x9fe8ff;
    this.draw(this.friendlyMesh, slot, b);
  }

  spawnEnemy(
    x: number,
    zRel: number,
    vx: number,
    vz: number,
    damage: number,
    options: { color?: number; scale?: number; homing?: boolean; radius?: number } = {},
  ): void {
    const slot = this.enemyCursor++ % ENEMY_COUNT;
    const b = this.enemy[slot];
    b.active = true;
    b.x = x;
    b.zRel = zRel;
    b.vx = vx;
    b.vz = vz;
    b.life = 5;
    b.damage = damage;
    b.radius = options.radius ?? 1.1;
    b.scale = options.scale ?? 1.45;
    b.homing = options.homing ? 'player' : null;
    b.target = null;
    b.splash = 0;
    b.color = options.color ?? 0xff7a3d;
    this.draw(this.enemyMesh, slot, b);
  }

  update(
    dt: number,
    player: { x: number; zRel: number; radius: number; dead: boolean },
    targets: BulletTarget[],
    hooks: BulletHooks,
  ): void {
    this.step(this.friendly, this.friendlyMesh, true, dt, player, targets, hooks);
    this.step(this.enemy, this.enemyMesh, false, dt, player, targets, hooks);
  }

  private step(
    pool: Bullet[],
    mesh: THREE.InstancedMesh,
    friendly: boolean,
    dt: number,
    player: { x: number; zRel: number; radius: number; dead: boolean },
    targets: BulletTarget[],
    hooks: BulletHooks,
  ): void {
    let dirty = false;
    for (let i = 0; i < pool.length; i++) {
      const b = pool[i];
      if (!b.active) continue;
      b.life -= dt;
      if (b.homing === 'target' && b.target) {
        if (b.target.dead) {
          b.homing = null;
          b.target = null;
        } else {
          const dx = b.target.x - b.x;
          const dz = b.target.zRel - b.zRel;
          const len = Math.hypot(dx, dz) || 1;
          const speed = Math.hypot(b.vx, b.vz) || 1;
          b.vx += ((dx / len) * speed - b.vx) * Math.min(1, dt * 5);
          b.vz += ((dz / len) * speed - b.vz) * Math.min(1, dt * 5);
        }
      } else if (b.homing === 'player' && !player.dead) {
        const dx = player.x - b.x;
        const dz = player.zRel - b.zRel;
        const len = Math.hypot(dx, dz) || 1;
        const speed = Math.hypot(b.vx, b.vz) || 1;
        b.vx += ((dx / len) * speed - b.vx) * Math.min(1, dt * 1.8);
        b.vz += ((dz / len) * speed - b.vz) * Math.min(1, dt * 1.8);
      }
      b.x += b.vx * dt;
      b.zRel += b.vz * dt;
      if (b.life <= 0 || Math.abs(b.x - this.stageX) > 240 || Math.abs(b.zRel) > 190) {
        b.active = false;
      } else if (friendly) {
        for (const t of targets) {
          if (t.target.dead) continue;
          if (Math.hypot(t.x - b.x, t.zRel - b.zRel) <= t.radius + b.radius) {
            b.active = false;
            hooks.onTargetHit(t.target, b.damage, b.x, b.zRel, b.splash);
            break;
          }
        }
      } else if (!player.dead && Math.hypot(player.x - b.x, player.zRel - b.zRel) <= player.radius + b.radius) {
        b.active = false;
        hooks.onPlayerHit(b.damage, b.x, b.zRel);
      }
      if (!b.active) {
        this.hide(mesh, i);
        dirty = true;
      } else {
        this.draw(mesh, i, b);
        dirty = true;
      }
    }
    if (dirty) mesh.instanceMatrix.needsUpdate = true;
  }

  clearEnemy(): number {
    let count = 0;
    this.enemy.forEach((b, i) => {
      if (b.active) {
        b.active = false;
        count++;
        this.hide(this.enemyMesh, i);
      }
    });
    this.enemyMesh.instanceMatrix.needsUpdate = true;
    return count;
  }

  get activeEnemyCount(): number {
    return this.enemy.filter((b) => b.active).length;
  }

  dispose(): void {
    this.friendlyMesh.geometry.dispose();
    (this.friendlyMesh.material as THREE.Material).dispose();
    this.enemyMesh.geometry.dispose();
    (this.enemyMesh.material as THREE.Material).dispose();
    this.friendlyMesh.removeFromParent();
    this.enemyMesh.removeFromParent();
  }
}
