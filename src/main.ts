import './styles/main.css';
import './styles/hub.css';
import './styles/briefing.css';
import './styles/dialogue.css';
import './styles/hangar.css';
import './styles/settings.css';
import './styles/results.css';
import './styles/hud.css';
import './styles/mission.css';
import './styles/shmup.css';
import './styles/codex.css';
import './styles/ending.css';
import { App } from './app/app';
import { TitleScreen } from './app/screens/title';
import { HubScreen } from './app/screens/hub';
import { BriefingScreen } from './app/screens/briefing';
import { DialogueScreen } from './app/screens/dialogue';
import { HangarScreen } from './app/screens/hangar';
import { SettingsScreen } from './app/screens/settings';
import { ResultsScreen } from './app/screens/results';
import { ShmupMissionScreen } from './app/screens/mission-shmup';
import { CodexScreen } from './app/screens/codex';
import { EndingScreen } from './app/screens/ending';

const app = new App();
app.register('title', (a) => new TitleScreen(a));
app.register('hub', (a) => new HubScreen(a));
app.register('briefing', (a) => new BriefingScreen(a));
app.register('dialogue', (a) => new DialogueScreen(a));
app.register('hangar', (a) => new HangarScreen(a));
app.register('settings', (a) => new SettingsScreen(a));
app.register('results', (a) => new ResultsScreen(a));
app.register('mission', (a) => new ShmupMissionScreen(a));
app.register('codex', (a) => new CodexScreen(a));
app.register('ending', (a) => new EndingScreen(a));

void app.boot().catch((err: unknown) => {
  console.error('[boot] 启动失败', err);
  const boot = document.getElementById('boot');
  if (boot) {
    boot.innerHTML = `<div class="boot-inner"><div class="boot-kicker">BOOT FAILURE</div><h1>灵契同步失败</h1><p style="max-width:520px;margin:24px auto;color:rgba(237,230,214,.7);line-height:1.8">请打开控制台查看错误，或刷新页面重试。</p></div>`;
  }
});
