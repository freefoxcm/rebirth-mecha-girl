import * as THREE from 'three';
import type { Difficulty, GirlSpec, MissionId, MissionResult, MissionSpec, Rank } from '../data/types';
import { ALTITUDE, PLAYER } from '../data/config';
import type { AudioEngine } from '../core/audio';
import type { Rng } from '../core/rng';
import type { LoadoutStats } from '../app/save';
import type { BoxCollider, City } from '../render/city';
import { Effects } from './effects';
import { Boss, Enemy, Player, ProjectileSystem, type CombatContext, type Target } from './entities';
import { evaluateMedals, medalAlloy, rankFor, RANK_MULTIPLIER, Scoring } from './scoring';

export interface ObjectiveState {
  id: string;
  label: string;
  tags: string[];
  count: number;
  current: number;
  done: boolean;
  optional: boolean;
}

export interface MarkerInfo {
  id: number;
  pos: THREE.Vector3;
  radius: number;
  kind: 'air' | 'ground' | 'ace' | 'boss';
  name: string;
  locked: boolean;
  distance: number;
  objective?: boolean;
}

export interface BossStatus {
  name: string;
  subtitle: string;
  hp: number;
  maxHp: number;
  phase: number;
  shielded: boolean;
}

export interface MissionSnapshot {
  missionId: MissionId;
  missionTitle: string;
  missionChapter: string;
  score: number;
  combo: number;
  bestCombo: number;
  comboRank: string;
  multiplier: number;
  hp: number;
  maxHp: number;
  heat: number;
  overheated: boolean;
  missiles: number;
  maxMissiles: number;
  missileRecharge: number;
  specialCooldown: number;
  specialMax: number;
  overdrive: number;
  overdriveActive: boolean;
  lockCount: number;
  lockMax: number;
  lockProgress: number;
  objectives: ObjectiveState[];
  time: number;
  boss: BossStatus | null;
  markers: MarkerInfo[];
  speed: number;
  kills: number;
  totalTargets: number;
  playerPos: THREE.Vector3;
  playerForward: THREE.Vector3;
}

export interface MissionInput {
  fire: boolean;
  lock: boolean;
  boost: boolean;
  throttleUp: boolean;
  throttleDown: boolean;
  special: boolean;
  overdrive: boolean;
  pointer: THREE.Vector3;
  arrows: { left: boolean; right: boolean; up: boolean; down: boolean };
}

export interface MissionCallbacks {
  onCutIn: (kind: 'special' | 'revive' | 'overdrive' | 'boss', text: string, speaker: string) => void;
  onRadio: (speaker: string, text: string) => void;
  onResult: (result: MissionResult) => void;
  onShake: (amount: number) => void;
  onFlash: (amount: number) => void;
}

interface MissileSlot {
  active: boolean;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  target: Target | null;
  life: number;
  damage: number;
  trail: number;
}

interface AllyDrone {
  active: boolean;
  mesh: THREE.Mesh;
  angle: number;
  life: number;
  fire: number;
}

export class MissionRunner {
  readonly player: Player;
  readonly objectives: ObjectiveState[];
  readonly projectiles: ProjectileSystem;
  readonly mission: MissionSpec;
  readonly difficulty: Difficulty;
  readonly scoring = new Scoring();
  enemies: Enemy[] = [];
  boss: Boss | null = null;
  time = 0;
  totalTargets = 0;
  state: 'running' | 'success' | 'fail' = 'running';
  shake = 0;
  flash = 0;
  private readonly scene: THREE.Scene;
  private readonly city: City;
  private readonly girl: GirlSpec;
  private readonly effects: Effects;
  private readonly audio: AudioEngine;
  private readonly rng: Rng;
  private readonly callbacks: MissionCallbacks;
  private readonly ctx: CombatContext;
  private readonly maxLocks: number;
  private waveIndex = 0;
  private endTimer = 0;
  private resultSent = false;
  private locks: Target[] = [];
  private lockCandidate: Target | null = null;
  private lockProgress = 0;
  private prevLock = false;
  private lastSpecial = false;
  private lastOverdrive = false;
  private comboMilestones = new Set<number>();
  private lowHpWarned = false;
  private generatorsSpawned = false;
  private lastBossPhase = 1;
  private bossHandled = false;
  private bossDefeated = false;
  private gunFocus: Target | null = null;
  private dashHits = new Set<Target>();
  private missiles: MissileSlot[] = [];
  private allies: AllyDrone[] = [];
  private readonly missileGeo: THREE.ConeGeometry;
  private readonly missileMat: THREE.MeshBasicMaterial;
  private readonly allyGeo: THREE.OctahedronGeometry;
  private readonly allyMat: THREE.MeshBasicMaterial;
  private boundaryWarned = false;

  constructor(opts: {
    scene: THREE.Scene;
    city: City;
    mission: MissionSpec;
    girl: GirlSpec;
    difficulty: Difficulty;
    stats: LoadoutStats;
    weapons: string[];
    effects: Effects;
    audio: AudioEngine;
    rng: Rng;
    callbacks: MissionCallbacks;
  }) {
    this.scene = opts.scene;
    this.city = opts.city;
    this.mission = opts.mission;
    this.girl = opts.girl;
    this.difficulty = opts.difficulty;
    this.effects = opts.effects;
    this.audio = opts.audio;
    this.rng = opts.rng;
    this.callbacks = opts.callbacks;
    this.maxLocks = 2 + (opts.weapons.includes('lockPlus') ? 2 : 0);

    this.player = new Player(opts.girl, opts.stats, opts.mission.spawn);
    this.scene.add(this.player.group);
    this.projectiles = new ProjectileSystem(this.scene);

    this.objectives = opts.mission.objectives.map((o) => ({
      ...o,
      current: 0,
      done: false,
      optional: Boolean(o.optional),
    }));

    if (opts.mission.boss) {
      const spec = opts.mission.boss;
      this.boss = new Boss({ x: opts.mission.zone.x, z: opts.mission.zone.z });
      this.boss.maxHp = spec.hp;
      this.boss.hp = spec.hp;
      this.scene.add(this.boss.group);
      this.totalTargets += 1;
      this.lastBossPhase = 1;
    }

    this.missileGeo = new THREE.ConeGeometry(0.4, 3, 6);
    this.missileGeo.rotateX(-Math.PI / 2);
    this.missileMat = new THREE.MeshBasicMaterial({ color: opts.girl.palette.glow, toneMapped: false });
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(this.missileGeo, this.missileMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.missiles.push({
        active: false,
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        target: null,
        life: 0,
        damage: 0,
        trail: 0,
      });
    }

    this.allyGeo = new THREE.OctahedronGeometry(1.4, 0);
    this.allyMat = new THREE.MeshBasicMaterial({ color: 0x6fe0ff, transparent: true, opacity: 0.85, toneMapped: false });
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(this.allyGeo, this.allyMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.allies.push({ active: false, mesh, angle: (i / 3) * Math.PI * 2, life: 0, fire: 0 });
    }

    this.ctx = {
      player: this.player,
      projectiles: this.projectiles,
      effects: this.effects,
      audio: this.audio,
      difficulty: this.difficulty,
      onEnemyKilled: () => {},
      onBossPhase: (phase) => this.callbacks.onRadio('天枢', phase === 2 ? '「护盾展开。你们打不穿。」' : '「核心暴露……不可能。」'),
      onPlayerDamage: (amount) => this.handlePlayerDamage(amount),
      spawnGenerators: () => this.spawnGenerators(),
      spawnAdds: (count) => this.spawnAdds(count),
      radio: (speaker, text) => this.callbacks.onRadio(speaker, text),
    };
  }

  update(dt: number, input: MissionInput): void {
    if (this.state !== 'running') {
      this.endTimer -= dt;
      this.effects.update(dt);
      this.projectiles.update(dt, this.player);
      this.shake = Math.max(0, this.shake - dt * 3);
      this.flash = Math.max(0, this.flash - dt * 3);
      if (this.endTimer <= 0 && !this.resultSent) {
        this.resultSent = true;
        this.callbacks.onResult(this.buildResult(this.state === 'success'));
      }
      return;
    }

    this.time += dt;
    this.scoring.update(dt);
    this.player.update(
      dt,
      {
        throttleUp: input.throttleUp,
        throttleDown: input.throttleDown,
        boost: input.boost,
        pointer: input.pointer,
        arrows: input.arrows,
      },
      this.city.colliders,
    );
    this.resolvePlayerEvent();

    this.spawnWaves();
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.handlePlayerDamage(this.projectiles.update(dt, this.player));
    this.updateMissiles(dt);
    this.updateAllies(dt);
    this.handleFireAndLock(dt, input);
    this.handleActions(input);
    this.updateDash(dt);
    this.effects.update(dt);
    this.shake = Math.max(0, this.shake - dt * 3);
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.player.hp / this.player.maxHp < 0.34 && !this.lowHpWarned && !this.player.dead) {
      this.lowHpWarned = true;
      this.callbacks.onRadio(this.girl.name, this.girl.quotes.lowHp);
    }
    if (!this.player.dead && this.player.lastEvent === null && this.state === 'running') {
      this.checkComplete();
    }
  }

  private spawnWaves(): void {
    while (this.waveIndex < this.mission.waves.length && this.mission.waves[this.waveIndex].at <= this.time) {
      const wave = this.mission.waves[this.waveIndex++];
      for (const group of wave.groups) {
        const positions = this.groupPositions(group);
        positions.forEach((pos, i) => {
          const enemy = new Enemy(group.type, pos.x, pos.z, group.tags, {
            name: group.name,
            hpScale: (group.hpScale ?? 1) * (this.difficulty === 'hard' ? 1.3 : 1),
            ground: group.ground,
            y: group.ground ? 0 : ALTITUDE,
          });
          if (group.name && group.count === 1) enemy.name;
          if (this.difficulty === 'hard' && group.tags.includes('jet')) enemy.hp = Math.round(enemy.hp * 1.2);
          void i;
          this.enemies.push(enemy);
          this.totalTargets++;
          this.scene.add(enemy.group);
        });
      }
      if (wave.message) this.callbacks.onRadio('系统', wave.message);
      if (wave.bark) this.emitBark(wave.bark);
      this.syncBossPhase();
    }
  }

  private groupPositions(group: { type: string; count: number; ground?: boolean; pattern?: string; radius?: number }): Array<{ x: number; z: number }> {
    const zone = this.mission.zone;
    const radius = group.radius ?? 380;
    if (group.ground) {
      if (group.type === 'boat') {
        return Array.from({ length: group.count }, (_, i) => ({ x: zone.x + 80 + i * 140, z: zone.z + 120 + i * 30 }));
      }
      if (group.pattern === 'line') {
        const n = Math.max(1, group.count);
        return Array.from({ length: group.count }, (_, i) => ({
          x: zone.x - radius * 0.5 + (i / Math.max(1, n - 1)) * radius,
          z: zone.z + (i % 2 === 0 ? -12 : 12),
        }));
      }
      return this.city.groundPoints(zone.x, zone.z, Math.min(radius, zone.radius), group.count, 991 + group.count * 17 + this.waveIndex);
    }
    const out: Array<{ x: number; z: number }> = [];
    const p = this.player.pos;
    const fwd = this.player.forward;
    for (let i = 0; i < group.count; i++) {
      if (group.pattern === 'line') {
        const lateral = (i - (group.count - 1) / 2) * 90;
        out.push({
          x: p.x + fwd.x * radius - fwd.z * lateral,
          z: p.z + fwd.z * radius + fwd.x * lateral,
        });
      } else if (group.pattern === 'ring') {
        const a = (i / group.count) * Math.PI * 2 + this.rng.range(0, 0.5);
        out.push({ x: p.x + Math.cos(a) * radius, z: p.z + Math.sin(a) * radius });
      } else {
        const a = this.rng.range(0, Math.PI * 2);
        const r = radius * Math.sqrt(this.rng.next());
        out.push({ x: zone.x + Math.cos(a) * r, z: zone.z + Math.sin(a) * r });
      }
    }
    return out.map((q) => ({
      x: Math.max(-1150, Math.min(1150, q.x)),
      z: Math.max(-1150, Math.min(1150, q.z)),
    }));
  }

  private updateEnemies(dt: number): void {
    for (const enemy of this.enemies) {
      if (enemy.dead) {
        if (!enemy.handled) this.handleKill(enemy, enemy.retreated);
        continue;
      }
      enemy.update(dt, this.ctx);
      if (enemy.dead && !enemy.handled) this.handleKill(enemy, enemy.retreated);
    }
    this.enemies = this.enemies.filter((e) => !e.handled || !e.dead);
  }

  private updateBoss(dt: number): void {
    if (!this.boss || this.boss.dead) return;
    this.boss.update(dt, this.ctx);
    this.syncBossPhase();
  }

  private syncBossPhase(): void {
    if (!this.boss || this.boss.dead) return;
    if (this.boss.phase !== this.lastBossPhase) {
      this.lastBossPhase = this.boss.phase;
      if (this.boss.phase === 2) {
        this.spawnGenerators();
        this.callbacks.onRadio('苍穹', '「护盾发生器出现了。先拆那四台！」');
        this.callbacks.onFlash(0.55);
      } else if (this.boss.phase === 3) {
        this.callbacks.onRadio('夜枭', '「陆沉，来做个了断。」');
        this.callbacks.onRadio('青鸾', '「核心暴露了。这一次，打准一点。」');
        this.callbacks.onFlash(0.4);
      }
    }
  }

  private spawnGenerators(): void {
    if (!this.boss || this.generatorsSpawned) return;
    this.generatorsSpawned = true;
    const boss = this.boss;
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
      const enemy = new Enemy('generator', boss.pos.x + Math.cos(a) * 105, boss.pos.z + Math.sin(a) * 105, ['generator'], {
        ground: true,
        y: boss.pos.y,
        hpScale: this.difficulty === 'hard' ? 1.25 : 1,
      });
      this.enemies.push(enemy);
      this.scene.add(enemy.group);
      this.totalTargets++;
    }
    boss.generatorsAlive = 4;
    this.callbacks.onRadio('星隼', '「四台发生器。拆掉之前，打核心没用。」');
    this.effects.shockwave(boss.pos, 150, 0x5fd8e8);
  }

  private spawnAdds(count: number): void {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + this.rng.range(0, 1);
      const x = this.mission.zone.x + Math.cos(a) * 220;
      const z = this.mission.zone.z + Math.sin(a) * 220;
      const enemy = new Enemy('drone', x, z, ['drone'], { ground: false });
      this.enemies.push(enemy);
      this.scene.add(enemy.group);
      this.totalTargets++;
    }
  }

  private handleFireAndLock(dt: number, input: MissionInput): void {
    if (input.fire) this.fireGun();

    if (input.lock && !this.prevLock) {
      this.locks = [];
      this.lockCandidate = null;
      this.lockProgress = 0;
    }
    if (input.lock) {
      if (!this.lockCandidate || this.lockCandidate.dead || !this.isLockable(this.lockCandidate)) {
        this.lockCandidate = this.findLockCandidate();
      }
      const candidate = this.lockCandidate;
      if (candidate) {
        this.lockProgress += dt / PLAYER.lockTime;
        if (this.lockProgress >= 1) {
          if (this.locks.length < this.maxLocks && !this.locks.includes(candidate)) {
            this.locks.push(candidate);
            this.audio.play('lock');
          }
          this.lockProgress = 0;
          this.lockCandidate = null;
        }
      } else {
        this.lockProgress = 0;
      }
    } else if (this.prevLock) {
      this.fireSalvo();
      this.locks = [];
      this.lockCandidate = null;
      this.lockProgress = 0;
    }
    this.prevLock = input.lock;
  }

  private isLockable(t: Target): boolean {
    if (t.dead) return false;
    const rel = new THREE.Vector3().subVectors(t.pos, this.player.pos);
    const dist = rel.length();
    if (dist > PLAYER.lockRange || dist < 24) return false;
    rel.normalize();
    return Math.acos(THREE.MathUtils.clamp(this.player.forward.dot(rel), -1, 1)) <= PLAYER.lockCone;
  }

  private findLockCandidate(): Target | null {
    const fwd = this.player.forward;
    let best: Target | null = null;
    let bestAngle = PLAYER.lockCone;
    for (const t of this.allTargets()) {
      if (t.dead || this.locks.includes(t)) continue;
      const rel = new THREE.Vector3().subVectors(t.pos, this.player.pos);
      const dist = rel.length();
      if (dist > PLAYER.lockRange || dist < 24) continue;
      rel.normalize();
      const angle = Math.acos(THREE.MathUtils.clamp(fwd.dot(rel), -1, 1));
      if (angle < bestAngle) {
        bestAngle = angle;
        best = t;
      }
    }
    return best;
  }

  private fireGun(): void {
    const p = this.player;
    if (!p.canFire()) return;
    p.consumeShot();
    this.scoring.addShot();
    const origin = p.muzzle;
    const dir = p.forward;
    const hit = this.pickGunTarget(origin, dir);
    const end = hit ? hit.pos.clone() : origin.clone().addScaledVector(dir, 900);
    this.effects.tracer(origin, end, this.girl.palette.glow, 0.09);
    if (hit) {
      this.scoring.addHit();
      const point = hit.pos.clone();
      this.effects.hit(point, 0xffd080);
      const dmg = PLAYER.gunDamage * p.stats.gunDamage * (p.overdriveActive ? 1.15 : 1);
      this.damageTarget(hit, dmg);
    }
    this.audio.play('gun');
  }

  /** 保持 1.5 秒左右的目标专注，避免子弹在多个目标之间来回分摊。 */
  private pickGunTarget(origin: THREE.Vector3, dir: THREE.Vector3): Target | null {
    const focus = this.gunFocus;
    if (focus && !focus.dead) {
      const dx = focus.pos.x - origin.x;
      const dz = focus.pos.z - origin.z;
      const tProj = dx * dir.x + dz * dir.z;
      if (tProj > 4 && tProj < 1000 && Math.abs(focus.pos.y - origin.y) < 170) {
        const px = origin.x + dir.x * tProj;
        const pz = origin.z + dir.z * tProj;
        if (Math.hypot(focus.pos.x - px, focus.pos.z - pz) <= focus.radius + 22) return focus;
      }
      this.gunFocus = null;
    }
    const next = this.pickTarget(origin, dir);
    this.gunFocus = next;
    return next;
  }

  /** 俯视空战：判定只在水平面，允许对地俯射。 */
  private pickTarget(origin: THREE.Vector3, dir: THREE.Vector3): Target | null {
    let best: Target | null = null;
    let bestT = 1000;
    for (const t of this.allTargets()) {
      if (t.dead) continue;
      const dx = t.pos.x - origin.x;
      const dz = t.pos.z - origin.z;
      const tProj = dx * dir.x + dz * dir.z;
      if (tProj <= 4 || tProj > 1000) continue;
      if (Math.abs(t.pos.y - origin.y) > 170) continue;
      const px = origin.x + dir.x * tProj;
      const pz = origin.z + dir.z * tProj;
      const miss = Math.hypot(t.pos.x - px, t.pos.z - pz);
      if (miss <= t.radius + 18 && tProj < bestT) {
        bestT = tProj;
        best = t;
      }
    }
    return best;
  }

  private fireSalvo(): void {
    const targets = [...this.locks];
    if (targets.length === 0 || this.player.missiles <= 0) return;
    this.player.consumeMissiles(targets.length);
    this.audio.play('missile');
    targets.forEach((target, i) => {
      this.fireMissile(target, PLAYER.missileDamage * this.player.stats.missileDamage, i - (targets.length - 1) / 2);
    });
    this.callbacks.onShake(0.25);
  }

  private fireMissile(target: Target | null, damage: number, lateral = 0): void {
    const slot = this.missiles.find((m) => !m.active);
    if (!slot) return;
    slot.active = true;
    slot.target = target;
    slot.life = PLAYER.missileLife;
    slot.damage = damage;
    slot.trail = 0;
    const right = new THREE.Vector3(Math.cos(this.player.heading), 0, -Math.sin(this.player.heading));
    slot.pos.copy(this.player.pos).addScaledVector(this.player.forward, 7).addScaledVector(right, lateral * 6);
    slot.vel.copy(this.player.forward).multiplyScalar(PLAYER.missileSpeed);
    slot.mesh.position.copy(slot.pos);
    slot.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), this.player.forward);
    slot.mesh.visible = true;
  }

  private updateMissiles(dt: number): void {
    const targets = this.allTargets();
    for (const m of this.missiles) {
      if (!m.active) continue;
      m.life -= dt;
      if (m.life <= 0) {
        this.explodeMissile(m, null);
        continue;
      }
      if (m.target && !m.target.dead) {
        const to = new THREE.Vector3().subVectors(m.target.pos, m.pos).normalize();
        const current = m.vel.clone().normalize();
        const axis = new THREE.Vector3().crossVectors(current, to);
        if (axis.lengthSq() > 0.0001) {
          axis.normalize();
          current.applyAxisAngle(axis, Math.min(current.angleTo(to), PLAYER.missileTurn * dt));
        }
        m.vel.copy(current.multiplyScalar(PLAYER.missileSpeed));
      }
      m.pos.addScaledVector(m.vel, dt);
      m.mesh.position.copy(m.pos);
      const dir = m.vel.clone().normalize();
      m.mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, -1), dir);
      m.trail -= dt;
      if (m.trail <= 0) {
        m.trail = 0.05;
        this.effects.smoke(m.pos, 0x4a4a4a, 1);
      }
      let hitTarget: Target | null = null;
      for (const t of targets) {
        if (t.dead) continue;
        if (m.pos.distanceToSquared(t.pos) < (t.radius + 6) * (t.radius + 6)) {
          hitTarget = t;
          break;
        }
      }
      if (hitTarget) this.explodeMissile(m, hitTarget);
    }
  }

  private explodeMissile(m: MissileSlot, target: Target | null): void {
    this.effects.explosion(m.pos, 1.2, 0xffb060);
    this.audio.play('explosion');
    if (target && !target.dead) {
      this.damageTarget(target, m.damage);
      for (const t of this.allTargets()) {
        if (t !== target && t.pos.distanceToSquared(m.pos) < 18 * 18) {
          this.damageTarget(t, m.damage * 0.35);
        }
      }
    }
    m.active = false;
    m.mesh.visible = false;
    m.target = null;
  }

  private damageTarget(target: Target, amount: number): void {
    if (target.dead) return;
    const killed = target.damage(amount);
    if (target === this.boss) {
      if (!killed) this.syncBossPhase();
      else this.handleBossKilled();
      if (killed) this.gunFocus = null;
      return;
    }
    if (killed) {
      const enemy = target as Enemy;
      if (!enemy.handled) this.handleKill(enemy, enemy.retreated);
    }
  }

  private handleKill(enemy: Enemy, retreated = false): void {
    if (enemy.handled) return;
    enemy.handled = true;
    if (this.gunFocus === enemy) this.gunFocus = null;
    if (enemy.group.parent) enemy.group.visible = false;
    if (!retreated) {
      this.effects.explosion(enemy.pos, enemy.type === 'gunship' || enemy.type === 'boat' ? 2 : 1, 0xffa050);
      this.audio.play('explosion');
    } else {
      this.effects.smoke(enemy.pos, 0x555555, 8);
      this.callbacks.onRadio('夜枭', '「下次见面，我会把你的机娘拆成零件。」');
    }
    const points = this.scoring.addKill(enemy.score, this.player.overdriveActive, this.difficulty === 'hard');
    this.player.addKillCharge(enemy.score);
    void points;
    for (const o of this.objectives) {
      if (o.done) continue;
      if (o.tags.some((tag) => enemy.tags.includes(tag))) {
        o.current = Math.min(o.count, o.current + 1);
        if (o.current >= o.count) o.done = true;
      }
    }
    if (enemy.tags.includes('generator') && this.boss) {
      this.boss.generatorsAlive = Math.max(0, this.boss.generatorsAlive - 1);
      if (this.boss.generatorsAlive === 0) {
        this.boss.releaseShield();
        this.syncBossPhase();
        this.callbacks.onRadio('苍穹', '「护盾消失！核心暴露了！」');
        this.callbacks.onFlash(0.5);
      }
    }
    this.comboCalls();
    this.checkComplete();
  }

  private handleBossKilled(): void {
    if (!this.boss || this.bossHandled) return;
    this.bossHandled = true;
    this.bossDefeated = true;
    const pos = this.boss.pos.clone();
    for (let i = 0; i < 8; i++) {
      this.laterExplosion(pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 120, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 120)), i * 0.12);
    }
    this.scoring.addKill(5000, this.player.overdriveActive, this.difficulty === 'hard');
    this.player.addKillCharge(5000);
    this.objectives.forEach((o) => {
      if (o.tags.includes('boss')) {
        o.current = o.count;
        o.done = true;
      }
    });
    this.callbacks.onRadio('青鸾', this.girl.quotes.clear);
    this.callbacks.onCutIn('boss', '「天枢，坠落。」', this.girl.name);
    this.callbacks.onFlash(1);
    this.callbacks.onShake(1);
    this.audio.play('explosion');
    this.checkComplete();
  }

  private laterExplosion(pos: THREE.Vector3, delay: number): void {
    // 用简单定时器把 Boss 死亡做成连续爆裂
    window.setTimeout(() => {
      this.effects.explosion(pos, 2.4, 0xffb060);
      this.audio.play('explosion');
    }, delay * 1000);
  }

  private comboCalls(): void {
    for (const at of [10, 20, 30]) {
      if (this.scoring.combo >= at && !this.comboMilestones.has(at)) {
        this.comboMilestones.add(at);
        const idx = at === 10 ? 0 : at === 20 ? 1 : 2;
        this.callbacks.onRadio(this.girl.name, this.girl.quotes.combo[idx]);
      }
    }
  }

  private handleActions(input: MissionInput): void {
    if (input.special && !this.lastSpecial) this.useSpecial();
    if (input.overdrive && !this.lastOverdrive) this.useOverdrive();
    this.lastSpecial = input.special;
    this.lastOverdrive = input.overdrive;
  }

  private useOverdrive(): void {
    if (!this.player.startOverdrive()) return;
    this.callbacks.onCutIn('overdrive', '灵契解限——这一分钟，我来当前锋。', this.girl.name);
    this.callbacks.onRadio(this.girl.name, this.girl.special.quote);
    this.callbacks.onFlash(0.6);
    this.effects.shockwave(this.player.pos, 45, this.girl.palette.glow);
    this.audio.play('special');
  }

  private useSpecial(): void {
    if (!this.player.startSpecial()) return;
    const special = this.girl.special;
    this.callbacks.onCutIn('special', special.quote, this.girl.name);
    this.callbacks.onRadio(this.girl.name, special.name);
    this.audio.play('special');
    const targets = this.allTargets();
    switch (special.kind) {
      case 'multilock': {
        const near = targets
          .filter((t) => !t.dead && t.pos.distanceTo(this.player.pos) < 900)
          .sort((a, b) => a.pos.distanceToSquared(this.player.pos) - b.pos.distanceToSquared(this.player.pos))
          .slice(0, 8);
        near.forEach((t, i) => this.fireMissile(t, 95, i - (near.length - 1) / 2));
        this.callbacks.onShake(0.3);
        break;
      }
      case 'railgun': {
        const origin = this.player.muzzle;
        const dir = this.player.forward;
        const end = origin.clone().addScaledVector(dir, 950);
        for (let i = -2; i <= 2; i++) {
          const offset = new THREE.Vector3(Math.cos(this.player.heading), 0, -Math.sin(this.player.heading)).multiplyScalar(i * 1.8);
          this.effects.tracer(origin.clone().add(offset), end.clone().add(offset), 0xff6a4a, 0.28);
        }
        this.effects.shockwave(end, 45, 0xff7a50);
        for (const t of targets) {
          const rel = new THREE.Vector3().subVectors(t.pos, origin);
          const proj = rel.dot(dir);
          if (proj < 0 || proj > 950) continue;
          const closest = origin.clone().addScaledVector(dir, proj);
          if (closest.distanceTo(t.pos) < t.radius + 9) this.damageTarget(t, 190);
        }
        this.callbacks.onShake(0.6);
        this.callbacks.onFlash(0.3);
        break;
      }
      case 'emp': {
        const cleared = this.projectiles.clear();
        for (const t of targets) {
          if (t.pos.distanceToSquared(this.player.pos) < 420 * 420) {
            t.stun(2.6);
            t.mark(8, 1.3);
          }
        }
        this.effects.shockwave(this.player.pos, 420, 0x5fd8e8);
        this.callbacks.onFlash(0.4);
        this.callbacks.onShake(0.25);
        this.callbacks.onRadio('苍穹', `「电磁脉冲展开。清掉 ${cleared} 发弹幕。」`);
        break;
      }
      case 'drones': {
        this.allies.forEach((a, i) => {
          a.active = true;
          a.life = 12;
          a.fire = 0.3 + i * 0.2;
          a.angle = (i / 3) * Math.PI * 2;
          a.mesh.visible = true;
        });
        this.callbacks.onRadio('星隼', '「群星，跟上。」');
        break;
      }
      case 'dash': {
        this.player.startDash();
        this.dashHits.clear();
        this.effects.shockwave(this.player.pos, 30, 0x9fefff);
        this.callbacks.onShake(0.4);
        break;
      }
    }
  }

  private updateDash(dt: number): void {
    if (this.player.dashTimer <= 0) return;
    for (const t of this.allTargets()) {
      if (this.dashHits.has(t)) continue;
      if (t.pos.distanceTo(this.player.pos) < 36) {
        this.dashHits.add(t);
        this.damageTarget(t, 150);
        this.effects.explosion(t.pos, 1, 0x9fefff);
      }
    }
    void dt;
  }

  private updateAllies(dt: number): void {
    if (!this.allies.some((a) => a.active)) return;
    for (const ally of this.allies) {
      if (!ally.active) continue;
      ally.life -= dt;
      if (ally.life <= 0) {
        ally.active = false;
        ally.mesh.visible = false;
        continue;
      }
      ally.angle += dt * 0.8;
      ally.mesh.position.set(
        this.player.pos.x + Math.cos(ally.angle) * 34,
        this.player.pos.y + 8 + Math.sin(ally.angle * 2) * 4,
        this.player.pos.z + Math.sin(ally.angle) * 34,
      );
      ally.fire -= dt;
      if (ally.fire <= 0) {
        ally.fire = 0.75;
        const target = this.allTargets()
          .filter((t) => !t.dead)
          .sort((a, b) => a.pos.distanceToSquared(this.player.pos) - b.pos.distanceToSquared(this.player.pos))[0];
        if (target) {
          this.effects.tracer(ally.mesh.position, target.pos, 0x6fe0ff, 0.08);
          this.damageTarget(target, 26);
        }
      }
    }
  }

  private resolvePlayerEvent(): void {
    const ev = this.player.lastEvent;
    if (!ev) return;
    this.player.lastEvent = null;
    if (ev === 'revive') this.onRevive();
    if (ev === 'dead') this.fail();
  }

  private handlePlayerDamage(amount: number): void {
    if (amount <= 0) return;
    const res = this.player.damage(amount);
    if (res === 'ignored') return;
    this.scoring.addDamage(amount);
    this.lastPlayerDamageVisual(amount);
    if (res === 'revive') this.onRevive();
    if (res === 'dead') this.fail();
  }

  private lastPlayerDamageVisual(amount: number): void {
    this.flash = Math.min(0.8, this.flash + 0.18);
    this.shake = Math.min(1, this.shake + amount / 24);
    this.audio.play('hit');
  }

  private onRevive(): void {
    this.scoring.revives++;
    this.lowHpWarned = false;
    this.callbacks.onCutIn('revive', this.girl.quotes.revive, this.girl.name);
    this.callbacks.onRadio(this.girl.name, '「灵契重连……起来！」');
    this.callbacks.onFlash(0.8);
    this.callbacks.onShake(0.8);
    this.effects.shockwave(this.player.pos, 70, this.girl.palette.glow);
    this.audio.play('revive');
  }

  private fail(): void {
    if (this.state !== 'running') return;
    this.state = 'fail';
    this.endTimer = 1.6;
    this.audio.play('fail');
    this.effects.explosion(this.player.pos, 3, 0xff7a40);
  }

  private succeed(): void {
    if (this.state !== 'running') return;
    this.state = 'success';
    this.endTimer = 1.4;
    this.audio.play('success');
    this.callbacks.onFlash(0.5);
  }

  private checkComplete(): void {
    if (this.state !== 'running' || this.player.dead) return;
    const requiredDone = this.objectives.filter((o) => !o.optional).every((o) => o.done);
    const wavesDone = this.waveIndex >= this.mission.waves.length;
    const bossDone = !this.mission.boss || this.bossDefeated;
    if (requiredDone && wavesDone && bossDone) this.succeed();
  }

  private buildResult(success: boolean): MissionResult {
    const rank: Rank | '-' = success ? rankFor(this.scoring.score, this.mission.rank) : '-';
    const medals = success
      ? evaluateMedals(this.objectives, this.scoring.bestCombo, Math.round(this.scoring.damageTaken), this.scoring.revives)
      : [];
    const baseAlloy = Math.round(this.mission.rewards.alloy * (this.difficulty === 'hard' ? 1.3 : 1));
    const rankMultiplier = rank === '-' ? 0 : RANK_MULTIPLIER[rank];
    const medalBonus = medalAlloy(medals);
    const alloy = success ? Math.round(baseAlloy * rankMultiplier) + medalBonus : 0;
    return {
      missionId: this.mission.id,
      girlId: this.girl.id,
      difficulty: this.difficulty,
      success,
      score: this.scoring.score,
      rank,
      kills: this.scoring.kills,
      totalTargets: Math.max(this.totalTargets, this.scoring.kills),
      accuracy: this.scoring.accuracy,
      bestCombo: this.scoring.bestCombo,
      time: this.time,
      alloy,
      medals,
      medalsNew: [],
      damageTaken: Math.round(this.scoring.damageTaken),
      revives: this.scoring.revives,
      baseAlloy,
      rankMultiplier,
      medalAlloy: medalBonus,
      firstClear: false,
      newGirls: success ? this.mission.rewards.girls ?? [] : [],
      newWeapons: success && this.mission.rewards.weapon ? [this.mission.rewards.weapon] : [],
      isNewBest: false,
      bossDefeated: this.bossDefeated,
      objectives: this.objectives.map((o) => ({
        label: o.label,
        current: o.current,
        count: o.count,
        optional: o.optional,
        done: o.done,
      })),
    };
  }

  private allTargets(): Target[] {
    const out: Target[] = [];
    for (const e of this.enemies) if (!e.dead) out.push(e);
    if (this.boss && !this.boss.dead) out.push(this.boss);
    return out;
  }

  private emitBark(raw: string): void {
    const match = raw.match(/^(青鸾|明璃|苍穹|星隼|霜翼|夜枭|天枢|陆沉)[:：]/);
    if (match) {
      this.callbacks.onRadio(match[1], raw.slice(match[0].length).replace(/^「|」$/g, ''));
    } else {
      this.callbacks.onRadio('系统', raw);
    }
  }

  getSnapshot(): MissionSnapshot {
    const markers: MarkerInfo[] = [];
    let id = 0;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const kind: MarkerInfo['kind'] = e.tags.includes('ace') ? 'ace' : e.tags.includes('generator') ? 'ground' : e.group.position.y < 20 ? 'ground' : 'air';
      markers.push({
        id: id++,
        pos: e.pos.clone(),
        radius: e.radius,
        kind,
        name: e.name,
        locked: this.locks.includes(e),
        distance: e.pos.distanceTo(this.player.pos),
        objective: this.objectives.some(
          (o) => !o.done && o.tags.some((tag) => e.tags.includes(tag)),
        ),
      });
    }
    if (this.boss && !this.boss.dead) {
      markers.push({
        id: id++,
        pos: this.boss.pos.clone(),
        radius: this.boss.radius,
        kind: 'boss',
        name: this.boss.name,
        locked: this.locks.includes(this.boss),
        distance: this.boss.pos.distanceTo(this.player.pos),
        objective: true,
      });
    }
    return {
      missionId: this.mission.id,
      missionTitle: this.mission.title,
      missionChapter: this.mission.chapter,
      score: this.scoring.score,
      combo: this.scoring.combo,
      bestCombo: this.scoring.bestCombo,
      comboRank: this.scoring.tier,
      multiplier: this.scoring.multiplier,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      heat: this.player.heat,
      overheated: this.player.overheated,
      missiles: this.player.missiles,
      maxMissiles: PLAYER.missileCharges,
      missileRecharge: this.player.missileRecharge,
      specialCooldown: this.player.specialCd,
      specialMax: this.player.stats.specialCooldown,
      overdrive: this.player.overdrive,
      overdriveActive: this.player.overdriveActive,
      lockCount: this.locks.length,
      lockMax: this.maxLocks,
      lockProgress: this.lockProgress,
      objectives: this.objectives,
      time: this.time,
      boss:
        this.boss && !this.boss.dead
          ? {
              name: this.boss.name,
              subtitle: this.mission.boss?.subtitle ?? '蚀灵核心',
              hp: this.boss.hp,
              maxHp: this.boss.maxHp,
              phase: this.boss.phase,
              shielded: this.boss.shieldActive,
            }
          : null,
      markers,
      speed: this.player.speed,
      kills: this.scoring.kills,
      totalTargets: this.totalTargets,
      playerPos: this.player.pos.clone(),
      playerForward: this.player.forward,
    };
  }

  get bossName(): string {
    return this.mission.boss?.name ?? '';
  }

  /** 调试：直接判胜/扣 Boss 血。 */
  forceWin(): void {
    this.objectives.forEach((o) => {
      o.current = o.count;
      o.done = true;
    });
    this.waveIndex = this.mission.waves.length;
    if (this.boss) {
      this.boss.hp = 0;
      this.boss.dead = true;
      this.bossDefeated = true;
    }
    this.scoring.score = Math.max(this.scoring.score, this.mission.rank.A);
    this.scoring.kills = Math.max(this.scoring.kills, 12);
    this.totalTargets = Math.max(this.totalTargets, 20);
    this.succeed();
    this.endTimer = 0.1;
  }

  debugDamageBoss(amount: number): void {
    if (!this.boss) return;
    if (this.boss.damage(amount)) this.handleBossKilled();
    else this.syncBossPhase();
  }

  dispose(): void {
    this.scene.remove(this.player.group);
    this.player.dispose();
    this.projectiles.dispose();
    for (const e of this.enemies) e.dispose();
    this.boss?.dispose();
    for (const m of this.missiles) {
      this.scene.remove(m.mesh);
    }
    this.missileGeo.dispose();
    this.missileMat.dispose();
    this.allyGeo.dispose();
    this.allyMat.dispose();
    this.scene.remove(this.player.group);
  }
}
