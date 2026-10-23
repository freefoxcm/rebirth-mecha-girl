# 验收与测试记录

版本 0.1.2 · 环境：Windows / Node 24.18 / Chrome · 无头 SwiftShader

## 1. 自动化

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 通过（TS strict） |
| `npm test` | 16 项通过（计分 7 + 存档 9） |
| `npm run build` | 通过（JS 约 845 KB / CSS 93 KB，gzip 约 232/18 KB） |
| `node scripts/qa-jets.mjs` | 五机娘俯视外形截图；draw calls 71–98 / 三角形 2.8–3.8k（高模展示），通过 |
| `node scripts/qa-fx.mjs` | 分层爆炸截图；trauma 0.18 → 2 秒后 0，通过 |
| `node scripts/qa-audio.mjs` | 真实手势解锁 AudioContext；分层爆炸/命中/引擎循环无异常，通过 |
| `npm run shots` | 10 个界面截图成功，无 console error |
| `node scripts/qa-flow.mjs` | 新游戏→序章→母舰→简报→前剧情→竖版关卡→结算→后剧情→母舰，通过 |
| `node scripts/qa-boss.mjs` | Boss 1/2/3 阶段、发生器、结算、结局界面，通过 |
| `node scripts/qa-girls.mjs` | 五机娘机库 + 五种特技 + 港湾/金融区，通过 |
| `node scripts/qa-combat.mjs` | 竖版弹幕命中：约 4 秒 44 发 / 23 命中 / 5 杀；结算写档通过 |
| `node scripts/qa-combat-extra.mjs` | 特技、解限、暂停、一次重生、二次死亡失败结算，通过 |
| `node scripts/qa-mouse.mjs` | 关卡根节点指针穿透，真实鼠标左键开火/右键导弹；暂停恢复，通过 |

## 2. 关键验收点

- [x] `npm install && npm run dev` 启动，标题→结局全流程可走通
- [x] 竖版卷轴：正交俯视、城市/水面持续滚动、玩家固定在下方
- [x] 八方向移动、Shift 低速判定点、左键/空格主炮、右键追踪导弹
- [x] 敌机从上方编队进入；空中单位持续留在场内；地面单位随城市滚动
- [x] 五机娘全部可驾驶，机体外形/配色/特技不同
- [x] 五台机按三视图建立独立 Blueprint；机库可切换展示/俯视/侧视/正视
- [x] 分层爆炸、碎片/火星/炮口、trauma 相机震动、分层声像爆炸/引擎底噪
- [x] 四关 + M4 三阶段护盾/发生器/核心 Boss
- [x] 主炮过热、五种特技、解限、连击、评级、勋章
- [x] 重生协议一次，第二次死亡失败；失败可重打
- [x] 结算合金/勋章/解锁/信赖/最佳纪录写入存档
- [x] 存档刷新保留；损坏自愈；设置独立；重置可用
- [x] 标题、母舰、简报、机库、档案、剧情、HUD、结算、设置、结局
- [x] 目标栏移至左侧，画面中央留给敌机与 Boss
- [x] 生产构建与静态预览

## 3. 人工试玩清单（建议）

1. 新游戏看序章，确认打字机/跳过/记录/自动。
2. M1 普通难度：WASD 八方向移动、Shift 低速、左键/空格连射、右键导弹、E 特技、R 解限。
3. 故意吃弹/撞机，确认装甲、红边、低血警告；死两次确认失败结算。
4. 一次死亡确认重生 cut-in 与 50% 装甲。
5. 观察卷轴：收费站、港湾、金融区、天枢要塞的背景滚动与时段光照。
6. 通关 M1 看结算，进机库买一项升级，再进 M2 看数值变化。
7. 切到困难确认敌人更硬、分数倍率。
8. 通关 M4 确认三阶段 Boss、结局与制作名单，回标题继续。
9. 刷新页面确认继续进度；设置里重置存档确认回到新档。

## 4. 已知问题 / 风险

- 无头 SwiftShader 帧率很低，截图中的时间/战斗进度靠 `advance()` 推进；不代表真机帧率。
- M1–M3 目前以王牌/护航编队收尾，只有 M4 是天枢 Boss 战；每关独立 Boss 是下一轮。
- 还没有关卡内火力/炸弹道具掉落，成长主要在机库/结算。
- 五台机是设计图级程序化近似：轮廓、分色、鸭翼/垂尾/喷口/编号已重建，但曲面连续性和座舱内构仍不是 CAD 级；高模当前约 3–4k 三角形，靠涂装/面板线补细节。
- 爆炸是风格化低模火球 + 粒子/碎片，不是影视级体积爆炸；静止截图无法完整表现震动和音效，需真机试玩。
- 无头环境只能验证 WebAudio 运行无异常，不能判断听感/音量平衡。
- 程序化城市与战机为风格化低模；金融区高层、港湾水面细节仍可继续打磨。
- Boss 护盾发生器复用地面炮塔模型，悬浮在要塞周围；后续可换专用发生器模型。
- 无配音；无线电字幕是文本；移动端/触屏未适配。
- 高画质阴影/Bloom 在集成显卡上可能需要切中/低画质。

## 5. 截图索引

- `docs/screens/title.webp` 标题
- `docs/screens/mission.webp` 竖版关卡 HUD / 弹幕
- `docs/screens/hangar.webp` 机库 3D
- `docs/screens/results.webp` 结算
- `docs/screens/boss.webp` 天枢 Boss
- `docs/screens/ending.webp` 结局
- `docs/screens/hub.webp` 母舰
- `docs/screens/cutin.webp` 变形过场
- `docs/screens/jets.webp` 五机娘俯视外形对照
- `docs/screens/explosion.webp` 分层爆炸

完整 QA 截图在 `artifacts/qa/`（未提交，运行脚本可重建）；完整界面截图在 `artifacts/screens/`。
