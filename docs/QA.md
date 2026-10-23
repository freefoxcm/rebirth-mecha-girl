# 验收与测试记录

版本 0.1.0 · 环境：Windows / Node 24.18 / Chrome · 无头 SwiftShader

## 1. 自动化

| 命令 | 结果 |
|---|---|
| `npm run typecheck` | 通过（TS strict） |
| `npm test` | 16 项通过（计分 7 + 存档 9） |
| `npm run build` | 通过（JS 829 KB / CSS 90.6 KB，gzip 227/18 KB） |
| `npm run preview` + `shots` | 生产构建资源路径正常 |
| `npm run shots` | 10 个界面截图成功，无 console error |
| `node scripts/qa-flow.mjs` | 新游戏→序章→母舰→简报→前剧情→关卡→结算→后剧情→母舰，通过 |
| `node scripts/qa-boss.mjs` | Boss 1/2/3 阶段、发生器、结算、结局界面，通过 |
| `node scripts/qa-girls.mjs` | 五机娘机库 + 五种特技 + 港湾/金融区，通过 |
| `node scripts/qa-combat.mjs` | 开火 22 发 13 命中 3 击杀，结算存档（合金/勋章/解锁/信赖），通过 |
| `node scripts/qa-combat-extra.mjs` | 锁定发射导弹、解限、暂停、一次重生、二次死亡失败结算，通过 |
| `node scripts/qa-mouse.mjs` | 关卡根节点指针穿透，真实鼠标左键开火/右键锁定输入，通过 |

## 2. 关键验收点

- [x] `npm install && npm run dev` 启动，标题→结局全流程可走通
- [x] 五机娘全部可驾驶，机体外形/配色/特技不同
- [x] 四关 + Boss，三阶段护盾/发生器/核心
- [x] 主炮、锁定导弹、五种特技、解限、过热、连击、评级、勋章
- [x] 重生协议一次，第二次死亡失败；失败可重打
- [x] 结算合金/勋章/解锁/信赖/最佳纪录写入存档
- [x] 存档刷新保留；损坏自愈；设置独立；重置可用
- [x] 标题、母舰、简报、机库、档案、剧情、HUD、结算、设置、结局
- [x] 1280×720 / 1600×900 截图检查，HUD 不溢出
- [x] 生产构建与静态预览
- [x] 无 console error / pageerror（QA 脚本退出码 0）

## 3. 人工试玩清单（建议）

1. 新游戏看序章，确认打字机/跳过/记录/自动。
2. M1 普通难度：转向手感、主炮过热、右键锁定、导弹命中、E 特技、Shift 加力。
3. 故意撞楼/吃弹，确认装甲、红边、震动、低血警告；死两次确认失败结算。
4. 一次死亡确认重生 cut-in 与 50% 装甲。
5. 通关 M1 看结算，进机库买一项升级，再进 M2 看数值变化。
6. 切到困难确认敌人更硬、分数倍率。
7. 通关 M4 确认结局与制作名单，回标题继续。
8. 刷新页面确认继续进度；设置里重置存档确认回到新档。

## 4. 已知问题 / 风险

- 无头 SwiftShader 帧率很低，截图中的时间/战斗进度靠 `advance()` 推进；不代表真机帧率。
- 程序化城市与战机为风格化低模，局部贴图/几何比例仍可继续打磨（尤其金融区高层与 M2 水面反射）。
- Boss 护盾发生器复用了地面炮塔模型，悬浮在要塞周围；后续可换专用发生器模型。
- 无配音；电台字幕是文本。
- 移动端/触屏未适配。
- 高画质阴影/Bloom 在集成显卡上可能需要切中/低画质。

## 5. 截图索引

- `docs/screens/title.webp` 标题
- `docs/screens/mission.webp` 关卡 HUD
- `docs/screens/hangar.webp` 机库 3D
- `docs/screens/results.webp` 结算
- `docs/screens/boss.webp` Boss
- `docs/screens/ending.webp` 结局
- `docs/screens/hub.webp` 母舰
- `docs/screens/cutin.webp` 变形过场

完整 QA 截图在 `artifacts/qa/`（未提交，运行脚本可重建）。
