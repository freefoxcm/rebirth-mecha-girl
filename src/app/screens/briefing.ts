import { BaseScreen } from '../base-screen';
import type { App } from '../app';
import type { Difficulty, GirlSpec, MissionId, WeaponId } from '../../data/types';
import { GIRLS } from '../../data/girls';
import { MISSIONS } from '../../data/missions';
import { MEDAL_RULES } from '../../data/config';
import { assetUrl } from '../../core/assets';
import { button, div, icon } from '../../ui/dom';

const WEAPON_NAMES: Record<WeaponId, string> = {
  missile: '追踪弹',
  lockPlus: '锁定强化',
  piercer: '穿甲弹',
};

const DIFFICULTY_LABEL: Record<Difficulty, { name: string; desc: string }> = {
  normal: { name: '普通', desc: '标准敌方强度 · 分数 ×1.0' },
  hard: { name: '困难', desc: '敌方 HP +30% / 伤害 +20% · 分数 ×1.5' },
};

export class BriefingScreen extends BaseScreen {
  private missionId!: MissionId;
  private difficulty: Difficulty = 'normal';
  private girl!: GirlSpec;

  constructor(app: App) {
    super(app);
  }

  enter(params?: Record<string, unknown>): void {
    this.root.classList.add('briefing-screen');
    this.missionId = (params?.missionId as MissionId) ?? this.app.save.getNextMission();
    this.difficulty = (params?.difficulty as Difficulty) ?? 'normal';
    const mission = MISSIONS[this.missionId];
    this.girl = GIRLS[this.app.save.selectedGirl];
    const stats = this.app.save.getLoadoutStats(this.girl.id);
    const locked = !this.app.save.isMissionUnlocked(this.missionId);

    const bg = div('briefing-bg');
    bg.style.backgroundImage = `url("${assetUrl(this.girl.art.poster)}")`;
    const grid = div('briefing-grid');

    const top = div('topbar');
    const back = button(`${icon('back', 14)} 作战列表`, () => this.go('hub', { mission: this.missionId }), 'bare', 'brief-back');
    const brand = div('topbar-brand');
    brand.innerHTML = `<span class="brand-mark"></span><span class="brand-name">作战简报</span><i>/</i><span>OPERATION BRIEF</span>`;
    const right = div('topbar-right');
    right.innerHTML = `<span class="brief-status">${locked ? 'LOCKED' : 'READY TO LAUNCH'}</span>`;
    top.append(back, brand, right);

    const wrap = div('brief-wrap');

    const main = div('brief-main panel');
    const head = div('brief-head');
    head.innerHTML = `
      <div class="brief-kicker">${mission.chapter} · OPERATION ${String(mission.index).padStart(2, '0')}</div>
      <h1>${mission.title}</h1>
      <div class="brief-sub">${mission.subtitle}</div>
      <div class="brief-chips">
        <span>${icon('gauge', 12)} ${mission.duration}</span>
        <span class="${mission.threat === '灾厄' ? 'threat-high' : ''}">${icon('warning', 12)} ${mission.threat}</span>
        <span>${icon('target', 12)} ${mission.objectives.filter((o) => !o.optional).length} 主要目标</span>
      </div>`;

    const objectives = div('brief-section');
    objectives.innerHTML = `<h3><span>01</span>任务目标</h3>
      <div class="objective-list">
        ${mission.objectives
          .map(
            (o) => `<div class="objective-row ${o.optional ? 'is-optional' : ''}">
              <span class="obj-mark"></span>
              <span class="obj-label">${o.label}</span>
              <span class="obj-count">× ${o.count}</span>
              <span class="obj-tag">${o.optional ? '可选' : '必须'}</span>
            </div>`,
          )
          .join('')}
      </div>`;

    const medals = div('brief-section');
    medals.innerHTML = `<h3><span>02</span>勋章条件</h3>
      <div class="medal-grid">
        ${MEDAL_RULES.map(
          (m) => `<div class="medal-item">
            <span class="medal-icon">${icon('medal', 16)}</span>
            <div><b>${m.name}</b><small>${m.desc}</small></div>
            <span class="medal-alloy">+${m.alloy}</span>
          </div>`,
        ).join('')}
      </div>`;

    const intel = div('brief-section');
    intel.innerHTML = `<h3><span>03</span>敌情与提示</h3>
      <ul class="intel-list">${mission.intel.map((line) => `<li>${line}</li>`).join('')}</ul>
      <div class="tip-list">${mission.tips.map((tip) => `<span>${icon('info', 12)} ${tip}</span>`).join('')}</div>`;

    main.append(head, objectives, medals, intel);

    const aside = div('brief-aside panel');
    const portrait = div('brief-portrait');
    portrait.innerHTML = `
      <div class="brief-portrait-img" style="background-image:url('${assetUrl(this.girl.art.bust)}')"></div>
      <div class="brief-portrait-grad"></div>
      <div class="brief-pilot">
        <span class="kicker">LINKED AIRFRAME</span>
        <strong>${this.girl.name}<small>${this.girl.en}</small></strong>
        <span>${this.girl.role}</span>
      </div>`;
    const body = div('brief-aside-body');
    body.innerHTML = `
      <div class="brief-special">
        <span class="kicker">SPECIAL / E</span>
        <b>${this.girl.special.name}</b>
        <p>${this.girl.special.desc}</p>
        <small>冷却 ${stats.specialCooldown.toFixed(0)}s</small>
      </div>
      <div class="stat-bars">
        ${this.bar('装甲', stats.maxHp, 140)}
        ${this.bar('极速', stats.speed, 200)}
        ${this.bar('转向', stats.turn, 82)}
        ${this.bar('火力', this.girl.stats.gun, 1.2)}
      </div>`;

    const diff = div('brief-difficulty');
    diff.innerHTML = `<span class="kicker">DIFFICULTY</span><div class="diff-row"></div><small class="diff-desc">${DIFFICULTY_LABEL[this.difficulty].desc}</small>`;
    const diffRow = diff.querySelector('.diff-row') as HTMLDivElement;
    (['normal', 'hard'] as Difficulty[]).forEach((d) => {
      const b = button(DIFFICULTY_LABEL[d].name, () => {
        this.difficulty = d;
        diffRow.querySelectorAll('button').forEach((node) => node.classList.toggle('is-active', node === b));
        (diff.querySelector('.diff-desc') as HTMLElement).textContent = DIFFICULTY_LABEL[d].desc;
        this.app.audio.play('ui');
      }, 'bare', `diff-btn ${d === this.difficulty ? 'is-active' : ''}`);
      b.setAttribute('data-silent', 'true');
      diffRow.appendChild(b);
    });

    const rewards = div('brief-rewards');
    const rewardItems = [`<span>${icon('alloy', 12)} 合金 +${mission.rewards.alloy}</span>`];
    for (const g of mission.rewards.girls ?? []) rewardItems.push(`<span>${icon('hangar', 12)} 解锁 ${GIRLS[g].name}</span>`);
    if (mission.rewards.weapon) rewardItems.push(`<span>${icon('missile', 12)} ${WEAPON_NAMES[mission.rewards.weapon]}</span>`);
    rewards.innerHTML = `<span class="kicker">FIRST CLEAR REWARD</span><div class="reward-list">${rewardItems.join('')}</div>`;

    const launch = button(`${icon('play', 16)} 出击`, () => this.launch(), 'primary', 'brief-launch');
    launch.disabled = locked;
    const hint = div('brief-hint', locked ? '完成上一场作战后解锁' : 'ENTER 确认 · ESC 返回');

    body.append(diff, rewards, launch, hint);
    aside.append(portrait, body);

    wrap.append(main, aside);
    this.root.append(bg, grid, top, wrap);

    this.onWindow('keydown', (e) => {
      if (e.code === 'Escape') this.go('hub', { mission: this.missionId });
      if (e.code === 'Enter') this.launch();
    });
    this.app.audio.startMusic('menu');
  }

  private bar(label: string, value: number, max: number): string {
    const pct = Math.max(4, Math.min(100, (value / max) * 100));
    return `<div class="bar-row"><span>${label}</span><div class="bar"><i style="width:${pct}%"></i></div><b>${Math.round(value)}</b></div>`;
  }

  private launch(): void {
    const mission = MISSIONS[this.missionId];
    if (!this.app.save.isMissionUnlocked(this.missionId)) {
      this.app.toast('该作战尚未解锁', 'warn');
      return;
    }
    this.app.audio.play('confirm');
    if (mission.storyBefore && !this.app.save.hasSeenStory(mission.storyBefore)) {
      this.go('dialogue', {
        scene: mission.storyBefore,
        after: 'mission',
        missionId: this.missionId,
        difficulty: this.difficulty,
      });
      return;
    }
    this.go('mission', { missionId: this.missionId, difficulty: this.difficulty });
  }
}
