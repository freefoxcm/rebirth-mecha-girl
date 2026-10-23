import { BaseScreen } from '../base-screen';
import type { App } from '../app';
import type { DialogueLine, DialogueScene, Difficulty, GirlId, MissionId, Speaker } from '../../data/types';
import { GIRLS } from '../../data/girls';
import { getScene } from '../../data/story';
import { assetUrl } from '../../core/assets';
import { div, icon } from '../../ui/dom';

const SPEAKER_TO_GIRL: Partial<Record<Speaker, GirlId>> = {
  青鸾: 'qingluan',
  明璃: 'akari',
  苍穹: 'haneul',
  星隼: 'astra',
  霜翼: 'snega',
};

const SPEAKER_META: Partial<Record<Speaker, { en: string; color: string }>> = {
  陆沉: { en: 'PILOT / LC', color: '#ede6d6' },
  夜枭: { en: 'ENEMY ACE / YX', color: '#e2483d' },
  天枢: { en: 'SKY CORE / TS', color: '#5fd8e8' },
  系统: { en: 'SYSTEM', color: '#9aa6b8' },
};

const BG_GIRL: Record<string, GirlId | null> = {
  sky: 'qingluan',
  city: 'astra',
  harbor: 'akari',
  storm: 'snega',
  carrier: null,
  black: null,
};

type After = 'hub' | 'mission' | 'ending' | 'title';

export class DialogueScreen extends BaseScreen {
  private scene!: DialogueScene;
  private index = 0;
  private typing = false;
  private finished = false;
  private auto = false;
  private after: After = 'hub';
  private missionId: MissionId = 'm1';
  private difficulty: Difficulty = 'normal';
  private lastSpeaker = '';
  private typeTimer = 0;
  private autoTimer = 0;
  private textEl!: HTMLElement;
  private speakerEl!: HTMLElement;
  private speakerEnEl!: HTMLElement;
  private portraitEl!: HTMLElement;
  private bgEl!: HTMLElement;
  private progressEl!: HTMLElement;
  private progressBar!: HTMLElement;
  private nextEl!: HTMLElement;
  private autoBtn!: HTMLButtonElement;
  private logEl: HTMLElement | null = null;
  private logOpen = false;

  constructor(app: App) {
    super(app);
  }

  enter(params?: Record<string, unknown>): void {
    const scene = getScene(params?.scene as string);
    if (!scene) {
      this.app.toast('剧情数据缺失', 'warn');
      this.app.show('hub');
      return;
    }
    this.scene = scene;
    this.after = (params?.after as After) ?? (scene.id === 'ending' ? 'ending' : 'hub');
    this.missionId = (params?.missionId as MissionId) ?? 'm1';
    this.difficulty = (params?.difficulty as Difficulty) ?? 'normal';
    this.root.classList.add('dialogue-screen');

    this.bgEl = div('dlg-bg');
    const vignette = div('dlg-vignette');
    const grid = div('dlg-grid');
    const letterTop = div('dlg-letterbox top');
    const letterBottom = div('dlg-letterbox bottom');

    const top = div('dlg-top');
    top.innerHTML = `
      <div class="dlg-chapter">
        <span class="kicker">${scene.chapter}</span>
        <strong>${scene.title}</strong>
      </div>`;
    const controls = div('dlg-controls');
    this.autoBtn = this.control('自动', () => this.toggleAuto());
    const skipBtn = this.control('跳过', () => this.finish());
    const logBtn = this.control('记录', () => this.toggleLog());
    controls.append(this.autoBtn, skipBtn, logBtn);
    top.appendChild(controls);

    const stage = div('dlg-stage');
    this.portraitEl = div('dlg-portrait');
    const content = div('dlg-content');
    const textbox = div('dlg-textbox');
    const speakerRow = div('dlg-speaker');
    this.speakerEl = div('dlg-speaker-name');
    this.speakerEnEl = div('dlg-speaker-en');
    speakerRow.append(this.speakerEl, this.speakerEnEl);
    this.textEl = div('dlg-text');
    this.nextEl = div('dlg-next');
    this.nextEl.innerHTML = `<span>继续</span><i>${icon('chevron', 13)}</i>`;
    textbox.append(speakerRow, this.textEl, this.nextEl);
    const footer = div('dlg-footer');
    this.progressEl = div('dlg-progress-text', '01 / 01');
    const track = div('dlg-progress-track');
    this.progressBar = div('dlg-progress-bar');
    track.append(this.progressBar);
    const hints = div('dlg-hints', '点击 / SPACE 继续 · A 自动 · S 跳过');
    footer.append(this.progressEl, track, hints);
    content.append(textbox, footer);
    stage.append(this.portraitEl, content);

    const side = div('dlg-side');
    side.innerHTML = `<span>${scene.chapter}</span><b>${scene.title}</b>`;

    this.root.append(this.bgEl, vignette, grid, letterTop, letterBottom, top, stage, side);
    this.applySceneBackground(scene.bg);
    this.showLine(0);

    this.root.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.closest('button') || target.closest('.dlg-log')) return;
      if (this.logOpen) {
        this.closeLog();
        return;
      }
      this.advance();
    });

    this.onWindow('keydown', (e) => {
      if (this.logOpen && e.code === 'Escape') {
        this.closeLog();
        return;
      }
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        this.advance();
      } else if (e.code === 'KeyA') {
        this.toggleAuto();
      } else if (e.code === 'KeyS') {
        this.finish();
      } else if (e.code === 'Escape' && this.finished === false) {
        // 不直接跳过，避免误触；Esc 只关闭记录面板
        this.closeLog();
      }
    });

    this.addCleanup(() => {
      window.clearInterval(this.typeTimer);
      window.clearTimeout(this.autoTimer);
    });
    this.app.audio.startMusic('menu');
  }

  private control(label: string, action: () => void): HTMLButtonElement {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'dlg-control';
    b.textContent = label;
    b.addEventListener('click', () => {
      this.app.audio.play('ui');
      action();
    });
    return b;
  }

  private applySceneBackground(bg: string): void {
    const girlId = BG_GIRL[bg] ?? null;
    this.bgEl.className = `dlg-bg bg-${bg}`;
    if (girlId) {
      this.bgEl.style.backgroundImage = `url("${assetUrl(GIRLS[girlId].art.poster)}")`;
    } else {
      this.bgEl.style.backgroundImage = 'none';
    }
  }

  private showLine(index: number): void {
    window.clearInterval(this.typeTimer);
    window.clearTimeout(this.autoTimer);
    this.index = index;
    const line: DialogueLine = this.scene.lines[index];
    if (!line) {
      this.finish();
      return;
    }
    if (line.bg) this.applySceneBackground(line.bg);
    this.renderSpeaker(line);
    this.textEl.textContent = '';
    this.typing = true;
    this.nextEl.classList.remove('is-ready');
    this.progressEl.textContent = `${String(index + 1).padStart(2, '0')} / ${String(this.scene.lines.length).padStart(2, '0')}`;
    this.progressBar.style.width = `${((index + 1) / this.scene.lines.length) * 100}%`;

    if (line.sfx === 'alarm') {
      this.root.classList.add('is-alarm');
      this.later(() => this.root.classList.remove('is-alarm'), 550);
      this.app.audio.play('alarm');
    } else if (line.sfx === 'revive') {
      this.app.audio.play('revive');
    } else {
      this.app.audio.play('radio');
    }
    if (line.shake) {
      this.root.classList.add('is-shaking');
      this.later(() => this.root.classList.remove('is-shaking'), 450);
    }

    const text = line.text;
    let cursor = 0;
    const step = () => {
      cursor = Math.min(text.length, cursor + 2);
      this.textEl.textContent = text.slice(0, cursor);
      if (cursor >= text.length) {
        this.completeTyping();
      }
    };
    if (text.length <= 2) {
      this.textEl.textContent = text;
      this.completeTyping();
    } else {
      this.typeTimer = window.setInterval(step, 24);
    }
    this.lastSpeaker = line.speaker;
  }

  private completeTyping(): void {
    window.clearInterval(this.typeTimer);
    this.textEl.textContent = this.scene.lines[this.index].text;
    this.typing = false;
    this.nextEl.classList.add('is-ready');
    if (this.auto) {
      window.clearTimeout(this.autoTimer);
      this.autoTimer = window.setTimeout(() => this.advance(), 1900);
    }
  }

  private renderSpeaker(line: DialogueLine): void {
    const girlId = line.girl ?? SPEAKER_TO_GIRL[line.speaker];
    const meta = SPEAKER_META[line.speaker];
    const speakerColor = girlId
      ? `#${GIRLS[girlId].palette.accent.toString(16).padStart(6, '0')}`
      : meta?.color ?? 'var(--bone)';
    this.speakerEl.textContent = line.speaker;
    this.speakerEl.style.color = speakerColor;
    this.root.style.setProperty('--speaker', speakerColor);
    this.speakerEnEl.textContent = girlId ? `${GIRLS[girlId].en} / LINK` : meta?.en ?? '';

    this.portraitEl.innerHTML = '';
    this.portraitEl.className = 'dlg-portrait';
    if (girlId) {
      const girl = GIRLS[girlId];
      const accent = `#${girl.palette.accent.toString(16).padStart(6, '0')}`;
      this.portraitEl.style.setProperty('--accent', accent);
      const glow = div('dlg-portrait-glow');
      const img = div('dlg-portrait-img');
      img.style.backgroundImage = `url("${assetUrl(girl.art.bust)}")`;
      const frame = div('dlg-portrait-frame');
      const tag = div('dlg-portrait-tag');
      tag.innerHTML = `<span>${girl.en}</span><b>${girl.name}</b>`;
      this.portraitEl.append(glow, img, frame, tag);
      this.portraitEl.classList.add(`mood-${line.mood ?? 'normal'}`);
    } else {
      const comms = div(`dlg-comms comms-${line.speaker === '夜枭' ? 'red' : line.speaker === '天枢' ? 'cyan' : 'plain'}`);
      const initials =
        line.speaker === '陆沉' ? 'LC' : line.speaker === '夜枭' ? 'YX' : line.speaker === '天枢' ? 'TS' : 'SYS';
      comms.innerHTML = `
        <div class="comms-screen">
          <div class="comms-initials">${initials}</div>
          <div class="comms-wave">${Array.from({ length: 14 }, (_, i) => `<i style="--d:${i * 0.08}s"></i>`).join('')}</div>
          <div class="comms-label">${meta?.en ?? 'SYSTEM'}</div>
        </div>`;
      this.portraitEl.appendChild(comms);
    }
    if (line.shake) this.app.audio.play('alarm');
  }

  private advance(): void {
    if (this.finished) return;
    if (this.typing) {
      this.completeTyping();
      return;
    }
    if (this.index >= this.scene.lines.length - 1) {
      this.finish();
      return;
    }
    this.showLine(this.index + 1);
  }

  private toggleAuto(): void {
    this.auto = !this.auto;
    this.autoBtn.classList.toggle('is-active', this.auto);
    this.app.audio.play('ui');
    if (this.auto && !this.typing) {
      window.clearTimeout(this.autoTimer);
      this.autoTimer = window.setTimeout(() => this.advance(), 900);
    }
  }

  private finish(): void {
    if (this.finished) return;
    this.finished = true;
    window.clearInterval(this.typeTimer);
    window.clearTimeout(this.autoTimer);
    this.app.save.markStory(this.scene.id);
    this.app.audio.play('confirm');
    if (this.after === 'mission') {
      this.go('mission', { missionId: this.missionId, difficulty: this.difficulty });
    } else if (this.after === 'ending') {
      this.app.save.data.progress.ending = true;
      this.app.save.save();
      this.go('ending');
    } else if (this.after === 'title') {
      this.go('title');
    } else {
      this.go('hub', { mission: this.app.save.getNextMission() });
    }
  }

  private toggleLog(): void {
    if (this.logOpen) {
      this.closeLog();
      return;
    }
    this.logOpen = true;
    this.logEl = div('dlg-log panel');
    const lines = this.scene.lines
      .slice(0, this.index + 1)
      .map((l) => `<div class="log-line"><b>${l.speaker}</b><span>${l.text}</span></div>`)
      .join('');
    this.logEl.innerHTML = `
      <header><span>对话记录 / LOG</span><button class="dlg-log-close" type="button" aria-label="关闭">${icon('close', 16)}</button></header>
      <div class="log-list">${lines}</div>`;
    this.logEl.querySelector('.dlg-log-close')?.addEventListener('click', () => this.closeLog());
    this.root.appendChild(this.logEl);
    this.app.audio.play('ui');
  }

  private closeLog(): void {
    if (!this.logOpen) return;
    this.logOpen = false;
    this.logEl?.remove();
    this.logEl = null;
  }
}
