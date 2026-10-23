import * as THREE from 'three';
import { BaseScreen } from '../base-screen';
import type { App } from '../app';
import type { Difficulty, MissionId, MissionResult, MissionSpec } from '../../data/types';
import { ALTITUDE, CAMERA, PLAYER, GAME_VERSION } from '../../data/config';
import { MISSIONS } from '../../data/missions';
import { GIRLS } from '../../data/girls';
import { assetUrl } from '../../core/assets';
import { clamp, damp } from '../../core/math';
import { Rng } from '../../core/rng';
import { City } from '../../render/city';
import { WorldEnvironment } from '../../render/environment';
import { Effects } from '../../game/effects';
import { MissionRunner, type MissionInput, type MissionSnapshot } from '../../game/mission';
import { Hud } from '../../ui/hud';
import { button, div, icon } from '../../ui/dom';

const STAGE_NAMES = ['人形锁定', '翼板解锁', '前倾收纳', '机身成形', '飞行面锁定', '战机完成'];

export class MissionScreen extends BaseScreen {
  private mission!: MissionSpec;
  private difficulty: Difficulty = 'normal';
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private env!: WorldEnvironment;
  private city!: City;
  private effects!: Effects;
  private runner!: MissionRunner;
  private hud!: Hud;
  private paused = false;
  private started = false;
  private finished = false;
  private shake = 0;
  private flash = 0;
  private cutinHost: HTMLElement | null = null;
  private pauseHost: HTMLElement | null = null;
  private stageIndex = 0;
  private cutinInterval = 0;
  private lastAspect = 0;
  private readonly raycaster = new THREE.Raycaster();
  private readonly aimPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -ALTITUDE);
  private readonly pointerWorld = new THREE.Vector3();
  private readonly pointerNdcVec = new THREE.Vector2();
  private readonly tmpVec = new THREE.Vector3();

  constructor(app: App) {
    super(app);
  }

  enter(params?: Record<string, unknown>): void {
    this.root.classList.add('mission-screen');
    const missionKey = (params?.missionId ?? params?.mission) as MissionId | undefined;
    this.mission = MISSIONS[missionKey ?? 'm1'] ?? MISSIONS.m1;
    this.difficulty = (params?.difficulty as Difficulty) ?? 'normal';
    const skipCutin = Boolean(params?.skipCutin);
    const girl = GIRLS[this.app.save.selectedGirl];
    const stats = this.app.save.getLoadoutStats(girl.id);
    const weapons = this.app.save.data.unlocks.weapons;
    if (weapons.includes('missile')) stats.missileDamage += 0.2;
    if (weapons.includes('piercer')) stats.gunDamage *= 1.2;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0f14);
    if (this.app.viewport) this.scene.environment = this.app.viewport.environment;
    this.env = new WorldEnvironment(this.scene, this.mission.timeOfDay);
    this.app.exposure = this.env.exposure;
    this.env.focus(this.mission.spawn.x, this.mission.spawn.z);
    this.city = new City(this.app.save.settings.quality);
    this.scene.add(this.city.group);
    this.effects = new Effects(this.scene);

    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, window.innerWidth / Math.max(1, window.innerHeight), 1, 6000);
    const fwd0 = new THREE.Vector3(-Math.sin(this.mission.spawn.heading), 0, -Math.cos(this.mission.spawn.heading));
    this.camera.position.set(
      this.mission.spawn.x - fwd0.x * CAMERA.back,
      ALTITUDE + CAMERA.height,
      this.mission.spawn.z - fwd0.z * CAMERA.back,
    );
    this.camera.lookAt(
      this.mission.spawn.x + fwd0.x * CAMERA.lookAhead,
      ALTITUDE - 34,
      this.mission.spawn.z + fwd0.z * CAMERA.lookAhead,
    );

    this.runner = new MissionRunner({
      scene: this.scene,
      city: this.city,
      mission: this.mission,
      girl,
      difficulty: this.difficulty,
      stats,
      weapons,
      effects: this.effects,
      audio: this.app.audio,
      rng: new Rng(0x51a7 + this.mission.index * 977),
      callbacks: {
        onCutIn: (kind, text, speaker) => this.hud?.cutIn(kind, text, speaker),
        onRadio: (speaker, text) => this.hud?.radio(speaker, text),
        onResult: (result) => this.finish(result),
        onShake: (amount) => {
          this.shake = Math.min(1.6, this.shake + amount);
        },
        onFlash: (amount) => {
          this.flash = Math.min(1, this.flash + amount);
        },
      },
    });

    this.hud = new Hud(girl, { onPause: () => this.togglePause() }, { subtitles: this.app.save.settings.subtitles });
    this.root.appendChild(this.hud.root);

    this.onWindow('keydown', (e) => {
      if (e.code === 'Escape') {
        if (!this.started || this.finished) return;
        this.togglePause();
      }
    });

    this.app.audio.startMusic(this.mission.boss ? 'boss' : 'combat');
    if (skipCutin) this.startMission();
    else this.playCutIn(girl);
    this.addCleanup(() => {
      window.clearInterval(this.cutinInterval);
      this.app.viewport?.setEffects(0, 0, 0);
      this.app.exposure = 1.04;
    });
  }

  private playCutIn(girl: (typeof GIRLS)[keyof typeof GIRLS]): void {
    this.cutinHost = div('launch-overlay');
    const img = div('launch-image');
    const copy = div('launch-copy');
    const bars = div('launch-bars');
    const steps = girl.art.stages;
    copy.innerHTML = `
      <span class="launch-kicker">LINK SEQUENCE / ${girl.en}</span>
      <b>灵契同步</b>
      <small>TRANSFORMATION · 人形 ⇄ 战机</small>
      <p class="launch-caption">${STAGE_NAMES[0]}</p>`;
    for (let i = 0; i < steps.length; i++) bars.appendChild(div('launch-bar'));
    const skip = button('跳过变形', () => this.startMission(), 'bare', 'launch-skip');
    this.cutinHost.append(img, div('launch-scan'), copy, bars, skip);
    this.root.appendChild(this.cutinHost);
    const caption = copy.querySelector('.launch-caption') as HTMLElement;
    const barEls = [...bars.querySelectorAll('.launch-bar')];
    const show = (i: number) => {
      this.stageIndex = i;
      img.style.backgroundImage = `url("${assetUrl(steps[i])}")`;
      caption.textContent = `${String(i + 1).padStart(2, '0')} / 06 · ${STAGE_NAMES[i]}`;
      barEls.forEach((b, n) => b.classList.toggle('is-on', n <= i));
      img.classList.remove('is-bump');
      void img.offsetWidth;
      img.classList.add('is-bump');
    };
    show(0);
    let i = 0;
    this.cutinInterval = window.setInterval(() => {
      i++;
      if (i >= steps.length) {
        window.clearInterval(this.cutinInterval);
        this.cutinHost?.classList.add('is-done');
        this.later(() => this.startMission(), 320);
        return;
      }
      show(i);
    }, 360);
    this.addCleanup(() => window.clearInterval(this.cutinInterval));
  }

  private startMission(): void {
    if (this.started) return;
    this.started = true;
    window.clearInterval(this.cutinInterval);
    this.cutinHost?.remove();
    this.cutinHost = null;
    this.root.classList.add('is-started');
    this.hud.banner('MISSION START', this.mission.title, this.mission.chapter);
    const girl = GIRLS[this.app.save.selectedGirl];
    this.hud.radio(girl.name, girl.quotes.launch);
    if (this.mission.boss) {
      this.later(() => this.hud.radio('天枢', '「灵魂锚点确认。回收开始。」'), 1600);
    } else {
      this.later(() => this.hud.radio('系统', '目标已标记。按 TAB 查看任务目标。'), 1200);
    }
  }

  update(dt: number): void {
    if (!this.started || this.paused || this.finished) return;
    const input = this.app.input;
    const player = this.runner.player;

    if (!input.pointerMoved || !input.pointerInside) {
      this.pointerWorld.copy(player.pos).addScaledVector(player.forward, 520);
    } else {
      this.pointerNdcVec.set(input.pointerNdc.x, input.pointerNdc.y);
      this.raycaster.setFromCamera(this.pointerNdcVec, this.camera);
      const hit = this.raycaster.ray.intersectPlane(this.aimPlane, this.pointerWorld);
      if (!hit || this.pointerWorld.distanceToSquared(player.pos) > 900 * 900) {
        this.pointerWorld.copy(player.pos).addScaledVector(player.forward, 520);
      }
    }

    const state: MissionInput = {
      fire: input.pointerDown,
      lock: input.rightDown,
      boost: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
      throttleUp: input.isDown('KeyW') || input.isDown('ArrowUp'),
      throttleDown: input.isDown('KeyS') || input.isDown('ArrowDown'),
      special: input.wasPressed('KeyE'),
      overdrive: input.wasPressed('KeyR'),
      pointer: this.pointerWorld,
      arrows: {
        left: input.isDown('ArrowLeft'),
        right: input.isDown('ArrowRight'),
        up: input.isDown('ArrowUp'),
        down: input.isDown('ArrowDown'),
      },
    };
    this.runner.update(dt, state);
    this.updateCamera(dt);
    this.env.update(dt);
    this.env.focus(player.pos.x, player.pos.z);

    const snapshot = this.runner.getSnapshot();
    this.hud.update(snapshot, this.camera, dt);
    this.hud.setPointer(this.app.input.pointer.x, this.app.input.pointer.y, this.app.input.pointerInside && !this.paused);

    this.shake = Math.max(0, this.shake - dt * 3.2);
    this.flash = Math.max(0, this.flash - dt * 2.6);
    const speedRatio = clamp((player.speed - PLAYER.minSpeed) / (PLAYER.maxSpeed * 1.35 - PLAYER.minSpeed), 0, 1);
    if (this.app.viewport) {
      this.app.viewport.setEffects(speedRatio * 0.85, Math.max(this.flash, this.runner.flash), this.flash * (this.app.save.settings.flash ? 1 : 0.25));
      this.app.viewport.renderer.toneMappingExposure = this.env.exposure;
    }
    this.root.classList.toggle('is-low-hp', snapshot.hp / Math.max(1, snapshot.maxHp) < 0.3);
  }

  private updateCamera(dt: number): void {
    const p = this.runner.player.pos;
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    if (aspect !== this.lastAspect) {
      this.lastAspect = aspect;
      this.camera.aspect = aspect;
      this.camera.updateProjectionMatrix();
    }
    const fwd = this.runner.player.forward;
    const desiredX = p.x - fwd.x * CAMERA.back;
    const desiredY = p.y + CAMERA.height;
    const desiredZ = p.z - fwd.z * CAMERA.back;
    this.camera.position.x = damp(this.camera.position.x, desiredX, CAMERA.follow, dt);
    this.camera.position.y = damp(this.camera.position.y, desiredY, CAMERA.follow, dt);
    this.camera.position.z = damp(this.camera.position.z, desiredZ, CAMERA.follow, dt);
    const boost = this.app.input.isDown('ShiftLeft') || this.app.input.isDown('ShiftRight');
    this.camera.fov = damp(this.camera.fov, boost ? CAMERA.boostFov : CAMERA.fov, 3, dt);
    this.camera.updateProjectionMatrix();
    if (this.shake > 0 && this.app.save.settings.shake) {
      const s = this.shake * 4;
      this.camera.position.x += (Math.random() - 0.5) * s;
      this.camera.position.y += (Math.random() - 0.5) * s;
      this.camera.position.z += (Math.random() - 0.5) * s;
    }
    this.tmpVec.set(p.x + fwd.x * CAMERA.lookAhead, p.y - 34, p.z + fwd.z * CAMERA.lookAhead);
    this.camera.lookAt(this.tmpVec);
  }

  private togglePause(): void {
    if (!this.started || this.finished) return;
    this.paused = !this.paused;
    if (this.paused) {
      this.pauseHost = div('pause-overlay');
      const panel = div('pause-panel panel');
      const snapshot = this.runner.getSnapshot();
      panel.innerHTML = `
        <div class="pause-kicker">OPERATION PAUSED</div>
        <h2>作战暂停</h2>
        <p>${this.mission.chapter} · ${this.mission.title}</p>
        <div class="pause-stats">
          <div><span>得分</span><b>${snapshot.score.toString().padStart(6, '0')}</b></div>
          <div><span>击坠</span><b>${snapshot.kills} / ${snapshot.totalTargets}</b></div>
          <div><span>用时</span><b>${Math.floor(snapshot.time / 60)}:${String(Math.floor(snapshot.time % 60)).padStart(2, '0')}</b></div>
        </div>
        <div class="pause-controls">
          <span><kbd>鼠标</kbd> 转向</span><span><kbd>W</kbd><kbd>S</kbd> 油门</span><span><kbd>Shift</kbd> 加力</span>
          <span><kbd>左键</kbd> 主炮</span><span><kbd>右键</kbd> 锁定</span><span><kbd>E</kbd> 特技</span><span><kbd>R</kbd> 解限</span>
        </div>
        <div class="pause-actions"></div>`;
      const actions = panel.querySelector('.pause-actions') as HTMLElement;
      actions.append(
        button('继续作战', () => this.togglePause(), 'primary'),
        button('从本关重来', () => {
          this.app.show('mission', { missionId: this.mission.id, difficulty: this.difficulty, skipCutin: true });
        }, 'ghost'),
        button('放弃任务', () => this.app.show('hub', { mission: this.mission.id }), 'danger'),
      );
      this.pauseHost.appendChild(panel);
      this.pauseHost.addEventListener('click', (e) => {
        if (e.target === this.pauseHost) this.togglePause();
      });
      this.root.appendChild(this.pauseHost);
      this.root.classList.add('is-paused');
    } else {
      this.pauseHost?.remove();
      this.pauseHost = null;
      this.root.classList.remove('is-paused');
      this.app.input.clear();
    }
  }

  private finish(result: MissionResult): void {
    if (this.finished) return;
    this.finished = true;
    this.paused = false;
    this.pauseHost?.remove();
    this.pauseHost = null;
    const backdrop = this.app.captureFrame();
    const commit = this.app.save.commitResult(result);
    this.app.audio.stopMusic();
    this.hud.banner(result.success ? 'MISSION COMPLETE' : 'MISSION FAILED', result.success ? '返回母舰结算' : '灵契中断', 'RESULT');
    this.later(() => {
      this.app.show('results', { result, commit, backdrop });
    }, 900);
  }

  backdrop(): { scene: THREE.Scene; camera: THREE.Camera } {
    return { scene: this.scene, camera: this.camera };
  }

  debugWin(): void {
    this.runner?.forceWin();
  }

  debugDamageBoss(amount: number): void {
    this.runner?.debugDamageBoss(amount);
  }

  /** 截图 / 自动化测试用：不依赖真实帧率地推进模拟。 */
  debugAdvance(seconds: number, fire = false): void {
    if (!this.runner || !this.started || this.finished) return;
    const p = this.runner.player;
    const neutral: MissionInput = {
      fire,
      lock: false,
      boost: false,
      throttleUp: false,
      throttleDown: false,
      special: false,
      overdrive: false,
      pointer: p.pos.clone().addScaledVector(p.forward, 600),
      arrows: { left: false, right: false, up: false, down: false },
    };
    const steps = Math.max(1, Math.min(1200, Math.round(seconds * 60)));
    for (let i = 0; i < steps; i++) {
      this.runner.update(1 / 60, neutral);
      if (i % 4 === 0) this.updateCamera(1 / 60);
      if (this.finished) break;
    }
    this.updateCamera(0.016);
    const snapshot = this.runner.getSnapshot();
    this.hud.update(snapshot, this.camera, seconds);
  }

  exit(): void {
    super.exit();
    window.clearInterval(this.cutinInterval);
    if (this.app.viewport) {
      this.app.viewport.setEffects(0, 0, 0);
      this.app.viewport.renderer.toneMappingExposure = 1.04;
    }
    this.hud?.destroy();
    this.runner?.dispose();
    this.city?.dispose();
    this.env?.dispose();
    this.effects?.dispose();
    this.scene?.clear();
    this.app.exposure = 1.04;
    document.body.style.cursor = '';
  }
}
