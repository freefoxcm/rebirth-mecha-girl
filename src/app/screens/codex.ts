import { BaseScreen } from '../base-screen';
import type { App } from '../app';
import { GIRL_ORDER, GIRLS } from '../../data/girls';
import { assetUrl } from '../../core/assets';
import { formatNumber } from '../../core/math';
import { button, div, icon } from '../../ui/dom';

export class CodexScreen extends BaseScreen {
  private from: 'hub' | 'title' = 'hub';

  constructor(app: App) {
    super(app);
  }

  enter(params?: Record<string, unknown>): void {
    this.root.classList.add('codex-screen');
    this.from = params?.from === 'title' ? 'title' : 'hub';

    const bg = div('codex-bg');
    bg.style.backgroundImage = `url("${assetUrl(GIRLS.qingluan.art.early ?? GIRLS.qingluan.art.poster)}")`;
    const top = div('topbar');
    const back = button(`${icon('back', 14)} 返回`, () => this.go(this.from), 'bare', 'codex-back');
    const brand = div('topbar-brand');
    brand.innerHTML = `<span class="brand-mark"></span><span class="brand-name">档案</span><i>/</i><span>MECHA ARCHIVE</span>`;
    const right = div('topbar-right');
    right.innerHTML = `<span class="codex-status">五系机娘 · 天穹历 073</span>`;
    top.append(back, brand, right);

    const head = div('codex-head');
    head.innerHTML = `
      <span class="kicker">MECHA ARCHIVE / FILE 01—05</span>
      <h1>五系机娘档案</h1>
      <p>她们本身就是机械生命，不是穿机甲的驾驶员。档案记录机体布局、战术定位与灵契状态；未解锁的条目需要完成对应作战。</p>`;

    const grid = div('codex-grid');
    GIRL_ORDER.forEach((id, index) => {
      const girl = GIRLS[id];
      const unlocked = this.app.save.isGirlUnlocked(id);
      const trust = this.app.save.getTrust(id);
      const card = document.createElement('button');
      card.type = 'button';
      card.className = `codex-card ${unlocked ? '' : 'is-locked'}`;
      card.innerHTML = `
        <div class="codex-card-img" style="background-image:url('${assetUrl(girl.art.poster)}')"></div>
        <div class="codex-card-grad"></div>
        <div class="codex-card-index">FILE ${String(index + 1).padStart(2, '0')}</div>
        <div class="codex-card-body">
          <div class="codex-card-name">${girl.name}<small>${girl.en}</small></div>
          <div class="codex-card-role">${girl.role}</div>
          <div class="codex-card-trust">${[0, 1, 2].map((i) => `<i class="${i < trust ? 'on' : ''}"></i>`).join('')}</div>
        </div>
        ${unlocked ? '<div class="codex-card-open">查看档案</div>' : `<div class="codex-card-lock">${icon('lock', 16)} 通关后解锁</div>`}`;
      card.addEventListener('click', () => {
        if (!unlocked) {
          this.app.audio.play('back');
          this.app.toast('完成对应作战后可查看完整档案', 'warn');
          return;
        }
        this.openDetail(id);
      });
      grid.appendChild(card);
    });

    this.root.append(bg, div('codex-grid-bg'), top, head, grid);
    this.onWindow('keydown', (e) => {
      if (e.code === 'Escape') this.go(this.from);
    });
    this.app.audio.startMusic('menu');
  }

  private openDetail(id: (typeof GIRL_ORDER)[number]): void {
    const girl = GIRLS[id];
    const unlocked = this.app.save.isGirlUnlocked(id);
    if (!unlocked) return;
    const backdrop = div('modal-backdrop codex-modal');
    const panel = div('codex-detail panel');
    const close = button('关闭', () => backdrop.remove(), 'primary');
    panel.innerHTML = `
      <div class="codex-detail-head">
        <div><span class="kicker">${girl.en} / FILE</span><h2>${girl.name}</h2><p>${girl.role}</p></div>
        <div class="codex-detail-index">${icon('codex', 18)}</div>
      </div>
      <div class="codex-detail-body">
        <div class="codex-art-block">
          <span class="codex-art-label">HUMANOID / 人形三视图</span>
          <div class="codex-art" style="background-image:url('${assetUrl(girl.art.humanoid)}')"></div>
        </div>
        <div class="codex-art-block">
          <span class="codex-art-label">AIRFRAME / 战机三视图</span>
          <div class="codex-art" style="background-image:url('${assetUrl(girl.art.plane)}')"></div>
        </div>
      </div>
      <div class="codex-detail-copy">
        <p>${girl.bio}</p>
        <div class="codex-special"><span>特技 / ${girl.special.name}</span><p>${girl.special.desc}</p></div>
        <p class="codex-quote">${girl.trustLines[Math.min(2, this.app.save.getTrust(id))]}</p>
      </div>
      <div class="codex-detail-foot">
        <span>灵契同步 100% · 信赖 ${this.app.save.getTrust(id)} / 3</span>
        <div class="codex-detail-actions"></div>
      </div>`;
    const actions = panel.querySelector('.codex-detail-actions') as HTMLElement;
    actions.append(close);
    backdrop.appendChild(panel);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });
    this.root.appendChild(backdrop);
    this.addCleanup(() => backdrop.remove());
  }
}
