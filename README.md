# 重生之我和机娘杀疯了

> 上一世被队友背刺坠机而亡的我，重生到机娘主宰的天空，和五个高傲的「机娘」把敌人杀成了烟花。

一款可直接在浏览器里玩的 **3D 竖版卷轴弹幕空战小游戏**，玩法参考《雷电》：战机固定在屏幕下方八方向移动，屏幕持续向上滚动，敌机编队从上方压下来，靠走位、弹幕判断、连击和炸弹通关。你驾驶由机娘变形而成的战机，在临港市上空完成 4 场作战，靠评分、勋章和合金解锁五系机娘与武器，并走完「背刺—重生—并肩—终战」的主线。

![标题界面](docs/screens/title.webp)

## 快速开始

```bash
npm install
npm run dev
```

打开终端里显示的地址（默认 <http://127.0.0.1:5173/>），建议 Chrome / Edge，全屏体验更佳。

生产构建：

```bash
npm run build
npm run preview
```

## 操作

| 输入 | 行为 |
|---|---|
| WASD / 方向键 | 八方向移动（卷轴自动前进） |
| Shift | 低速精瞄，显示机身判定点 |
| 左键 / 空格 | 主炮连续射击（有过热） |
| 右键 | 追踪导弹（自动锁定最近空中目标） |
| E | 机娘特技（弹幕清场/爆发） |
| R | 解限（满槽后 8 秒火力全开） |
| Esc | 暂停 |
| 空格 / 回车 | 剧情推进 |

> 首次点击页面才会解锁 WebAudio；没有声音时先点一下界面。

## 内容

- **4 场竖版卷轴作战**：西收费站 → 港湾 → 金融区 → 天枢要塞。四种时段光照（黄昏、蓝调、落日、风暴），城市/港湾在正交俯视下持续向下滚动。
- **5 名机娘**：青鸾、明璃、苍穹、星隼、霜翼。各自拥有独立的机体外形、配色、数值和特技；通关解锁。
- **机娘就是战机**：人形/战机六阶段变形概念图被做成出击过场；机库里有 3D 战机转台和变形演示。
- **弹幕战斗**：主炮过热、追踪导弹、机娘特技、解限、连击、评分、S/A/B/C 评级、四类勋章、重生协议；敌机编队、地面炮塔、王牌与三阶段 Boss。
- **成长**：合金、三项升级、武器/角色解锁、信赖度、本地存档。
- **剧情**：序章 + 4 话 + 尾声，约 100 句台词；对话框、自动播放、记录、跳过。
- **界面**：标题、母舰作战地图、简报、机库、档案、剧情、关卡 HUD、结算、设置、结局制作名单。
- **程序化内容**：城市、地标、战机、敌机、Boss、特效、音乐音效全部由代码生成；仅角色立绘/概念图来自 `reference_resources`。

| 作战 | 机库 | 结算 |
|---|---|---|
| ![](docs/screens/mission.webp) | ![](docs/screens/hangar.webp) | ![](docs/screens/results.webp) |

| Boss | 结局 | 母舰 |
|---|---|---|
| ![](docs/screens/boss.webp) | ![](docs/screens/ending.webp) | ![](docs/screens/hub.webp) |

## 战机外形：按设计稿重建

五台机不再共用一套参数化换皮：每台按 `reference_resources/<id>/02_战机三视图.png` 建立独立的 `JetBlueprint`（机身站位/截面、LERX、主翼折线、鸭翼、双/单垂尾、DSI/方棱进气、单/双/矢量喷口、座舱、编号与纹样），再生成**高模展示 + 任务 LOD**。涂装和面板线用程序化 1024 贴图，编号 02/21/35/57 与云纹/星纹/霜纹进入机翼、尾翼和机身。

机库左下的 **设计对照** 按钮可在展示 / 俯视 / 侧视 / 正视之间切换，用来对照设计稿轮廓。

![五机娘俯视外形](docs/screens/jets.webp)

## 打击感升级

- **爆炸**：核心闪光、低模火球、火/烟粒子、金属碎片、火星、冲击波环、炮口闪光；空中/地面/水面三套表面，Boss 死亡多波连环爆。
- **震动**：trauma 驱动的平滑多频相机位移 + roll + 正交 zoom；小敌、炮艇、Boss、受击、特技分级触发，暂停/结算归零。
- **音效**：分层爆炸（低频下潜+噪声+裂响+碎片）、立体声像、金属/护盾命中、引擎底噪、Boss 警报；全部由 WebAudio 合成。

![爆炸与震动](docs/screens/explosion.webp)

## 技术

- Vite 8 + TypeScript 7（strict）+ Three.js 0.186
- 原生 DOM/CSS 做 HUD 与界面，Three.js 负责 3D；不引入前端框架
- 程序化城市：实例化楼体/树木/车辆、收费站、港湾吊机、金融区塔楼、单轨、广告牌
- 程序化战机：五套 `JetBlueprint` 生成机身/机翼/鸭翼/垂尾/进气/喷口/涂装；机库高模、任务 LOD；支持俯视/侧视/正视设计对照
- 表现层：分层爆炸池、碎片/火星/尾迹、trauma 相机震动、分层 WebAudio 爆炸与立体声像
- 后处理：Bloom、暗角、颗粒、速度色差、受击红边
- WebAudio 合成音效与音乐；localStorage 双存档（进度/设置分离）
- 测试：Vitest 单元测试 + Puppeteer 无头 Chrome 冒烟与截图

## 目录

```
src/
  app/         屏幕状态机、存档、各界面
  core/        循环、输入、音频、素材、存储
  data/        机娘/任务/剧情/数值/资产清单
  game/        玩家、敌人、Boss、特效、计分、任务导演
  render/      渲染器、环境、城市、战机、程序化几何
  ui/          HUD、DOM 工具
  styles/      各界面样式
public/assets/ 由概念图生成的 WebP（脚本可重建）
scripts/       素材管线、截图、QA 冒烟
tests/         计分与存档单元测试
docs/          设计文档、QA、截图
```

## 素材与版权

- 五名机娘的立绘、三视图、六阶段变形图来自用户提供的 `reference_resources` 概念设计；本项目只做裁切、WebP 转码和界面排版，不在仓库中提交原始大图/视频。
- 参考视频仅用于研究玩法、镜头与 HUD 布局，未提取任何画面素材；游戏内广告牌、品牌、任务与台词均为原创虚构内容。
- 未使用真实国旗、军队身份或现役军机标识。
- 音乐、音效由 WebAudio 实时合成；字体使用系统字体。

## 脚本

```bash
npm run prepare-art     # 从 reference_resources 重新生成 WebP 与资产清单
npm run shots           # 无头 Chrome 截取所有界面到 artifacts/screens
npm run test            # Vitest
npm run typecheck
node scripts/qa-flow.mjs      # 新游戏→序章→母舰→关卡→结算→战后
node scripts/qa-boss.mjs      # Boss 三阶段 + 结局
node scripts/qa-girls.mjs     # 五机娘特技/两张地图
node scripts/qa-jets.mjs      # 五机娘俯视外形 + draw call
node scripts/qa-combat.mjs    # 开火推进、强制通关、结算存档
node scripts/qa-combat-extra.mjs # 特技、解限、暂停、重生、失败结算
node scripts/qa-mouse.mjs     # 真实鼠标左/右键输入穿透验证
node scripts/qa-fx.mjs        # 爆炸截图 + 相机震动衰减
node scripts/qa-audio.mjs     # WebAudio 解锁/分层爆炸/引擎循环
```

调试入口：`?test=1` 会禁用 CSS 动画并暴露 `window.__REBIRTH__`（`state()`、`startMission()`、`winMission()`、`damageBoss()`、`advance(seconds, fire)` 等）。URL 参数 `?screen=title|hub|hangar|briefing|dialogue|mission|results|settings|codex|ending` 可直接进入指定界面。

## 已知限制

- 美术是风格化低模 + 概念图 UI，不追求参考视频的写实精度。
- 未做 3D 机娘人形建模；角色演出依赖立绘、cut-in 和六阶段变形图。
- 无配音、无移动端触屏、无联机/排行榜；首版为单人离线。
- 首版没有关卡内火力道具掉落；成长放在机库/结算，后续可补 Raiden 式道具。
- 目前只有 M4 是天枢 Boss 战，M1–M3 以王牌/护航编队收尾；每关独立 Boss 可作为下一轮扩展。
- 五台机是**设计图级程序化近似**，不是 CAD/照片级：轮廓、分色、鸭翼/垂尾/喷口/编号已按三视图重建，但座舱内构、铆钉密度、曲面连续性仍有提升空间。设计稿本身也有少量三视图不一致，冲突处以轮廓和游戏可读性优先。
- 爆炸、震动、音效完成首轮分层；爆炸仍是风格化低模，真机听感需要你在浏览器里试听后再调音量/密度。
- 关卡目标与数值仍在首轮平衡，建议先玩普通难度。
- 极端低配或关闭硬件加速时性能会下降；设置里可切低画质。

## 版本

`0.1.2` — 五机娘 Blueprint 外形重建、设计对照、分层爆炸、trauma 震动与分层音效；完整流程、三关 + Boss、剧情与结局、存档与养成。
