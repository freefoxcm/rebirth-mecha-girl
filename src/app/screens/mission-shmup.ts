import * as THREE from 'three';
import { BaseScreen } from '../base-screen';
import type { App } from '../app';
import type { Difficulty, MissionId, MissionResult, MissionSpec } from '../../data/types';
import { GIRLS } from '../../data/girls';
import { MISSIONS } from '../../data/missions';
import { SHMUP } from '../../data/config';
import { assetUrl } from '../../core/assets';
import { Rng } from '../../core/rng';
import { City } from '../../render/city';
import { WorldEnvironment } from '../../render/environment';
import { Effects } from '../../game/effects';
import { ShmupRunner } from '../../game/shmup/runner';
import type { ShmupInput, ShmupSnapshot } from '../../game/shmup/types';
import { ShmupHud } from '../../ui/shmup-hud';
import { CameraShake } from '../../render/camera-shake';
import { button, div } from '../../ui/dom';

const STAGE_NAMES = ['人形锁定', '翼板解锁', '前倾收纳', '机身成形', '飞行面锁定', '战机完成'];

/** 雷电式竖版卷轴关卡。 */
export class ShmupMissionScreen extends BaseScreen {
  private mission!: MissionSpec;
  private difficulty: Difficulty = 'normal';
  private scene!: THREE.Scene;
  private camera!: THREE.OrthographicCamera;
  private env!: WorldEnvironment;
  private city!: City;
  private effects!: Effects;
  private runner!: ShmupRunner;
  private hud!: ShmupHud;
  private paused = false;
  private started = false;
  private finished = false;
  private readonly cameraShake = new CameraShake();
  private flash = 0;
  private cutinHost: HTMLElement | null = null;
  private pauseHost: HTMLElement | null = null;
  private cutinInterval = 0;
  private lastAspect = 0;
  private prevMissile = false;

  constructor(app: App) {
    super(app);
  }

  enter(params?: Record<string, unknown>): void {
    this.root.classList.add('mission-screen');
    document.body.style.cursor = 'default';
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
    this.env.focus(this.mission.stage.x, this.mission.stage.startZ);
    this.city = new City(this.app.save.settings.quality);
    this.scene.add(this.city.group);
    this.effects = new Effects(this.scene);

    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    const h = SHMUP.fieldHeight;
    const w = h * aspect;
    this.camera = new THREE.OrthographicCamera(-w / 2, w / 2, h / 2, -h / 2, 0.1, 1800);
    this.camera.up.set(0, 0, -1);
    this.camera.position.set(this.mission.stage.x, SHMUP.cameraY, this.mission.stage.startZ);
    this.camera.lookAt(this.mission.stage.x, 0, this.mission.stage.startZ);
    this.lastAspect = aspect;

    this.runner = new ShmupRunner({
      scene: this.scene,
      city: this.city,
      mission: this.mission,
      girl,
      difficulty: this.difficulty,
      stats,
      weapons,
      effects: this.effects,
      audio: this.app.audio,
      rng: new Rng(0x5a17 + this.mission.index * 977),
      callbacks: {
        onCutIn: (kind, text, speaker) => this.hud?.cutIn(kind, text, speaker),
        onRadio: (speaker, text) => this.hud?.radio(speaker, text),
        onResult: (result) => this.finish(result),
        onShake: (amount) => {
          this.cameraShake.add(amount);
        },
        onFlash: (amount) => {
          this.flash = Math.min(1, this.flash + amount);
        },
      },
    });
    this.runner.fieldW = w;
    this.runner.fieldH = h;

    this.hud = new ShmupHud(girl, { onPause: () => this.togglePause() }, { subtitles: this.app.save.settings.subtitles });
    this.root.appendChild(this.hud.root);

    this.onWindow('keydown', (e) => {
      if (e.code === 'Escape') {
        if (!this.started || this.finished) return;
        this.togglePause();
      }
    });

    this.app.audio.startMusic('combat');
    if (skipCutin) this.startMission();
    else this.playCutIn(girl);
    this.addCleanup(() => {
      window.clearInterval(this.cutinInterval);
      this.app.viewport?.setEffects(0, 0, 0);
      this.app.exposure = 1.04;
      document.body.style.cursor = '';
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
    document.body.style.cursor = 'none';
    this.hud.banner('MISSION START', this.mission.title, this.mission.chapter);
    this.app.audio.startEngine();
    const girl = GIRLS[this.app.save.selectedGirl];
    this.hud.radio(girl.name, girl.quotes.launch);
    this.later(() => this.hud.radio('系统', '目标已标记。WASD / 方向键移动，按住左键或空格射击。'), 1200);
  }

  update(dt: number): void {
    if (!this.started || this.paused || this.finished) return;
    const input = this.app.input;
    const left = input.isDown('KeyA') || input.isDown('ArrowLeft');
    const right = input.isDown('KeyD') || input.isDown('ArrowRight');
    const up = input.isDown('KeyW') || input.isDown('ArrowUp');
    const down = input.isDown('KeyS') || input.isDown('ArrowDown');
    const fire = input.pointerDown || input.isDown('Space');
    const missileDown = input.rightDown;
    const missilePressed = missileDown && !this.prevMissile;
    this.prevMissile = missileDown;
    const state: ShmupInput = {
      x: (right ? 1 : 0) - (left ? 1 : 0),
      z: (down ? 1 : 0) - (up ? 1 : 0),
      fire,
      missile: missilePressed,
      special: input.wasPressed('KeyE'),
      overdrive: input.wasPressed('KeyR'),
      focus: input.isDown('ShiftLeft') || input.isDown('ShiftRight'),
    };
    this.runner.update(dt, state);
    this.updateCamera(dt);
    this.env.update(dt);
    this.env.focus(this.runner.stageX, this.runner.camZ);
    const snapshot = this.runner.getSnapshot();
    this.hud.update(snapshot, dt);
    this.cameraShake.update(dt);
    this.flash = Math.max(0, this.flash - dt * 2.6);
    this.app.audio.setEngine(snapshot.focus, state.x !== 0 || state.z !== 0);
    if (this.app.viewport) {
      this.app.viewport.setEffects(0, Math.max(this.flash, this.runner.flash), this.flash * (this.app.save.settings.flash ? 1 : 0.25));
      this.app.viewport.renderer.toneMappingExposure = this.env.exposure;
    }
    this.root.classList.toggle('is-low-hp', snapshot.hp / Math.max(1, snapshot.maxHp) < 0.3);
  }

  private updateCamera(dt: number): void {
    const aspect = window.innerWidth / Math.max(1, window.innerHeight);
    if (aspect !== this.lastAspect) {
      this.lastAspect = aspect;
      const h = SHMUP.fieldHeight;
      const w = h * aspect;
      this.camera.left = -w / 2;
      this.camera.right = w / 2;
      this.camera.top = h / 2;
      this.camera.bottom = -h / 2;
      this.camera.updateProjectionMatrix();
      this.runner.fieldW = w;
    }
    const shake = this.cameraShake.sample(this.app.save.settings.shake);
    this.camera.position.set(this.runner.stageX + shake.x, SHMUP.cameraY, this.runner.camZ + shake.z);
    this.camera.lookAt(this.runner.stageX, 0, this.runner.camZ);
    this.camera.rotateZ(shake.roll);
    if (Math.abs(this.camera.zoom - shake.zoom) > 0.00001) {
      this.camera.zoom = shake.zoom;
      this.camera.updateProjectionMatrix();
    }
    void dt;
  }

  private togglePause(): void {
    if (!this.started || this.finished) return;
    this.paused = !this.paused;
    document.body.style.cursor = this.paused ? 'default' : 'none';
    if (this.paused) {
      this.app.audio.stopEngine();
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
          <div><span>卷轴进度</span><b>${Math.round(snapshot.stageProgress * 100)}%</b></div>
        </div>
        <div class="pause-controls">
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> 移动</span>
          <span><kbd>左键</kbd><kbd>空格</kbd> 主炮</span>
          <span><kbd>右键</kbd> 追踪导弹</span>
          <span><kbd>Shift</kbd> 低速精瞄</span>
          <span><kbd>E</kbd> 特技</span>
          <span><kbd>R</kbd> 解限</span>
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
      this.app.audio.startEngine();
    }
  }

  private finish(result: MissionResult): void {
    if (this.finished) return;
    this.finished = true;
    this.paused = false;
    document.body.style.cursor = 'default';
    this.cameraShake.reset();
    this.app.audio.stopEngine();
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

  private debugInput(fire: boolean): ShmupInput {
    return { x: 0, z: 0, fire, missile: false, special: false, overdrive: false, focus: false };
  }

  debugAdvance(seconds: number, fire = false): void {
    if (!this.runner || !this.started || this.finished) return;
    const steps = Math.max(1, Math.min(1200, Math.round(seconds * 60)));
    const input = this.debugInput(fire);
    for (let i = 0; i < steps; i++) {
      this.runner.update(1 / 60, input);
      this.cameraShake.update(1 / 60);
      if (i % 4 === 0) this.updateCamera(1 / 60);
      if (this.finished) break;
    }
    this.updateCamera(0.016);
    this.hud.update(this.runner.getSnapshot(), seconds);
  }

  exit(): void {
    super.exit();
    this.app.audio.stopEngine();
    this.cameraShake.reset();
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
