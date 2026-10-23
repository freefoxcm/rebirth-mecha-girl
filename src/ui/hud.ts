import * as THREE from 'three';
import type { GirlSpec } from '../data/types';
import type { MissionSnapshot } from '../game/mission';
import { assetUrl } from '../core/assets';
import { formatScore, formatTime, clamp } from '../core/math';
import { div, el, icon, setText, setWidth } from './dom';

export interface HudCallbacks {
  onPause: () => void;
}

interface MarkerEl {
  root: HTMLElement;
  dist: HTMLElement;
  name: HTMLElement;
}

/** 战斗 HUD：全部 DOM，3D 只负责场景。 */
export class Hud {
  readonly root = div('hud');
  private readonly girl: GirlSpec;
  private readonly callbacks: HudCallbacks;
  private readonly subtitles: boolean;
  private scoreEl!: HTMLElement;
  private killsEl!: HTMLElement;
  private comboEl!: HTMLElement;
  private comboLabelEl!: HTMLElement;
  private bestEl!: HTMLElement;
  private multEl!: HTMLElement;
  private rankFill!: HTMLElement;
  private objectiveHost!: HTMLElement;
  private timerEl!: HTMLElement;
  private hpFill!: HTMLElement;
  private hpText!: HTMLElement;
  private heatFill!: HTMLElement;
  private heatText!: HTMLElement;
  private missilePips: HTMLElement[] = [];
  private lockText!: HTMLElement;
  private specialText!: HTMLElement;
  private specialCd!: HTMLElement;
  private specialSlot!: HTMLElement;
  private odFill!: HTMLElement;
  private odWrap!: HTMLElement;
  private speedEl!: HTMLElement;
  private bossWrap!: HTMLElement;
  private bossFill!: HTMLElement;
  private bossHp!: HTMLElement;
  private bossPhase!: HTMLElement;
  private bossShield!: HTMLElement;
  private radioWrap!: HTMLElement;
  private radioSpeaker!: HTMLElement;
  private radioText!: HTMLElement;
  private markerLayer!: HTMLElement;
  private markerEls: MarkerEl[] = [];
  private reticle!: HTMLElement;
  private cursor!: HTMLElement;
  private lockRing!: HTMLElement;
  private vignette!: HTMLElement;
  private cutin: HTMLElement | null = null;
  private bannerEl: HTMLElement | null = null;
  private radioQueue: Array<{ speaker: string; text: string }> = [];
  private radioTimer = 0;
  private bannerTimer = 0;
  private cutinTimer = 0;
  private lastHp = 1;
  private lastCombo = 0;
  private lastObjectiveSignature = '';
  private lastScore = -1;
  private lastKills = -1;
  private hitTimer = 0;
  private readonly tmp = new THREE.Vector3();

  constructor(girl: GirlSpec, callbacks: HudCallbacks, options: { subtitles?: boolean } = {}) {
    this.girl = girl;
    this.callbacks = callbacks;
    this.subtitles = options.subtitles ?? true;
    this.build();
  }

  private build(): void {
    this.root.innerHTML = `
      <div class="hud-vignette"></div>
      <div class="hud-top-left">
        <div class="hud-kicker">SCORE</div>
        <div class="hud-score">000000</div>
        <div class="hud-subline"><span class="hud-kills">0 / 0 KILLS</span><span class="hud-rank-name">OK</span></div>
        <div class="hud-rank-track"><i></i></div>
        <div class="hud-combo">
          <b>0</b><span class="hud-combo-label">COMBO</span>
          <small>×1.0</small>
          <em>BEST 0</em>
        </div>
      </div>
      <div class="hud-top-center">
        <div class="hud-objectives">
          <div class="hud-obj-head"><span>MISSION OBJECTIVE</span><b>0 / 3</b></div>
          <div class="hud-obj-list"></div>
        </div>
        <div class="hud-boss"></div>
      </div>
      <div class="hud-top-right">
        <div class="hud-timer">00:00</div>
        <button class="hud-pause" type="button" aria-label="暂停">${icon('pause', 16)}<span>ESC</span></button>
      </div>
      <div class="hud-bottom-left">
        <div class="hud-face" style="background-image:url('${assetUrl(this.girl.art.face)}')"></div>
        <div class="hud-pilot">
          <div class="hud-pilot-name">${this.girl.name}<small>${this.girl.en}</small></div>
          <div class="hud-meter"><span>装甲</span><div class="hud-track hp"><i></i></div><b>112</b></div>
          <div class="hud-meter"><span>主炮</span><div class="hud-track heat"><i></i></div><b>READY</b></div>
          <div class="hud-missiles"><span>导弹</span><div class="hud-pips"></div><small>0 / 3</small></div>
        </div>
      </div>
      <div class="hud-bottom-right">
        <div class="hud-weapon hud-weapon-gun">
          <span class="hw-key">LMB</span>
          <b>主炮</b>
          <small>机炮 · 过热</small>
        </div>
        <div class="hud-weapon hud-weapon-msl">
          <span class="hw-key">RMB</span>
          <b>导弹</b>
          <small class="lock-text">锁定 0 / 2</small>
        </div>
        <div class="hud-weapon hud-weapon-special">
          <span class="hw-key">E</span>
          <b>${this.girl.special.name}</b>
          <small class="special-text">READY</small>
          <i class="special-cd"></i>
        </div>
        <div class="hud-overdrive">
          <span>解限</span>
          <div class="od-track"><i></i></div>
          <kbd>R</kbd>
        </div>
        <div class="hud-speed"><b>172</b><span>m/s</span><small>ALT 90</small></div>
      </div>
      <div class="hud-radio"><span class="hud-radio-speaker">青鸾</span><p class="hud-radio-text"></p></div>
      <div class="hud-markers"></div>
      <div class="hud-reticle"><i class="rt-circle"></i><i class="rt-tick t"></i><i class="rt-tick r"></i><i class="rt-tick b"></i><i class="rt-tick l"></i><span class="rt-lock"></span><span class="rt-hint">LOCK</span></div>
      <div class="hud-cursor"><i></i><span>STEER</span></div>
      <div class="hud-flash"></div>`;

    this.scoreEl = this.root.querySelector('.hud-score') as HTMLElement;
    this.killsEl = this.root.querySelector('.hud-kills') as HTMLElement;
    this.comboEl = this.root.querySelector('.hud-combo > b') as HTMLElement;
    this.comboLabelEl = this.root.querySelector('.hud-combo-label') as HTMLElement;
    this.bestEl = this.root.querySelector('.hud-combo > em') as HTMLElement;
    this.multEl = this.root.querySelector('.hud-combo > small') as HTMLElement;
    this.rankFill = this.root.querySelector('.hud-rank-track > i') as HTMLElement;
    this.objectiveHost = this.root.querySelector('.hud-obj-list') as HTMLElement;
    this.timerEl = this.root.querySelector('.hud-timer') as HTMLElement;
    this.hpFill = this.root.querySelector('.hud-track.hp > i') as HTMLElement;
    this.hpText = this.root.querySelector('.hud-track.hp')?.parentElement?.querySelector('b') as HTMLElement;
    this.heatFill = this.root.querySelector('.hud-track.heat > i') as HTMLElement;
    this.heatText = this.root.querySelector('.hud-track.heat')?.parentElement?.querySelector('b') as HTMLElement;
    this.missilePips = [...this.root.querySelectorAll('.hud-pips')].map(() => document.createElement('i'));
    const pipsHost = this.root.querySelector('.hud-pips') as HTMLElement;
    for (let i = 0; i < 3; i++) {
      const pip = document.createElement('i');
      pipsHost.appendChild(pip);
      this.missilePips[i] = pip;
    }
    this.lockText = this.root.querySelector('.lock-text') as HTMLElement;
    this.specialText = this.root.querySelector('.special-text') as HTMLElement;
    this.specialCd = this.root.querySelector('.special-cd') as HTMLElement;
    this.specialSlot = this.root.querySelector('.hud-weapon-special') as HTMLElement;
    this.odFill = this.root.querySelector('.od-track > i') as HTMLElement;
    this.odWrap = this.root.querySelector('.hud-overdrive') as HTMLElement;
    this.speedEl = this.root.querySelector('.hud-speed > b') as HTMLElement;
    this.bossWrap = this.root.querySelector('.hud-boss') as HTMLElement;
    this.bossFill = this.root.querySelector('.hud-boss') as HTMLElement;
    this.radioWrap = this.root.querySelector('.hud-radio') as HTMLElement;
    this.radioSpeaker = this.root.querySelector('.hud-radio-speaker') as HTMLElement;
    this.radioText = this.root.querySelector('.hud-radio-text') as HTMLElement;
    this.markerLayer = this.root.querySelector('.hud-markers') as HTMLElement;
    this.reticle = this.root.querySelector('.hud-reticle') as HTMLElement;
    this.cursor = this.root.querySelector('.hud-cursor') as HTMLElement;
    this.lockRing = this.root.querySelector('.rt-lock') as HTMLElement;
    this.vignette = this.root.querySelector('.hud-vignette') as HTMLElement;

    this.bossWrap.innerHTML = `
      <div class="boss-head"><span class="boss-kicker">SKY CORE</span><b class="boss-name">天枢</b><span class="boss-phase">PHASE 1</span><span class="boss-shield">SHIELD</span></div>
      <div class="boss-track"><i></i></div>
      <div class="boss-foot"><span class="boss-hp">3400 / 3400</span><span class="boss-note">蚀灵核心 · 护盾发生器中</span></div>`;
    this.bossFill = this.bossWrap.querySelector('.boss-track > i') as HTMLElement;
    this.bossHp = this.bossWrap.querySelector('.boss-hp') as HTMLElement;
    this.bossPhase = this.bossWrap.querySelector('.boss-phase') as HTMLElement;
    this.bossShield = this.bossWrap.querySelector('.boss-shield') as HTMLElement;

    for (let i = 0; i < 24; i++) {
      const marker = div('hud-marker');
      marker.innerHTML = `<i class="mk-shape"></i><b class="mk-name"></b><span class="mk-dist"></span><i class="mk-lock"></i>`;
      marker.style.display = 'none';
      this.markerLayer.appendChild(marker);
      this.markerEls.push({
        root: marker,
        dist: marker.querySelector('.mk-dist') as HTMLElement,
        name: marker.querySelector('.mk-name') as HTMLElement,
      });
    }

    (this.root.querySelector('.hud-pause') as HTMLButtonElement).addEventListener('click', () => this.callbacks.onPause());
  }

  update(snapshot: MissionSnapshot, camera: THREE.Camera, dt: number): void {
    const now = performance.now();
    if (snapshot.score !== this.lastScore) {
      this.lastScore = snapshot.score;
      setText(this.scoreEl, formatScore(snapshot.score));
    }
    if (snapshot.kills !== this.lastKills) {
      this.lastKills = snapshot.kills;
      setText(this.killsEl, `${snapshot.kills} / ${snapshot.totalTargets} KILLS`);
    }
    setText(this.comboEl, String(snapshot.combo).padStart(2, '0'));
    setText(this.comboLabelEl, snapshot.comboRank);
    setText(this.multEl, `×${snapshot.multiplier.toFixed(1)}`);
    setText(this.bestEl, `BEST ${snapshot.bestCombo}`);
    setWidth(this.rankFill, clamp(snapshot.combo / 30, 0, 1));
    this.rankFill.classList.toggle('is-hot', snapshot.combo >= 20);
    if (snapshot.combo !== this.lastCombo) {
      this.lastCombo = snapshot.combo;
      this.comboEl.classList.remove('is-bump');
      void this.comboEl.offsetWidth;
      if (snapshot.combo > 0) this.comboEl.classList.add('is-bump');
    }

    const hpRatio = snapshot.hp / Math.max(1, snapshot.maxHp);
    setWidth(this.hpFill, hpRatio);
    this.hpFill.classList.toggle('is-low', hpRatio < 0.35);
    setText(this.hpText, `${Math.ceil(snapshot.hp)}`);
    setWidth(this.heatFill, clamp(snapshot.heat / 100, 0, 1));
    this.heatFill.classList.toggle('is-over', snapshot.overheated);
    setText(this.heatText, snapshot.overheated ? 'OVERHEAT' : snapshot.heat > 65 ? 'HOT' : 'READY');
    this.missilePips.forEach((pip, i) => pip.classList.toggle('on', i < snapshot.missiles));
    setText(this.lockText, `锁定 ${snapshot.lockCount} / ${snapshot.lockMax}`);
    setText(this.timerEl, formatTime(snapshot.time));
    setText(this.speedEl, String(Math.round(snapshot.speed)));

    const specialRatio = snapshot.specialMax > 0 ? 1 - snapshot.specialCooldown / snapshot.specialMax : 1;
    this.specialCd.style.height = `${(1 - clamp(specialRatio, 0, 1)) * 100}%`;
    if (snapshot.specialCooldown <= 0) {
      setText(this.specialText, 'READY');
      this.specialSlot.classList.add('is-ready');
    } else {
      setText(this.specialText, `${Math.ceil(snapshot.specialCooldown)}s`);
      this.specialSlot.classList.remove('is-ready');
    }
    setWidth(this.odFill, clamp(snapshot.overdrive / 100, 0, 1));
    this.odWrap.classList.toggle('is-active', snapshot.overdriveActive);
    this.odWrap.classList.toggle('is-full', snapshot.overdrive >= 100 && !snapshot.overdriveActive);

    this.updateObjectives(snapshot);
    this.updateBoss(snapshot);
    this.updateMarkers(snapshot, camera);
    this.updateReticle(snapshot, camera);

    this.vignette.classList.toggle('is-critical', hpRatio < 0.3);
    if (hpRatio < this.lastHp) {
      this.root.classList.add('is-hit');
      window.clearTimeout(this.hitTimer);
      this.hitTimer = window.setTimeout(() => this.root.classList.remove('is-hit'), 120);
    }
    this.lastHp = hpRatio;

    this.radioTimer -= dt;
    if (this.radioTimer <= 0 && this.radioQueue.length > 0) {
      const msg = this.radioQueue.shift()!;
      this.showRadioNow(msg.speaker, msg.text);
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerEl?.classList.remove('is-active');
    }
    if (this.cutinTimer > 0) {
      this.cutinTimer -= dt;
      if (this.cutinTimer <= 0) this.cutin?.classList.remove('is-active');
    }
    void now;
  }

  private updateObjectives(snapshot: MissionSnapshot): void {
    const signature = snapshot.objectives.map((o) => `${o.id}:${o.current}:${o.done}`).join('|');
    if (signature === this.lastObjectiveSignature) return;
    this.lastObjectiveSignature = signature;
    const rows = snapshot.objectives
      .slice()
      .sort((a, b) => Number(a.optional) - Number(b.optional))
      .slice(0, 4)
      .map((o) => {
        const pct = clamp(o.current / Math.max(1, o.count), 0, 1);
        return `<div class="hud-obj ${o.done ? 'is-done' : ''} ${o.optional ? 'is-opt' : ''}">
          <i class="hud-obj-dot"></i>
          <span class="hud-obj-label">${o.label}</span>
          <span class="hud-obj-count">${o.current}/${o.count}</span>
          <span class="hud-obj-bar"><i style="width:${pct * 100}%"></i></span>
        </div>`;
      })
      .join('');
    this.objectiveHost.innerHTML = rows;
    const head = this.root.querySelector('.hud-obj-head b') as HTMLElement;
    const required = snapshot.objectives.filter((o) => !o.optional);
    const done = required.filter((o) => o.done).length;
    if (head) head.textContent = `${done} / ${required.length}`;
  }

  private updateBoss(snapshot: MissionSnapshot): void {
    const boss = snapshot.boss;
    this.bossWrap.classList.toggle('is-visible', Boolean(boss));
    if (!boss) return;
    setWidth(this.bossFill, clamp(boss.hp / boss.maxHp, 0, 1));
    setText(this.bossHp, `${Math.ceil(boss.hp)} / ${boss.maxHp}`);
    setText(this.bossPhase, `PHASE ${boss.phase}`);
    this.bossShield.classList.toggle('is-on', boss.shielded);
    const name = this.bossWrap.querySelector('.boss-name') as HTMLElement;
    if (name) name.textContent = boss.name;
    const note = this.bossWrap.querySelector('.boss-note') as HTMLElement;
    if (note) note.textContent = boss.shielded ? '护盾发生器中 · 伤害衰减' : boss.phase >= 3 ? '核心暴露 · 全力输出' : boss.subtitle;
  }

  private updateMarkers(snapshot: MissionSnapshot, camera: THREE.Camera): void {
    const markers = snapshot.markers
      .filter(
        (m) =>
          m.kind === 'boss' ||
          m.kind === 'ace' ||
          m.objective ||
          m.locked ||
          (m.kind === 'ground' ? m.distance < 520 : m.distance < 760),
      )
      .slice()
      .sort((a, b) => {
        const pa = a.kind === 'boss' ? 0 : a.kind === 'ace' ? 1 : a.locked ? 2 : 3;
        const pb = b.kind === 'boss' ? 0 : b.kind === 'ace' ? 1 : b.locked ? 2 : 3;
        return pa - pb || a.distance - b.distance;
      })
      .slice(0, this.markerEls.length);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.markerEls.forEach((el, i) => {
      const m = markers[i];
      if (!m) {
        el.root.style.display = 'none';
        return;
      }
      const v = this.tmp.copy(m.pos).project(camera);
      const onScreen = v.z > -1 && v.z < 1 && Math.abs(v.x) < 1.15 && Math.abs(v.y) < 1.15;
      if (!onScreen && m.kind !== 'boss' && m.kind !== 'ace' && !m.objective) {
        el.root.style.display = 'none';
        return;
      }
      let x = (v.x * 0.5 + 0.5) * w;
      let y = (-v.y * 0.5 + 0.5) * h;
      const margin = 36;
      const clampedX = clamp(x, margin, w - margin);
      const clampedY = clamp(y, margin + 40, h - margin - 80);
      const edge = clampedX !== x || clampedY !== y;
      x = clampedX;
      y = clampedY;
      el.root.style.display = 'block';
      el.root.className = `hud-marker mk-${m.kind} ${m.locked ? 'is-locked' : ''} ${m.objective ? 'is-objective' : ''} ${edge ? 'is-edge' : ''}`;
      el.root.style.transform = `translate(${x}px, ${y}px)`;
      el.dist.textContent = `${Math.round(m.distance / 10) * 10}m`;
      el.name.textContent = m.kind === 'ace' || m.kind === 'boss' ? m.name : '';
    });
  }

  private updateReticle(snapshot: MissionSnapshot, camera: THREE.Camera): void {
    const aim = snapshot.playerPos.clone().addScaledVector(snapshot.playerForward, 72);
    const v = aim.project(camera);
    const w = window.innerWidth;
    const h = window.innerHeight;
    if (v.z < -1 || v.z > 1) {
      this.reticle.classList.add('is-hidden');
      return;
    }
    this.reticle.classList.remove('is-hidden');
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (-v.y * 0.5 + 0.5) * h;
    this.reticle.style.transform = `translate(${x}px, ${y}px)`;
    this.reticle.classList.toggle('is-locked', snapshot.lockCount > 0);
    this.lockRing.style.setProperty('--p', String(clamp(snapshot.lockProgress, 0, 1)));
    const hint = this.reticle.querySelector('.rt-hint') as HTMLElement;
    if (hint) hint.textContent = snapshot.lockCount > 0 ? `${snapshot.lockCount} LOCK` : 'LOCK';
  }

  setPointer(x: number, y: number, visible: boolean): void {
    this.cursor.style.transform = `translate(${x}px, ${y}px)`;
    this.cursor.style.opacity = visible ? '1' : '0';
  }

  radio(speaker: string, text: string): void {
    if (!this.subtitles) return;
    if (text === this.radioText.textContent) return;
    if (this.radioQueue.length > 4) this.radioQueue.shift();
    this.radioQueue.push({ speaker, text });
  }

  private showRadioNow(speaker: string, text: string): void {
    this.radioSpeaker.textContent = speaker;
    this.radioText.textContent = text;
    this.radioWrap.classList.add('is-active');
    this.radioTimer = 3.6;
    window.setTimeout(() => this.radioWrap.classList.remove('is-active'), 3400);
  }

  banner(main: string, sub: string, kicker = 'OPERATION'): void {
    if (!this.bannerEl) {
      this.bannerEl = div('hud-banner');
      this.root.appendChild(this.bannerEl);
    }
    this.bannerEl.innerHTML = `<span>${kicker}</span><b>${main}</b><small>${sub}</small>`;
    this.bannerEl.classList.remove('is-active');
    void this.bannerEl.offsetWidth;
    this.bannerEl.classList.add('is-active');
    this.bannerTimer = 2.4;
  }

  cutIn(kind: 'special' | 'revive' | 'overdrive' | 'boss', text: string, speaker: string): void {
    if (!this.cutin) {
      this.cutin = div('hud-cutin');
      this.root.appendChild(this.cutin);
    }
    const labels: Record<string, string> = {
      special: 'LINK BREAK / SPECIAL',
      revive: 'REBIRTH PROTOCOL',
      overdrive: 'LIMIT RELEASE',
      boss: 'TARGET DESTROYED',
    };
    this.cutin.dataset.kind = kind;
    this.cutin.innerHTML = `
      <div class="cutin-lines"></div>
      <div class="cutin-portrait" style="background-image:url('${assetUrl(this.girl.art.bust)}')"></div>
      <div class="cutin-content">
        <span class="cutin-kicker">${labels[kind] ?? 'LINK'}</span>
        <b class="cutin-name">${speaker}</b>
        <p class="cutin-text">${text}</p>
      </div>
      <div class="cutin-corner tl"></div><div class="cutin-corner br"></div>`;
    this.cutin.classList.remove('is-active');
    void this.cutin.offsetWidth;
    this.cutin.classList.add('is-active');
    this.cutinTimer = 1.55;
  }

  destroy(): void {
    window.clearTimeout(this.hitTimer);
    this.root.remove();
  }
}
