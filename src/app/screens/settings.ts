import { BaseScreen } from '../base-screen';
import type { App } from '../app';
import type { QualityLevel } from '../../data/types';
import { DEFAULT_SETTINGS, GAME_VERSION } from '../../data/config';
import { GIRLS } from '../../data/girls';
import { assetUrl } from '../../core/assets';
import { button, div, icon } from '../../ui/dom';

export class SettingsScreen extends BaseScreen {
  private from: 'title' | 'hub' = 'title';

  constructor(app: App) {
    super(app);
  }

  enter(params?: Record<string, unknown>): void {
    this.root.classList.add('settings-screen');
    this.from = params?.from === 'hub' ? 'hub' : 'title';
    const girl = GIRLS[this.app.save.selectedGirl];

    const bg = div('settings-bg');
    bg.style.backgroundImage = `url("${assetUrl(girl.art.poster)}")`;
    const grid = div('settings-grid');

    const top = div('topbar');
    const back = button(`${icon('back', 14)} 返回`, () => this.go(this.from), 'bare', 'settings-back');
    const brand = div('topbar-brand');
    brand.innerHTML = `<span class="brand-mark"></span><span class="brand-name">设置</span><i>/</i><span>SYSTEM CONFIG</span>`;
    const right = div('topbar-right');
    right.innerHTML = `<span class="settings-save">自动保存</span>`;
    top.append(back, brand, right);

    const panel = div('settings-panel panel');
    const head = div('settings-head');
    head.innerHTML = `
      <span class="kicker">SYSTEM CONFIG / ${GAME_VERSION}</span>
      <h1>系统设置</h1>
      <p>调整音量、画质与辅助选项。所有改动即时生效并自动保存。</p>`;

    const sections = div('settings-sections');

    // 音频
    const audio = this.section('01', '音频', 'AUDIO');
    audio.append(
      this.rangeRow('主音量', 'master', this.app.save.settings.master, (v) => {
        this.app.save.settings.master = v;
        this.applyAudio();
      }, () => this.persist()),
      this.rangeRow('音效', 'sfx', this.app.save.settings.sfx, (v) => {
        this.app.save.settings.sfx = v;
        this.applyAudio();
      }, () => this.persist()),
      this.rangeRow('音乐', 'music', this.app.save.settings.music, (v) => {
        this.app.save.settings.music = v;
        this.applyAudio();
      }, () => this.persist()),
    );

    // 显示
    const display = this.section('02', '显示与镜头', 'DISPLAY');
    const qualityRow = div('setting-row');
    qualityRow.innerHTML = `<div class="setting-label"><b>画质预设</b><small>低配可关闭阴影与辉光</small></div>`;
    const quality = div('quality-row');
    (['low', 'medium', 'high'] as QualityLevel[]).forEach((q) => {
      const label = q === 'low' ? '低' : q === 'medium' ? '中' : '高';
      const b = button(label, () => {
        this.app.save.settings.quality = q;
        this.app.viewport?.setQuality(q);
        quality.querySelectorAll('button').forEach((node) => node.classList.toggle('is-active', node === b));
        this.persist();
        this.app.audio.play('ui');
      }, 'bare', `quality-btn ${this.app.save.settings.quality === q ? 'is-active' : ''}`);
      b.setAttribute('data-silent', 'true');
      quality.appendChild(b);
    });
    qualityRow.appendChild(quality);
    display.append(
      qualityRow,
      this.toggleRow('镜头震动', '受击与爆炸时的屏幕震动', 'shake', this.app.save.settings.shake),
      this.toggleRow('闪光效果', '关闭后减少爆炸与警报的强光闪烁', 'flash', this.app.save.settings.flash),
      this.toggleRow('无线电字幕', '显示机娘的战场台词', 'subtitles', this.app.save.settings.subtitles),
      this.toggleRow('性能信息', '显示 FPS、Draw Call 与三角形数量', 'showFps', this.app.save.settings.showFps),
    );

    // 操作
    const controls = this.section('03', '操作说明', 'CONTROLS');
    controls.innerHTML += `
      <div class="key-grid">
        <span><kbd>WASD</kbd><kbd>方向键</kbd>八方向移动</span>
        <span><kbd>Shift</kbd>低速 / 显示判定点</span>
        <span><kbd>左键</kbd><kbd>空格</kbd>主炮</span>
        <span><kbd>右键</kbd>追踪导弹</span>
        <span><kbd>E</kbd>机娘特技</span>
        <span><kbd>R</kbd>解限</span>
        <span><kbd>Esc</kbd>暂停</span>
      </div>`;

    // 存档
    const save = this.section('04', '存档', 'SAVE DATA');
    const saveRow = div('setting-row save-row');
    saveRow.innerHTML = `
      <div class="setting-label"><b>本地存档</b><small>进度保存在浏览器 localStorage，清除站点数据会丢失</small></div>`;
    const saveActions = div('save-actions');
    saveActions.append(
      button('恢复默认设置', () => {
        this.app.save.settings = { ...DEFAULT_SETTINGS };
        this.app.save.saveSettings();
        this.app.audio.setVolumes(DEFAULT_SETTINGS.master, DEFAULT_SETTINGS.sfx, DEFAULT_SETTINGS.music);
        this.app.viewport?.setQuality(DEFAULT_SETTINGS.quality);
        this.app.toast('已恢复默认设置');
        this.app.audio.play('confirm');
        this.go('settings', { from: this.from });
      }, 'ghost'),
      button('重置全部进度', () => this.confirmReset(), 'danger'),
    );
    saveRow.appendChild(saveActions);
    save.appendChild(saveRow);

    sections.append(audio, display, controls, save);
    const foot = div('settings-foot');
    foot.innerHTML = `
      <span>${icon('info', 12)} 设置与进度分开保存，重置进度不会清掉音量与画质</span>
      <span>QIXIA OS / ${GAME_VERSION}</span>`;
    panel.append(head, sections, foot);
    this.root.append(bg, grid, top, panel);

    this.onWindow('keydown', (e) => {
      if (e.code === 'Escape') this.go(this.from);
    });
    this.app.audio.startMusic('menu');
  }

  private section(num: string, title: string, en: string): HTMLDivElement {
    const section = div('settings-section');
    section.innerHTML = `<div class="settings-section-head"><span>${num}</span><b>${title}</b><small>${en}</small></div>`;
    return section;
  }

  private rangeRow(
    label: string,
    key: 'master' | 'sfx' | 'music',
    value: number,
    onInput: (v: number) => void,
    onChange: () => void,
  ): HTMLDivElement {
    const row = div('setting-row range-row');
    const labelEl = div('setting-label');
    const valueEl = div('range-value', `${Math.round(value * 100)}`);
    labelEl.innerHTML = `<b>${label}</b><small>${key.toUpperCase()}</small>`;
    const input = document.createElement('input');
    input.type = 'range';
    input.min = '0';
    input.max = '100';
    input.step = '1';
    input.value = String(Math.round(value * 100));
    input.className = 'range';
    input.addEventListener('input', () => {
      const v = Number(input.value) / 100;
      valueEl.textContent = input.value;
      onInput(v);
    });
    input.addEventListener('change', onChange);
    row.append(labelEl, input, valueEl);
    return row;
  }

  private toggleRow(label: string, desc: string, key: 'shake' | 'flash' | 'subtitles' | 'showFps', value: boolean): HTMLDivElement {
    const row = div('setting-row');
    row.innerHTML = `<div class="setting-label"><b>${label}</b><small>${desc}</small></div>`;
    const sw = document.createElement('button');
    sw.type = 'button';
    sw.className = `switch ${value ? 'is-on' : ''}`;
    sw.setAttribute('role', 'switch');
    sw.setAttribute('aria-checked', String(value));
    sw.innerHTML = '<i></i><span></span>';
    sw.addEventListener('click', () => {
      const next = !sw.classList.contains('is-on');
      sw.classList.toggle('is-on', next);
      sw.setAttribute('aria-checked', String(next));
      this.app.save.settings[key] = next;
      this.persist();
      if (key === 'showFps') {
        if (next) this.app.enableFps();
        else this.app.disableFps();
      }
      this.app.audio.play('ui');
    });
    row.appendChild(sw);
    return row;
  }

  private applyAudio(): void {
    const s = this.app.save.settings;
    this.app.audio.setVolumes(s.master, s.sfx, s.music);
  }

  private persist(): void {
    this.app.save.saveSettings();
  }

  private confirmReset(): void {
    const backdrop = div('modal-backdrop');
    const panel = div('modal modal-sm');
    panel.innerHTML = `
      <div class="modal-kicker">RESET PROGRESS</div>
      <h2>重置全部进度？</h2>
      <p>机娘解锁、关卡记录、合金、升级与剧情进度都会清空。音量、画质等设置保留。</p>`;
    const actions = div('modal-actions');
    actions.append(
      button('取消', () => backdrop.remove(), 'ghost'),
      button('确认重置', () => {
        this.app.save.resetProgress();
        this.app.audio.play('confirm');
        this.app.toast('进度已重置');
        this.go('title');
      }, 'danger'),
    );
    panel.appendChild(actions);
    backdrop.appendChild(panel);
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) backdrop.remove();
    });
    this.root.appendChild(backdrop);
  }
}
