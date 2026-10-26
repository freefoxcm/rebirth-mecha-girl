# 验收与测试记录

版本 0.2.0 · 环境：Windows / Node 24.18 / Chrome · 无头 SwiftShader · Blender 5.2.3 LTS

## 1. 自动化

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 通过（TS strict） |
| `npm test` | 16 项通过（计分 7 + 存档 9） |
| `npm run build` | 通过（JS 约 936 KB / CSS 93 KB，gzip 约 258/18 KB） |
| `npm run art:jets` | 五台 `.blend` + `showcase/game` GLB + `src/data/jet-models.json` 重建成功 |
| `npm run validate:jets` | 五台 showcase 10.2–11.9 万三角面、game 6.8–10.1k；GLB 结构/朝向/体积预算通过 |
| `node scripts/qa-jet-model.mjs` | 五台机库 showcase 异步加载、任务 game LOD、无 console error，通过 |
| `node scripts/qa-jets.mjs` | 五机娘俯视外形截图；draw calls 32–39 / 三角形 10.1–11.8 万（展示级 GLB），通过 |
| `node scripts/qa-fx.mjs` | 分层爆炸截图；trauma 0.18 → 2 秒后 0，通过 |
| `node scripts/qa-audio.mjs` | 真实手势解锁 AudioContext；分层爆炸/命中/引擎循环无异常，通过 |
| `node scripts/qa-stage-bosses.mjs` | M1 铁颚 / M2 潮汐 / M3 烛龙 / M4 天枢全部刷新；M1–M3 阶段 2→3 切换，通过 |
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
- [x] 五台机以 Blender 源文件按三视图重建；机库 showcase GLB 异步加载、任务 game LOD、程序化回退可用
- [x] 机库可切换展示/俯视/侧视/正视；`?jets=procedural` 可强制回退
- [x] 分层爆炸、碎片/火星/炮口、trauma 相机震动、分层声像爆炸/引擎底噪
- [x] 四关 + 四个关底 Boss：铁颚/潮汐/烛龙/天枢；M4 三阶段护盾/发生器/核心
- [x] 场景细节：斑马线、屋顶停机坪/天线/水箱/光伏/冠部、港湾仓库与码头灯、金融区连廊/站台/花坛、收费站信号灯/护栏
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
- M1–M3 的关底 Boss 已接入，但机制仍共用部分骨架，专属弹幕/阶段演出可以继续深化。
- 还没有关卡内火力/炸弹道具掉落，成长主要在机库/结算。
- 五台机是 Blender 设计图级重建：折线机翼、鸭翼/尾翼、进气、喷口、编号与配色已按三视图重建，但侧影厚度、曲面连续性和座舱内构仍不是 CAD 级。
- 实时 GLB 暂不含面板缝几何（细管在浏览器里会呈现虚线瑕疵）；密集面板线只保留在 `.blend`/Cycles 渲染中，后续可用烘焙贴图或法线补回。
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
- `docs/screens/jets/jets-lineup.webp` 五机娘俯视外形对照（Blender 模型）
- `docs/screens/jets/<id>-concept-compare.webp` 各机概念图 vs 模型俯视对照
- `docs/screens/explosion.webp` 分层爆炸
- `docs/screens/bosses.webp` 四关关底 Boss
- `docs/screens/scenes.webp` 场景细节（收费站/港湾/金融区）

完整 QA 截图在 `artifacts/qa/`（未提交，运行脚本可重建）；完整界面截图在 `artifacts/screens/`。
