import type { GirlSpec } from '../data/types';
import type { ShmupSnapshot } from '../game/shmup/types';
import { assetUrl } from '../core/assets';
import { formatScore, formatTime, clamp } from '../core/math';
import { div, setText, setWidth } from './dom';

export interface ShmupHudCallbacks {
  onPause: () => void;
}

/** 雷电式竖版卷轴 HUD：无锁定准星、无敌人标记，改为卷轴进度与判定点。 */
export class ShmupHud {
  readonly root = div('hud shmup-hud');
  private readonly girl: GirlSpec;
  private readonly callbacks: ShmupHudCallbacks;
  private readonly subtitles: boolean;
  private scoreEl!: HTMLElement;
  private killsEl!: HTMLElement;
  private comboEl!: HTMLElement;
  private comboLabelEl!: HTMLElement;
  private bestEl!: HTMLElement;
  private multEl!: HTMLElement;
  private rankFill!: HTMLElement;
  private objectiveHost!: HTMLElement;
  private objHead!: HTMLElement;
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
  private bossWrap!: HTMLElement;
  private bossFill!: HTMLElement;
  private bossHp!: HTMLElement;
  private bossPhase!: HTMLElement;
  private bossShield!: HTMLElement;
  private bossNote!: HTMLElement;
  private radioWrap!: HTMLElement;
  private radioSpeaker!: HTMLElement;
  private radioText!: HTMLElement;
  private stageFill!: HTMLElement;
  private stagePct!: HTMLElement;
  private focusEl!: HTMLElement;
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

  constructor(girl: GirlSpec, callbacks: ShmupHudCallbacks, options: { subtitles?: boolean } = {}) {
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
      <div class="hud-objectives hud-objectives-side">
        <div class="hud-obj-head"><span>MISSION OBJECTIVE</span><b>0 / 3</b></div>
        <div class="hud-obj-list"></div>
      </div>
      <div class="hud-top-center">
        <div class="hud-boss"></div>
      </div>
      <div class="hud-top-right">
        <div class="hud-timer">00:00</div>
        <button class="hud-pause" type="button" aria-label="暂停">⏸<span>ESC</span></button>
      </div>
      <div class="hud-stage-rail">
        <span>STAGE</span>
        <div class="stage-track"><i></i></div>
        <b class="stage-pct">0%</b>
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
          <small>对空 / 对地</small>
        </div>
        <div class="hud-weapon hud-weapon-msl">
          <span class="hw-key">RMB</span>
          <b>追踪导弹</b>
          <small class="lock-text">3 / 3</small>
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
      </div>
      <div class="hud-radio"><span class="hud-radio-speaker">青鸾</span><p class="hud-radio-text"></p></div>
      <div class="hud-focus"></div>
      <div class="hud-flash"></div>`;

    this.scoreEl = this.root.querySelector('.hud-score') as HTMLElement;
    this.killsEl = this.root.querySelector('.hud-kills') as HTMLElement;
    this.comboEl = this.root.querySelector('.hud-combo > b') as HTMLElement;
    this.comboLabelEl = this.root.querySelector('.hud-combo-label') as HTMLElement;
    this.multEl = this.root.querySelector('.hud-combo > small') as HTMLElement;
    this.bestEl = this.root.querySelector('.hud-combo > em') as HTMLElement;
    this.rankFill = this.root.querySelector('.hud-rank-track > i') as HTMLElement;
    this.objectiveHost = this.root.querySelector('.hud-obj-list') as HTMLElement;
    this.objHead = this.root.querySelector('.hud-obj-head b') as HTMLElement;
    this.timerEl = this.root.querySelector('.hud-timer') as HTMLElement;
    this.hpFill = this.root.querySelector('.hud-track.hp > i') as HTMLElement;
    this.hpText = this.root.querySelector('.hud-track.hp')?.parentElement?.querySelector('b') as HTMLElement;
    this.heatFill = this.root.querySelector('.hud-track.heat > i') as HTMLElement;
    this.heatText = this.root.querySelector('.hud-track.heat')?.parentElement?.querySelector('b') as HTMLElement;
    const pipsHost = this.root.querySelector('.hud-pips') as HTMLElement;
    for (let i = 0; i < 3; i++) {
      const pip = document.createElement('i');
      pipsHost.appendChild(pip);
      this.missilePips.push(pip);
    }
    this.lockText = this.root.querySelector('.lock-text') as HTMLElement;
    this.specialText = this.root.querySelector('.special-text') as HTMLElement;
    this.specialCd = this.root.querySelector('.special-cd') as HTMLElement;
    this.specialSlot = this.root.querySelector('.hud-weapon-special') as HTMLElement;
    this.odFill = this.root.querySelector('.od-track > i') as HTMLElement;
    this.odWrap = this.root.querySelector('.hud-overdrive') as HTMLElement;
    this.bossWrap = this.root.querySelector('.hud-boss') as HTMLElement;
    this.bossFill = this.bossWrap as HTMLElement;
    this.radioWrap = this.root.querySelector('.hud-radio') as HTMLElement;
    this.radioSpeaker = this.root.querySelector('.hud-radio-speaker') as HTMLElement;
    this.radioText = this.root.querySelector('.hud-radio-text') as HTMLElement;
    this.stageFill = this.root.querySelector('.hud-stage-rail .stage-track > i') as HTMLElement;
    this.stagePct = this.root.querySelector('.hud-stage-rail .stage-pct') as HTMLElement;
    this.focusEl = this.root.querySelector('.hud-focus') as HTMLElement;
    this.vignette = this.root.querySelector('.hud-vignette') as HTMLElement;

    this.bossWrap.innerHTML = `
      <div class="boss-head"><span class="boss-kicker">SKY CORE</span><b class="boss-name">天枢</b><span class="boss-phase">PHASE 1</span><span class="boss-shield">SHIELD</span></div>
      <div class="boss-track"><i></i></div>
      <div class="boss-foot"><span class="boss-hp">3400 / 3400</span><span class="boss-note">蚀灵核心</span></div>`;
    this.bossFill = this.bossWrap.querySelector('.boss-track > i') as HTMLElement;
    this.bossHp = this.bossWrap.querySelector('.boss-hp') as HTMLElement;
    this.bossPhase = this.bossWrap.querySelector('.boss-phase') as HTMLElement;
    this.bossShield = this.bossWrap.querySelector('.boss-shield') as HTMLElement;
    this.bossNote = this.bossWrap.querySelector('.boss-note') as HTMLElement;

    (this.root.querySelector('.hud-pause') as HTMLButtonElement).addEventListener('click', () => this.callbacks.onPause());
  }

  update(snapshot: ShmupSnapshot, dt: number): void {
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
    setText(this.lockText, `${snapshot.missiles} / ${snapshot.maxMissiles}`);
    setText(this.timerEl, formatTime(snapshot.time));

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
    setWidth(this.stageFill, snapshot.stageProgress);
    setText(this.stagePct, `${Math.round(snapshot.stageProgress * 100)}%`);
    const fx = ((snapshot.playerX - snapshot.stageX) / Math.max(1, snapshot.fieldW) + 0.5) * 100;
    const fy = (snapshot.playerZRel / Math.max(1, snapshot.fieldH) + 0.5) * 100;
    this.focusEl.style.left = `${fx}%`;
    this.focusEl.style.top = `${fy}%`;
    this.focusEl.classList.toggle('is-on', snapshot.focus && !snapshot.overdriveActive);

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
  }

  private updateObjectives(snapshot: ShmupSnapshot): void {
    const signature = snapshot.objectives.map((o) => `${o.id}:${o.current}:${o.done}`).join('|');
    if (signature === this.lastObjectiveSignature) return;
    this.lastObjectiveSignature = signature;
    this.objectiveHost.innerHTML = snapshot.objectives
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
    const required = snapshot.objectives.filter((o) => !o.optional);
    setText(this.objHead, `${required.filter((o) => o.done).length} / ${required.length}`);
  }

  private updateBoss(snapshot: ShmupSnapshot): void {
    const boss = snapshot.boss;
    this.bossWrap.classList.toggle('is-visible', Boolean(boss));
    if (!boss) return;
    setWidth(this.bossFill, clamp(boss.hp / boss.maxHp, 0, 1));
    setText(this.bossHp, `${Math.ceil(boss.hp)} / ${boss.maxHp}`);
    setText(this.bossPhase, `PHASE ${boss.phase}`);
    this.bossShield.classList.toggle('is-on', boss.shielded);
    setText(this.bossName(), boss.name);
    setText(this.bossNote, boss.shielded ? '护盾发生器中 · 伤害衰减' : boss.phase >= 3 ? '核心暴露 · 全力输出' : boss.subtitle);
  }

  private bossName(): HTMLElement {
    return this.bossWrap.querySelector('.boss-name') as HTMLElement;
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
