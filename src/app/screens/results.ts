import { BaseScreen } from '../base-screen';
import type { App } from '../app';
import type { CommitInfo } from '../save';
import type { Difficulty, GirlId, MedalId, MissionId, MissionResult, Rank, WeaponId } from '../../data/types';
import { MISSIONS } from '../../data/missions';
import { GIRLS } from '../../data/girls';
import { MEDAL_RULES } from '../../data/config';
import { easeOutCubic, formatNumber, formatScore, formatTime } from '../../core/math';
import { button, div, icon } from '../../ui/dom';

const RANK_WORD: Record<Rank, string> = { S: 'PERFECT', A: 'GREAT', B: 'GOOD', C: 'OK' };
const WEAPON_NAMES: Record<WeaponId, string> = { missile: '追踪弹', lockPlus: '锁定强化', piercer: '穿甲弹' };

export class ResultsScreen extends BaseScreen {
  private result!: MissionResult;
  private commit!: CommitInfo;
  private scoreNode!: HTMLElement;
  private displayScore = 0;
  private animTime = 0;
  private animating = true;

  constructor(app: App) {
    super(app);
  }

  enter(params?: Record<string, unknown>): void {
    this.root.classList.add('results-screen');
    const missionId = (params?.missionId as MissionId) ?? 'm1';
    this.root.classList.toggle('is-fail', Boolean((params?.result as MissionResult | undefined)?.success === false));
    this.result = (params?.result as MissionResult) ?? this.mockResult(missionId);
    this.commit =
      (params?.commit as CommitInfo) ?? {
        firstClear: true,
        newGirls: this.result.newGirls,
        newWeapons: this.result.newWeapons,
        newMedals: this.result.medalsNew,
        isNewBest: true,
        trustGain: 1,
        alloyAdded: this.result.alloy,
      };
    const mission = MISSIONS[this.result.missionId];
    const success = this.result.success;
    const rank = success ? (this.result.rank === '-' ? 'C' : this.result.rank) : '-';

    const bg = div('results-bg');
    const backdrop = params?.backdrop as string | undefined;
    bg.style.backgroundImage = backdrop
      ? `url("${backdrop}")`
      : `url("${this.app.assetUrl(GIRLS[this.result.girlId].art.poster)}")`;
    const dim = div('results-dim');
    const scan = div('results-scan');

    const top = div('results-top');
    top.innerHTML = `
      <div class="results-op">
        <span class="kicker">${mission.chapter} / ${mission.title}</span>
        <b>${success ? 'MISSION COMPLETE' : 'MISSION FAILED'}</b>
      </div>
      <div class="results-meta">
        <span>${mission.subtitle}</span>
        <i></i>
        <span>${GIRLS[this.result.girlId].name} / 灵契同步</span>
        <i></i>
        <span>${this.result.difficulty === 'hard' ? '困难' : '普通'}</span>
      </div>
      <div class="results-clock">${icon('gauge', 13)} ${formatTime(this.result.time)}</div>`;

    const main = div('results-main');

    // 左：评级 + 勋章
    const left = div('results-panel rating-panel panel');
    left.innerHTML = `
      <div class="panel-kicker">MISSION RATING</div>
      <div class="rank-stamp ${success ? 'is-success' : 'is-fail'}">
        <span class="rank-letter">${success ? rank : '✕'}</span>
        <span class="rank-word">${success ? RANK_WORD[rank as Rank] : 'FAILED'}</span>
        <span class="rank-sub">${success ? '评价' : '再接再厉'}</span>
      </div>
      <div class="rank-score-label">TOTAL SCORE</div>
      <div class="rank-score" id="result-score">${formatScore(this.result.score)}</div>
      ${this.commit.isNewBest && success ? '<div class="new-record">NEW RECORD</div>' : ''}
      <div class="medal-title"><span>这一档的勋章</span><small>${this.result.medals.length} / 4</small></div>
      <div class="result-medals">
        ${MEDAL_RULES.map((m) => {
          const earned = this.result.medals.includes(m.id as MedalId);
          return `<div class="result-medal ${earned ? 'is-earned' : ''}">
            <span class="result-medal-icon">${icon(earned ? 'medal' : 'lock', 17)}</span>
            <div><b>${m.name}</b><small>${m.desc}</small></div>
            <span class="result-medal-state">${earned ? (this.commit.newMedals.includes(m.id) ? '首次 +' + m.alloy : '已获得') : '未达成'}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="medal-note">首次获得的勋章会额外结算合金。</div>
      <div class="result-quote">
        <span class="quote-line"></span>
        <p>${GIRLS[this.result.girlId].quotes[success ? 'clear' : 'revive']}</p>
        <small>${GIRLS[this.result.girlId].name} / ${success ? '战后记录' : '灵契中断'}</small>
      </div>`;

    // 右：统计 + 奖励
    const right = div('results-panel stats-panel panel');
    const killRate = this.result.totalTargets > 0 ? Math.round((this.result.kills / this.result.totalTargets) * 100) : 0;
    const rewardBase = Math.round(this.result.baseAlloy * this.result.rankMultiplier);
    right.innerHTML = `
      <div class="panel-kicker">DEBRIEF</div>
      <div class="result-stats">
        ${this.stat('击坠数', `${this.result.kills} / ${this.result.totalTargets}`, '')}
        ${this.stat('击坠率', `${killRate}%`, '')}
        ${this.stat('命中率', `${Math.round(this.result.accuracy * 100)}%`, '')}
        ${this.stat('最高连击', String(this.result.bestCombo), this.result.bestCombo >= 30 ? 'amber' : '')}
        ${this.stat('受损', String(this.result.damageTaken), this.result.damageTaken === 0 ? 'amber' : '')}
        ${this.stat('重生协议', this.result.revives > 0 ? `${this.result.revives} 次` : '未使用', this.result.revives > 0 ? 'red' : '')}
      </div>
      <div class="reward-block">
        <div class="reward-head"><span>合金结算</span><span class="reward-total">${icon('alloy', 14)} ${formatNumber(this.result.alloy)}</span></div>
        <div class="reward-row"><span>基础奖励</span><b>${formatNumber(this.result.baseAlloy)}</b></div>
        <div class="reward-row"><span>评级倍率</span><b>× ${this.result.rankMultiplier.toFixed(2)}</b></div>
        <div class="reward-row"><span>勋章加成</span><b>+ ${formatNumber(this.result.medalAlloy)}</b></div>
        <div class="reward-row total"><span>本次入账</span><b>${formatNumber(rewardBase + this.result.medalAlloy)}</b></div>
      </div>
      <div class="objective-block">
        <div class="panel-kicker">OBJECTIVES</div>
        <div class="result-objective-list">
          ${(this.result.objectives ?? []).map((o) => `
            <div class="result-objective ${o.done ? 'is-done' : ''} ${o.optional ? 'is-opt' : ''}">
              <i>${o.done ? icon('check', 10) : ''}</i>
              <span>${o.label}</span>
              <b>${o.current} / ${o.count}</b>
              <small>${o.optional ? '可选' : '必须'}</small>
            </div>`).join('') || '<span class="unlock-empty">目标数据未记录</span>'}
        </div>
      </div>
      <div class="unlock-block">
        <div class="panel-kicker">UNLOCKS ${this.commit.trustGain > 0 ? `<span class="trust-gain">信赖 +${this.commit.trustGain}</span>` : ''}</div>
        <div class="unlock-list">
          ${
            this.commit.newGirls.length || this.commit.newWeapons.length
              ? [
                  ...this.commit.newGirls.map((g: GirlId) => `<span>${icon('hangar', 13)} 新机娘 · ${GIRLS[g].name}</span>`),
                  ...this.commit.newWeapons.map((w) => `<span>${icon('missile', 13)} 新武器 · ${WEAPON_NAMES[w as WeaponId] ?? w}</span>`),
                ].join('')
              : '<span class="unlock-empty">本次没有新的解锁</span>'
          }
        </div>
      </div>
      <div class="results-actions"></div>`;

    const actions = right.querySelector('.results-actions') as HTMLElement;
    const replay = button('重打', () => this.go('mission', { missionId: this.result.missionId, difficulty: this.result.difficulty }), 'ghost');
    const hangar = button('机库', () => this.go('hangar', { from: 'hub' }), 'ghost');
    const map = button('回地图', () => this.go('hub', { mission: this.result.missionId }), 'ghost');
    const next = button(this.nextLabel(), () => this.next(), 'primary', 'results-next');
    actions.append(replay, hangar, map, next);

    main.append(left, right);
    this.root.append(bg, dim, scan, top, main);

    this.scoreNode = left.querySelector('#result-score') as HTMLElement;
    this.displayScore = 0;
    this.animTime = 0;
    this.animating = true;

    this.onWindow('keydown', (e) => {
      if (e.code === 'Enter') this.next();
      if (e.code === 'KeyR') this.go('mission', { missionId: this.result.missionId, difficulty: this.result.difficulty });
      if (e.code === 'Escape') this.go('hub', { mission: this.result.missionId });
    });
    this.app.audio.startMusic(success ? 'menu' : 'none');
    if (success) this.later(() => this.app.audio.play('stamp'), 280);
  }

  private stat(label: string, value: string, tone: string): string {
    return `<div class="result-stat"><span>${label}</span><b class="${tone}">${value}</b></div>`;
  }

  private nextLabel(): string {
    if (!this.result.success) return '再次出击';
    const mission = MISSIONS[this.result.missionId];
    if (mission.storyAfter && !this.app.save.hasSeenStory(mission.storyAfter)) return '继续剧情';
    return '返回母舰';
  }

  private next(): void {
    if (!this.result.success) {
      this.go('mission', { missionId: this.result.missionId, difficulty: this.result.difficulty });
      return;
    }
    const mission = MISSIONS[this.result.missionId];
    if (mission.storyAfter && !this.app.save.hasSeenStory(mission.storyAfter)) {
      this.go('dialogue', {
        scene: mission.storyAfter,
        after: mission.storyAfter === 'ending' ? 'ending' : 'hub',
      });
      return;
    }
    this.go('hub', { mission: mission.id });
  }

  update(dt: number): void {
    if (!this.animating) return;
    this.animTime += dt;
    const t = easeOutCubic(Math.min(1, this.animTime / 1.1));
    this.displayScore = Math.round(this.result.score * t);
    if (this.scoreNode) this.scoreNode.textContent = formatScore(this.displayScore);
    if (t >= 1) this.animating = false;
  }

  private mockResult(missionId: MissionId): MissionResult {
    const mission = MISSIONS[missionId];
    return {
      missionId,
      girlId: this.app.save.selectedGirl,
      difficulty: 'normal',
      success: true,
      score: 6181,
      rank: 'A',
      kills: 21,
      totalTargets: 30,
      accuracy: 0.7,
      bestCombo: 34,
      time: 182,
      alloy: 326,
      medals: ['fullClear', 'sweep'],
      medalsNew: ['fullClear'],
      damageTaken: 0,
      revives: 0,
      baseAlloy: mission.rewards.alloy,
      rankMultiplier: 1.25,
      medalAlloy: 126,
      firstClear: true,
      newGirls: mission.rewards.girls ?? [],
      newWeapons: mission.rewards.weapon ? [mission.rewards.weapon] : [],
      isNewBest: true,
      bossDefeated: false,
      objectives: mission.objectives.map((o) => ({
        label: o.label,
        current: o.optional ? Math.max(0, o.count - 2) : o.count,
        count: o.count,
        optional: Boolean(o.optional),
        done: !o.optional,
      })),
    };
  }
}
