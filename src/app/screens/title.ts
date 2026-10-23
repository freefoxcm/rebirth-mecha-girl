import { BaseScreen } from '../base-screen';
import type { App } from '../app';
import { GAME_TITLE_EN, GAME_VERSION } from '../../data/config';
import { GIRLS } from '../../data/girls';
import { MISSION_ORDER } from '../../data/missions';
import { assetUrl } from '../../core/assets';
import { button, div, menu } from '../../ui/dom';

export class TitleScreen extends BaseScreen {
  constructor(app: App) {
    super(app);
  }

  enter(): void {
    this.root.classList.add('title-screen');
    const girl = GIRLS[this.app.save.selectedGirl];
    const bg = div('title-bg');
    bg.style.backgroundImage = `url("${assetUrl(girl.art.poster)}")`;
    const grain = div('title-grain');
    const scan = div('title-scan');
    const top = div('title-top');
    top.innerHTML = `
      <div class="brand-line"><span class="brand-mark"></span>${GAME_TITLE_EN}</div>
      <div class="title-status"><span class="dot"></span>天穹历 073 · ${this.app.save.data.progress.ending ? '风暴已散' : '栖霞号待命'}</div>`;

    const left = div('title-left');
    left.innerHTML = `
      <div class="eyebrow"><span>REBIRTH</span><i></i><span>SKY RAMPAGE</span></div>
      <h1 class="logo">
        <span class="logo-top">重生之</span>
        <span class="logo-main">我和机娘<em>杀疯了</em></span>
      </h1>
      <p class="tagline">上一世被队友背刺坠机而亡。<br>这一世，我和五个高傲的机娘，把天空打成了烟花。</p>
      <div class="logo-rule"><span></span><i></i><span></span></div>`;

    const navWrap = div('title-menu-wrap');
    const items = [
      {
        label: '继续作战',
        hint: this.app.save.hasProgress ? `第 ${this.completedCount() + 1} 战 · ${GIRLS[this.app.save.selectedGirl].name}` : '暂无作战记录',
        icon: 'play' as const,
        disabled: !this.app.save.hasProgress || !this.app.hasScreen('hub'),
        action: () => this.go('hub'),
      },
      {
        label: '新的开始',
        hint: this.app.save.hasProgress ? '会覆盖当前进度' : '序章 · 坠落',
        icon: 'star' as const,
        action: () => this.newGame(),
      },
      {
        label: '机 库',
        hint: `${this.app.save.data.unlocks.girls.length} / 5 机娘可用`,
        icon: 'hangar' as const,
        disabled: !this.app.hasScreen('hangar'),
        action: () => this.go('hangar', { from: 'title' }),
      },
      {
        label: '设 置',
        hint: '音量 · 画质 · 字幕',
        icon: 'settings' as const,
        disabled: !this.app.hasScreen('settings'),
        action: () => this.go('settings', { from: 'title' }),
      },
    ];
    const nav = menu(items, 'title-menu');
    this.addCleanup(() => (nav as HTMLDivElement & { destroy?: () => void }).destroy?.());
    navWrap.appendChild(nav);

    const meta = div('title-meta');
    meta.innerHTML = `
      <span>v${GAME_VERSION}</span>
      <span class="meta-divider"></span>
      <span>键鼠操作</span>
      <span class="meta-divider"></span>
      <span>建议佩戴耳机</span>`;

    left.append(navWrap, meta);

    const right = div('title-right');
    if (this.app.save.hasProgress) {
      const record = div('sortie-card');
      const face = div('sortie-face');
      face.style.backgroundImage = `url("${assetUrl(girl.art.face)}")`;
      const body = div('sortie-body');
      body.innerHTML = `
        <div class="sortie-kicker">CURRENT AIRFRAME</div>
        <div class="sortie-name">${girl.name}<small>${girl.en}</small></div>
        <div class="sortie-line"><span>灵契同步</span><b>100%</b></div>
        <div class="sortie-line"><span>已通关</span><b>${this.completedCount()} / ${MISSION_ORDER.length}</b></div>`;
      record.append(face, body);
      right.appendChild(record);
    }

    const stamp = div('title-stamp');
    stamp.innerHTML = `<span>REBIRTH</span><small>SKY RAMPAGE</small>`;

    const footer = div('title-footer');
    footer.innerHTML = `
      <div class="footer-hints">
        <span><kbd>WASD</kbd> 移动</span>
        <span><kbd>Shift</kbd> 低速</span>
        <span><kbd>左键</kbd> 主炮</span>
        <span><kbd>右键</kbd> 导弹</span>
        <span><kbd>E</kbd> 特技</span>
      </div>
      <div class="footer-serial">QIXIA / CV-07 · ${new Date().getFullYear()}</div>`;

    this.root.append(bg, grain, scan, top, left, right, stamp, footer);
    this.app.audio.startMusic('menu');
  }

  private completedCount(): number {
    return this.app.save.data.progress.completed.length;
  }

  private newGame(): void {
    if (!this.app.save.hasProgress) {
      this.startFresh();
      return;
    }
    const backdrop = div('modal-backdrop');
    const panel = div('modal modal-sm');
    panel.innerHTML = `
      <div class="modal-kicker">NEW OPERATION</div>
      <h2>覆盖当前进度？</h2>
      <p>已解锁的机娘、合金与关卡记录会被清空。设置不会重置。</p>`;
    const actions = div('modal-actions');
    actions.append(
      button('取消', () => backdrop.remove(), 'ghost'),
      button('确认覆盖', () => {
        backdrop.remove();
        this.startFresh();
      }, 'danger'),
    );
    panel.appendChild(actions);
    backdrop.appendChild(panel);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });
    this.root.appendChild(backdrop);
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        backdrop.remove();
        window.removeEventListener('keydown', onKey);
      }
    };
    window.addEventListener('keydown', onKey);
    this.addCleanup(() => window.removeEventListener('keydown', onKey));
  }

  private startFresh(): void {
    this.app.save.resetProgress();
    this.app.audio.play('confirm');
    this.go('dialogue', { scene: 'prologue', after: 'hub' });
  }
}
