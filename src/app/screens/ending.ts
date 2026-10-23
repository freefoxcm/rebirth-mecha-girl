import { BaseScreen } from '../base-screen';
import type { App } from '../app';
import { GIRLS, GIRL_ORDER } from '../../data/girls';
import { MISSION_ORDER } from '../../data/missions';
import { assetUrl } from '../../core/assets';
import { formatNumber } from '../../core/math';
import { button, div, icon } from '../../ui/dom';

export class EndingScreen extends BaseScreen {
  constructor(app: App) {
    super(app);
  }

  enter(): void {
    this.root.classList.add('ending-screen');
    this.app.save.data.progress.ending = true;
    this.app.save.save();
    this.app.audio.startMusic('ending');

    const bg = div('ending-bg');
    bg.style.backgroundImage = `url("${assetUrl(GIRLS.qingluan.art.poster)}")`;
    const dawn = div('ending-dawn');
    const grain = div('ending-grain');

    const top = div('ending-top');
    top.innerHTML = `
      <div class="brand-line"><span class="brand-mark"></span>REBIRTH // SKY RAMPAGE</div>
      <div class="ending-epilogue">EPILOGUE / 天穹历 073</div>`;

    const main = div('ending-main');
    const title = div('ending-title');
    title.innerHTML = `
      <span class="kicker">THE END</span>
      <h1>这次，换我带你回家</h1>
      <p>风暴散了。灵契的链条断了，但五个机娘都还在。<br>青鸾说，她只记得我的名字，和第一次说"烟花"的样子。</p>
      <div class="ending-signature">—— 陆沉 / 栖霞号</div>`;

    const credits = div('ending-credits');
    credits.innerHTML = `
      <div class="credits-head">CREDITS</div>
      <div class="credits-scroll">
        <div class="credit-group"><span>企划 / 原作</span><b>重生之我和机娘杀疯了</b></div>
        <div class="credit-group"><span>世界设定</span><b>天穹界 · 栖霞号 · 临港战区</b></div>
        <div class="credit-group"><span>五系机娘</span><b>青鸾 · 明璃 · 苍穹 · 星隼 · 霜翼</b></div>
        <div class="credit-group"><span>程序 / 战斗系统</span><b>TypeScript + Three.js</b></div>
        <div class="credit-group"><span>概念美术</span><b>reference_resources / 五系机娘概念设计</b></div>
        <div class="credit-group"><span>音乐 / 音效</span><b>WebAudio 程序生成</b></div>
        <div class="credit-group"><span>UI / 视觉设计</span><b>琥珀金军械风格 · 深墨底</b></div>
        <div class="credit-group"><span>特别鸣谢</span><b>每一个把天空打成烟花的人</b></div>
        <div class="credit-end">「下一场，还坐我的机舱吗？」<br><small>「废话。你欠我的烟花，还没放完。」</small></div>
      </div>`;

    const stats = div('ending-stats');
    const completed = this.app.save.data.progress.completed.length;
    const bestRank = this.app.save.getRank('m4') !== '-' ? this.app.save.getRank('m4') : this.app.save.getRank('m3');
    stats.innerHTML = `
      <div><span>完成作战</span><b>${completed} / ${MISSION_ORDER.length}</b></div>
      <div><span>最终评价</span><b>${bestRank}</b></div>
      <div><span>合金结余</span><b>${formatNumber(this.app.save.data.economy.alloy)}</b></div>
      <div><span>信赖最高</span><b>${Math.max(...GIRL_ORDER.map((g) => this.app.save.getTrust(g)))} / 3</b></div>`;

    const actions = div('ending-actions');
    actions.append(
      button(`${icon('play', 15)} 再次出击`, () => this.go('hub', { mission: 'm4' }), 'ghost'),
      button(`${icon('back', 15)} 回到标题`, () => this.go('title'), 'primary'),
    );

    main.append(title, credits, stats, actions);
    this.root.append(bg, dawn, grain, top, main);

    this.onWindow('keydown', (e) => {
      if (e.code === 'Escape' || e.code === 'Enter') this.go('title');
    });
  }
}
