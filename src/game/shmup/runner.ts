import * as THREE from 'three';
import type { Difficulty, GirlSpec, MissionResult, MissionSpec } from '../../data/types';
import { SHMUP } from '../../data/config';
import type { LoadoutStats } from '../../app/save';
import type { AudioEngine } from '../../core/audio';
import type { Rng } from '../../core/rng';
import { clamp } from '../../core/math';
import type { City } from '../../render/city';
import type { Effects } from '../effects';
import { evaluateMedals, medalAlloy, rankFor, RANK_MULTIPLIER, Scoring } from '../scoring';
import { ShmupBullets, type BulletTarget } from './bullets';
import { ShmupPlayer } from './player';
import { ShmupEnemy, type ShmupEnemyContext } from './enemy';
import { ShmupBoss } from './boss';
import type { ShmupCallbacks, ShmupInput, ShmupObjectiveState, ShmupSnapshot, ShmupTarget } from './types';

interface Ally {
  active: boolean;
  life: number;
  fire: number;
  angle: number;
  mesh: THREE.Mesh;
}

export class ShmupRunner {
  readonly player: ShmupPlayer;
  readonly bullets: ShmupBullets;
  readonly scoring = new Scoring();
  readonly objectives: ShmupObjectiveState[];
  readonly mission: MissionSpec;
  readonly difficulty: Difficulty;
  readonly stageX: number;
  readonly stageStartZ: number;
  readonly stageEndZ: number;
  readonly scrollSpeed: number;
  enemies: ShmupEnemy[] = [];
  boss: ShmupBoss | null = null;
  camZ: number;
  fieldW = SHMUP.fieldHeight * (16 / 9);
  fieldH = SHMUP.fieldHeight;
  time = 0;
  totalTargets = 0;
  state: 'running' | 'success' | 'fail' = 'running';
  shake = 0;
  flash = 0;
  stageStopped = false;
  private readonly scene: THREE.Scene;
  private readonly effects: Effects;
  private readonly audio: AudioEngine;
  private readonly rng: Rng;
  private readonly callbacks: ShmupCallbacks;
  private readonly girl: GirlSpec;
  private waveIndex = 0;
  private endTimer = 0;
  private resultSent = false;
  private lastBossPhase = 1;
  private generatorsSpawned = false;
  private bossHandled = false;
  private bossDefeated = false;
  private bossSpawned = false;
  private comboMilestones = new Set<number>();
  private lowHpWarned = false;
  private dashHits = new Set<ShmupTarget>();
  private allies: Ally[] = [];
  private readonly allyMat: THREE.MeshBasicMaterial;
  private gunStreams = 2;

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
    callbacks: ShmupCallbacks;
  }) {
    this.scene = opts.scene;
    this.mission = opts.mission;
    this.girl = opts.girl;
    this.difficulty = opts.difficulty;
    this.effects = opts.effects;
    this.audio = opts.audio;
    this.rng = opts.rng;
    this.callbacks = opts.callbacks;
    this.stageX = opts.mission.stage.x;
    this.stageStartZ = opts.mission.stage.startZ;
    this.stageEndZ = opts.mission.stage.endZ;
    this.scrollSpeed = opts.mission.stage.scrollSpeed;
    this.camZ = this.stageStartZ;
    this.fieldW = SHMUP.fieldHeight * (16 / 9);
    this.player = new ShmupPlayer(opts.girl, opts.stats, this.stageX, this.camZ);
    this.scene.add(this.player.group);
    this.bullets = new ShmupBullets(this.scene);
    this.objectives = opts.mission.objectives.map((o) => ({
      ...o,
      current: 0,
      done: false,
      optional: Boolean(o.optional),
    }));
    this.allyMat = new THREE.MeshBasicMaterial({ color: 0x6fe0ff, transparent: true, opacity: 0.9, toneMapped: false });
    for (let i = 0; i < 3; i++) {
      const mesh = new THREE.Mesh(new THREE.OctahedronGeometry(2, 0), this.allyMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.allies.push({ active: false, life: 0, fire: 0, angle: (i / 3) * Math.PI * 2, mesh });
    }
    this.gunStreams = opts.stats.gunDamage > 1.05 ? 3 : 2;
    if (opts.weapons.includes('piercer')) this.gunStreams += 1;
    void opts.city;
  }

  update(dt: number, input: ShmupInput): void {
    if (this.state !== 'running') {
      this.endTimer -= dt;
      this.effects.update(dt);
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
    if (!this.stageStopped) {
      this.camZ = Math.max(this.stageEndZ, this.camZ - this.scrollSpeed * dt);
      if (this.camZ <= this.stageEndZ) this.stageStopped = true;
    }
    if (this.mission.boss && !this.bossSpawned && this.time >= 1.4) {
      this.spawnBoss();
    }

    this.player.update(dt, input, this.camZ, this.stageX);
    this.bullets.camZ = this.camZ;
    this.bullets.stageX = this.stageX;
    this.spawnWaves();
    this.updateEnemies(dt);
    this.updateBoss(dt);
    this.updateFriendlyFire(input, dt);
    this.updateAllies(dt);
    this.updateDash();
    this.resolvePlayerEvent();
    this.effects.update(dt);
    this.shake = Math.max(0, this.shake - dt * 3.4);
    this.flash = Math.max(0, this.flash - dt * 2.8);
    if (this.player.hp / this.player.maxHp < 0.34 && !this.lowHpWarned) {
      this.lowHpWarned = true;
      this.callbacks.onRadio(this.girl.name, this.girl.quotes.lowHp);
    }
    if (!this.player.dead) this.checkComplete();
  }

  private spawnBoss(): void {
    if (!this.mission.boss) return;
    this.bossSpawned = true;
    this.stageStopped = true;
    this.boss = new ShmupBoss(this.stageX, this.camZ, this.mission.boss.hp);
    this.scene.add(this.boss.group);
    this.totalTargets += 1;
    this.lastBossPhase = 1;
    this.callbacks.onRadio('天枢', '「灵魂锚点确认。回收开始。」');
  }

  private spawnWaves(): void {
    while (this.waveIndex < this.mission.waves.length && this.mission.waves[this.waveIndex].at <= this.time) {
      const wave = this.mission.waves[this.waveIndex++];
      for (const group of wave.groups) {
        for (let i = 0; i < group.count; i++) {
          if (group.ground) {
            const x = this.stageX + this.rng.range(-112, 112);
            const worldZ = this.camZ - 88 - this.rng.range(0, 30);
            const enemy = new ShmupEnemy(group.type, x, worldZ - this.camZ, group.tags, {
              name: group.name,
              hpScale: (group.hpScale ?? 1) * (this.difficulty === 'hard' ? 1.2 : 1),
              ground: true,
              worldZ,
            });
            this.addEnemy(enemy);
          } else {
            const positions = this.airPositions(group.pattern, group.count, i);
            const enemy = new ShmupEnemy(group.type, positions.x, positions.zRel, group.tags, {
              name: group.name,
              hpScale: (group.hpScale ?? 1) * (this.difficulty === 'hard' ? 1.2 : 1),
            });
            this.addEnemy(enemy);
          }
        }
      }
      if (wave.message) this.callbacks.onRadio('系统', wave.message);
      if (wave.bark) this.emitBark(wave.bark);
    }
  }

  private airPositions(pattern: string | undefined, count: number, index: number): { x: number; zRel: number } {
    const span = 44;
    if (pattern === 'line') {
      return { x: this.stageX + (index - (count - 1) / 2) * span, zRel: SHMUP.spawnZ };
    }
    if (pattern === 'ring' || pattern === 'arc') {
      return {
        x: this.stageX + (index - (count - 1) / 2) * span,
        zRel: SHMUP.spawnZ - (index % 3) * 14,
      };
    }
    return { x: this.stageX + this.rng.range(-118, 118), zRel: SHMUP.spawnZ - this.rng.range(0, 22) };
  }

  private addEnemy(enemy: ShmupEnemy): void {
    this.enemies.push(enemy);
    this.scene.add(enemy.group);
    this.totalTargets++;
  }

  private updateEnemies(dt: number): void {
    const ctx: ShmupEnemyContext = {
      camZ: this.camZ,
      stageX: this.stageX,
      player: this.player,
      bullets: this.bullets,
      effects: this.effects,
      difficulty: this.difficulty,
      fieldH: this.fieldH,
    };
    for (const enemy of this.enemies) {
      if (enemy.dead) {
        if (!enemy.handled && !enemy.escaped) this.handleKill(enemy);
        continue;
      }
      enemy.update(dt, ctx);
      if (enemy.dead && !enemy.handled) {
        if (enemy.escaped) {
          enemy.handled = true;
        } else {
          this.handleKill(enemy);
        }
      }
    }
    this.enemies = this.enemies.filter((e) => {
      if (!e.dead) return true;
      if (e.handled) e.group.removeFromParent();
      return false;
    });
    this.collidePlayerWithEnemies();
  }

  private collidePlayerWithEnemies(): void {
    if (this.player.dead) return;
    for (const e of this.enemies) {
      if (e.dead || e.escaped) continue;
      if (Math.hypot(e.x - this.player.x, e.zRel - this.player.zRel) < e.radius + this.player.radius) {
        this.hurtPlayer(18);
        break;
      }
    }
  }

  private updateBoss(dt: number): void {
    if (!this.boss || this.boss.dead) return;
    this.boss.update(dt, {
      camZ: this.camZ,
      player: this.player,
      bullets: this.bullets,
      difficulty: this.difficulty,
      onPlayerDamage: (amount) => this.hurtPlayer(amount),
      spawnAdds: (count) => this.spawnAdds(count),
      radio: (s, t) => this.callbacks.onRadio(s, t),
    });
    this.syncBossPhase();
  }

  private syncBossPhase(): void {
    if (!this.boss || this.boss.dead) return;
    if (this.boss.phase !== this.lastBossPhase) {
      this.lastBossPhase = this.boss.phase;
      if (this.boss.phase === 2) {
        this.spawnGenerators();
        this.callbacks.onRadio('苍穹', '「护盾发生器出现了。先拆那四台！」');
        this.callbacks.onFlash(0.5);
      } else if (this.boss.phase === 3) {
        this.callbacks.onRadio('夜枭', '「陆沉，来做个了断。」');
        this.callbacks.onRadio('青鸾', '「核心暴露了。打准一点。」');
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
      const zRel = boss.zRel + Math.sin(a) * 85;
      const enemy = new ShmupEnemy('generator', boss.x + Math.cos(a) * 105, zRel, ['generator'], {
        ground: true,
        y: SHMUP.altitude,
        worldZ: this.camZ + zRel,
        hpScale: this.difficulty === 'hard' ? 1.2 : 1,
      });
      this.addEnemy(enemy);
    }
    boss.generatorsAlive = 4;
    this.callbacks.onRadio('星隼', '「四台发生器。拆掉之前，打核心没用。」');
    this.effects.shockwave(boss.group.position, 150, 0x5fd8e8);
  }

  private spawnAdds(count: number): void {
    for (let i = 0; i < count; i++) {
      const enemy = new ShmupEnemy('drone', this.stageX + this.rng.range(-110, 110), SHMUP.spawnZ, ['drone']);
      this.addEnemy(enemy);
    }
  }

  private updateFriendlyFire(input: ShmupInput, dt: number): void {
    if (input.fire) this.fireGun();
    if (input.missile) this.fireMissiles();
    if (input.special) this.useSpecial();
    if (input.overdrive) this.useOverdrive();
    const targets = this.bulletTargets();
    this.bullets.update(
      dt,
      { x: this.player.x, zRel: this.player.zRel, radius: this.player.radius, dead: this.player.dead },
      targets,
      {
        onPlayerHit: (amount) => this.hurtPlayer(amount),
        onTargetHit: (target, damage, x, zRel, splash) => {
          this.scoring.addHit();
          this.damageTarget(target, damage, x, zRel, splash);
        },
      },
    );
  }

  private bulletTargets(): BulletTarget[] {
    const out: BulletTarget[] = [];
    for (const e of this.enemies) {
      if (!e.dead && !e.escaped) out.push({ target: e, x: e.x, zRel: e.zRel, radius: e.radius });
    }
    if (this.boss && !this.boss.dead) {
      out.push({ target: this.boss, x: this.boss.x, zRel: this.boss.zRel, radius: this.boss.radius });
    }
    return out;
  }

  private fireGun(): void {
    const p = this.player;
    if (!p.canFire()) return;
    p.consumeShot();
    const streams = p.overdriveActive ? this.gunStreams + 2 : this.gunStreams;
    const damage = SHMUP.bulletDamage * p.stats.gunDamage * (p.overdriveActive ? 1.15 : 1);
    for (let i = 0; i < streams; i++) {
      const offset = (i - (streams - 1) / 2) * 3.2;
      this.bullets.spawnFriendly(p.x + offset, p.zRel - 7, offset * 2.4, -SHMUP.bulletSpeed, damage, {
        color: p.girl.palette.glow,
        scale: 1.05,
      });
      this.scoring.addShot();
    }
    this.audio.play('gun');
  }

  private fireMissiles(): void {
    const p = this.player;
    if (!p.canMissile()) return;
    const targets = this.enemies
      .filter((e) => !e.dead && !e.escaped)
      .sort((a, b) => Math.abs(a.x - p.x) + Math.abs(a.zRel - p.zRel) - (Math.abs(b.x - p.x) + Math.abs(b.zRel - p.zRel)));
    const target = targets[0] ?? null;
    const base = target ? Math.atan2(target.x - p.x, target.zRel - p.zRel) : Math.PI;
    p.consumeMissile();
    for (let i = -1; i <= 1; i += 2) {
      const a = base + i * 0.18;
      this.bullets.spawnFriendly(p.x, p.zRel - 5, Math.sin(a) * 220, Math.cos(a) * 220, SHMUP.missileDamage * p.stats.missileDamage, {
        color: 0xffc060,
        scale: 1.9,
        homing: target,
        splash: 22,
        radius: 1.5,
      });
    }
    this.audio.play('missile');
  }

  private damageTarget(target: ShmupTarget, amount: number, x: number, zRel: number, splash: number): void {
    if (target.dead) return;
    const pos = new THREE.Vector3(x, SHMUP.altitude, this.camZ + zRel);
    this.effects.hit(pos, 0xffd080);
    const killed = target.damage(amount);
    if (splash > 0) {
      for (const t of this.bulletTargets()) {
        if (t.target === target || t.target.dead) continue;
        if (Math.hypot(t.x - x, t.zRel - zRel) < splash) {
          if (t.target.damage(amount * 0.35)) this.onTargetKilled(t.target);
        }
      }
    }
    if (killed) this.onTargetKilled(target);
    else if (target === this.boss) this.syncBossPhase();
  }

  private onTargetKilled(target: ShmupTarget): void {
    if (target === this.boss) {
      this.handleBossKilled();
      return;
    }
    const enemy = target as ShmupEnemy;
    if (!enemy.handled && !enemy.escaped) this.handleKill(enemy);
  }

  private handleKill(enemy: ShmupEnemy): void {
    if (enemy.handled) return;
    enemy.handled = true;
    enemy.group.visible = false;
    this.effects.explosion(new THREE.Vector3(enemy.x, enemy.y, this.camZ + enemy.zRel), enemy.type === 'gunship' || enemy.type === 'boat' ? 2 : 1, 0xffa050);
    this.audio.play('explosion');
    this.scoring.addKill(enemy.score, this.player.overdriveActive, this.difficulty === 'hard');
    this.player.addKillCharge(enemy.score);
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
    const pos = this.boss.group.position.clone();
    for (let i = 0; i < 8; i++) {
      window.setTimeout(() => {
        this.effects.explosion(
          pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 130, (Math.random() - 0.5) * 80, (Math.random() - 0.5) * 130)),
          2.4,
          0xffb060,
        );
        this.audio.play('explosion');
      }, i * 120);
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

  private comboCalls(): void {
    for (const at of [10, 20, 30]) {
      if (this.scoring.combo >= at && !this.comboMilestones.has(at)) {
        this.comboMilestones.add(at);
        this.callbacks.onRadio(this.girl.name, this.girl.quotes.combo[at === 10 ? 0 : at === 20 ? 1 : 2]);
      }
    }
  }

  private useSpecial(): void {
    if (!this.player.startSpecial()) return;
    const special = this.girl.special;
    this.callbacks.onCutIn('special', special.quote, this.girl.name);
    this.callbacks.onRadio(this.girl.name, special.name);
    this.audio.play('special');
    const targets = this.bulletTargets();
    switch (special.kind) {
      case 'multilock': {
        const near = targets
          .filter((t) => !t.target.dead && Math.abs(t.zRel - this.player.zRel) < 150)
          .sort((a, b) => Math.abs(a.x - this.player.x) - Math.abs(b.x - this.player.x))
          .slice(0, 8);
        near.forEach((t) => {
          this.bullets.spawnFriendly(this.player.x, this.player.zRel - 8, 0, -180, 95, {
            color: 0xffd080,
            scale: 1.8,
            homing: t.target,
            splash: 18,
            radius: 1.4,
          });
        });
        this.callbacks.onShake(0.3);
        break;
      }
      case 'railgun': {
        const top = this.camZ - this.fieldH * 0.55;
        for (let i = -2; i <= 2; i++) {
          const origin = new THREE.Vector3(this.player.x + i * 2, SHMUP.altitude, this.camZ + this.player.zRel);
          const end = new THREE.Vector3(this.player.x + i * 2, SHMUP.altitude, top);
          this.effects.tracer(origin, end, 0xff6a4a, 0.28);
        }
        this.effects.shockwave(new THREE.Vector3(this.player.x, SHMUP.altitude, top), 45, 0xff7a50);
        for (const t of targets) {
          if (Math.abs(t.x - this.player.x) < 16 && t.zRel < this.player.zRel) this.damageTarget(t.target, 190, t.x, t.zRel, 0);
        }
        this.callbacks.onShake(0.6);
        this.callbacks.onFlash(0.3);
        break;
      }
      case 'emp': {
        const cleared = this.bullets.clearEnemy();
        for (const t of targets) {
          if (Math.abs(t.zRel - this.player.zRel) < 200) {
            t.target.stun(2.6);
            t.target.mark(8, 1.3);
          }
        }
        this.effects.shockwave(new THREE.Vector3(this.player.x, SHMUP.altitude, this.camZ + this.player.zRel), 420, 0x5fd8e8);
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
        this.effects.shockwave(new THREE.Vector3(this.player.x, SHMUP.altitude, this.camZ + this.player.zRel), 30, 0x9fefff);
        this.callbacks.onShake(0.4);
        break;
      }
    }
  }

  private useOverdrive(): void {
    if (!this.player.startOverdrive()) return;
    this.callbacks.onCutIn('overdrive', '灵契解限——这一分钟，我来当前锋。', this.girl.name);
    this.callbacks.onRadio(this.girl.name, this.girl.special.quote);
    this.callbacks.onFlash(0.6);
    this.effects.shockwave(new THREE.Vector3(this.player.x, SHMUP.altitude, this.camZ + this.player.zRel), 55, this.girl.palette.glow);
    this.audio.play('special');
  }

  private updateDash(): void {
    if (this.player.dashTimer <= 0) return;
    for (const t of this.bulletTargets()) {
      if (this.dashHits.has(t.target)) continue;
      if (Math.hypot(t.x - this.player.x, t.zRel - this.player.zRel) < 30) {
        this.dashHits.add(t.target);
        this.damageTarget(t.target, 150, t.x, t.zRel, 0);
      }
    }
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
      const ax = this.player.x + Math.cos(ally.angle) * 32;
      const az = this.player.zRel + Math.sin(ally.angle) * 14;
      ally.mesh.position.set(ax, SHMUP.altitude, this.camZ + az);
      ally.fire -= dt;
      if (ally.fire <= 0) {
        ally.fire = 0.7;
        const target = this.enemies
          .filter((e) => !e.dead)
          .sort((a, b) => Math.hypot(a.x - ax, a.zRel - az) - Math.hypot(b.x - ax, b.zRel - az))[0];
        if (target) {
          this.bullets.spawnFriendly(ax, az, 0, -520, 24, { color: 0x6fe0ff, scale: 1.1 });
        }
      }
    }
  }

  private hurtPlayer(amount: number): void {
    if (amount <= 0) return;
    const res = this.player.damage(amount);
    if (res === 'ignored') return;
    this.scoring.addDamage(amount);
    this.flash = Math.min(0.8, this.flash + 0.18);
    this.shake = Math.min(1, this.shake + amount / 24);
    this.audio.play('hit');
    if (res === 'revive') this.onRevive();
    if (res === 'dead') this.fail();
  }

  private resolvePlayerEvent(): void {
    const ev = this.player.lastEvent;
    this.player.lastEvent = null;
    if (ev === 'revive') this.onRevive();
    if (ev === 'dead') this.fail();
  }

  private onRevive(): void {
    this.scoring.revives++;
    this.lowHpWarned = false;
    this.callbacks.onCutIn('revive', this.girl.quotes.revive, this.girl.name);
    this.callbacks.onRadio(this.girl.name, '「灵契重连……起来！」');
    this.callbacks.onFlash(0.8);
    this.callbacks.onShake(0.8);
    this.effects.shockwave(new THREE.Vector3(this.player.x, SHMUP.altitude, this.camZ + this.player.zRel), 70, this.girl.palette.glow);
    this.audio.play('revive');
  }

  private fail(): void {
    if (this.state !== 'running') return;
    this.state = 'fail';
    this.endTimer = 1.6;
    this.audio.play('fail');
    this.effects.explosion(new THREE.Vector3(this.player.x, SHMUP.altitude, this.camZ + this.player.zRel), 3, 0xff7a40);
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
    const required = this.objectives.filter((o) => !o.optional).every((o) => o.done);
    const waves = this.waveIndex >= this.mission.waves.length;
    const boss = !this.mission.boss || this.bossDefeated;
    if (required && waves && boss) this.succeed();
  }

  private emitBark(raw: string): void {
    const match = raw.match(/^(青鸾|明璃|苍穹|星隼|霜翼|夜枭|天枢|陆沉)[:：]/);
    if (match) this.callbacks.onRadio(match[1], raw.slice(match[0].length).replace(/^「|」$/g, ''));
    else this.callbacks.onRadio('系统', raw);
  }

  getSnapshot(): ShmupSnapshot {
    const span = Math.max(1, this.stageStartZ - this.stageEndZ);
    const boss = this.boss && !this.boss.dead;
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
      maxMissiles: SHMUP.missileCharges,
      missileRecharge: this.player.missileRecharge,
      specialCooldown: this.player.specialCd,
      specialMax: this.player.stats.specialCooldown,
      overdrive: this.player.overdrive,
      overdriveActive: this.player.overdriveActive,
      objectives: this.objectives,
      time: this.time,
      boss: boss
        ? {
            name: this.boss!.name,
            subtitle: this.mission.boss?.subtitle ?? '蚀灵核心',
            hp: this.boss!.hp,
            maxHp: this.boss!.maxHp,
            phase: this.boss!.phase,
            shielded: this.boss!.shieldActive,
          }
        : null,
      stageProgress: clamp((this.stageStartZ - this.camZ) / span, 0, 1),
      stageName: this.mission.subtitle,
      playerX: this.player.x,
      playerZRel: this.player.zRel,
      camZ: this.camZ,
      stageX: this.stageX,
      fieldW: this.fieldW,
      fieldH: this.fieldH,
      focus: this.player.focus,
      kills: this.scoring.kills,
      totalTargets: this.totalTargets,
    };
  }

  private buildResult(success: boolean): MissionResult {
    const rank = success ? rankFor(this.scoring.score, this.mission.rank) : '-';
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
    this.bullets.dispose();
    for (const e of this.enemies) e.dispose();
    this.boss?.dispose();
    for (const a of this.allies) {
      a.mesh.geometry.dispose();
      a.mesh.removeFromParent();
    }
    this.allyMat.dispose();
    this.scene.remove(this.player.group);
  }
}
