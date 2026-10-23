import type { MissionId, MissionSpec } from './types';

export const MISSIONS: Record<MissionId, MissionSpec> = {
  m1: {
    id: 'm1',
    index: 1,
    chapter: '第一话',
    title: '收费站上空的烟花',
    subtitle: '西收费站 · 黄金时刻',
    district: 'toll',
    timeOfDay: 'golden',
    stage: { x: -380, startZ: 120, endZ: -400, scrollSpeed: 18 },
    spawn: { x: -380, z: 52, heading: 0 },
    zone: { x: -380, z: 40, radius: 470 },
    objectives: [
      { id: 'ground', label: '摧毁收费站防空火力', tags: ['turret', 'sam'], count: 10, optional: true },
      { id: 'drone', label: '击落侦察无人机', tags: ['drone'], count: 10 },
      { id: 'escort', label: '击落护航机', tags: ['escort'], count: 3 },
      { id: 'supply', label: '摧毁补给车队', tags: ['supply'], count: 12, optional: true },
    ],
    waves: [
      {
        at: 0.5,
        groups: [
          { type: 'turret', count: 6, tags: ['turret'], ground: true, pattern: 'line', radius: 440 },
          { type: 'sam', count: 4, tags: ['sam'], ground: true, pattern: 'scatter', radius: 300 },
          { type: 'supply', count: 12, tags: ['supply'], ground: true, pattern: 'line' },
          { type: 'drone', count: 3, tags: ['drone'], pattern: 'line', radius: 300 },
        ],
        message: '收费站防空火力已标记',
      },
      {
        at: 12,
        groups: [{ type: 'drone', count: 6, tags: ['drone'], pattern: 'ring', radius: 260 }],
        message: '无人机群接近',
        bark: '青鸾:「六架。别让它们靠近收费站。」',
      },
      {
        at: 26,
        groups: [{ type: 'drone', count: 3, tags: ['drone'], pattern: 'ring', radius: 240 }],
        message: '第二波无人机',
      },
      {
        at: 42,
        groups: [{ type: 'jet', count: 3, tags: ['escort'], pattern: 'line', radius: 420 }],
        message: '敌方护航机进入空域',
        bark: '青鸾:「护航机来了。先打领头的。」',
      },
    ],
    rewards: { alloy: 160, girls: ['akari'], weapon: 'missile' },
    storyBefore: 'm1_before',
    storyAfter: 'm1_after',
    rank: { S: 9000, A: 6000, B: 3500 },
    tips: ['WASD / 方向键移动，Shift 低速精瞄', '按住左键或空格连续射击，右键发射追踪导弹', 'E 机娘特技，R 满槽解限'],
    intel: ['竖版卷轴关卡：敌机从画面上方编队进入', '收费站地面火力属于可选扫荡，错过不会卡关', '无人机与护航机是通关必需目标'],
    threat: '低威胁',
    duration: '约 3 分钟',
  },
  m2: {
    id: 'm2',
    index: 2,
    chapter: '第二话',
    title: '港湾不眠',
    subtitle: '临港港湾 · 蓝调时刻',
    district: 'harbor',
    timeOfDay: 'blue',
    stage: { x: 650, startZ: 820, endZ: 180, scrollSpeed: 18 },
    spawn: { x: 650, z: 52, heading: 0 },
    zone: { x: 650, z: 650, radius: 520 },
    objectives: [
      { id: 'aa', label: '摧毁港区防空阵地', tags: ['aa'], count: 4, optional: true },
      { id: 'boats', label: '击沉导弹艇', tags: ['boat'], count: 2, optional: true },
      { id: 'jets', label: '击落攻击机', tags: ['jet'], count: 9 },
      { id: 'cranes', label: '摧毁集装箱吊机', tags: ['crane'], count: 4, optional: true },
    ],
    waves: [
      {
        at: 2,
        groups: [
          { type: 'turret', count: 4, tags: ['aa'], ground: true, pattern: 'scatter', radius: 330 },
          { type: 'turret', count: 4, tags: ['crane'], ground: true, pattern: 'scatter', radius: 380 },
          { type: 'boat', count: 2, tags: ['boat'], ground: true, pattern: 'line', radius: 420, hpScale: 1.5 },
          { type: 'jet', count: 2, tags: ['jet'], pattern: 'line' },
        ],
        message: '港区防空网络上线',
      },
      {
        at: 14,
        groups: [{ type: 'jet', count: 4, tags: ['jet'], pattern: 'line', radius: 460 }],
        message: '攻击机第一波',
        bark: '明璃:「海面交给我，你看住吊机上的炮。」',
      },
      {
        at: 32,
        groups: [{ type: 'jet', count: 3, tags: ['jet'], pattern: 'ring', radius: 380 }],
        message: '攻击机第二波',
      },
      {
        at: 48,
        groups: [
          { type: 'jet', count: 2, tags: ['jet'], pattern: 'line', radius: 440 },
          { type: 'gunship', count: 1, tags: ['jet'], pattern: 'line', radius: 480 },
        ],
        message: '重型护航机入场',
        bark: '苍穹:「电磁信号暴增。别被它们围住。」',
      },
    ],
    rewards: { alloy: 220, girls: ['haneul'], weapon: 'lockPlus' },
    storyBefore: 'm2_before',
    storyAfter: 'm2_after',
    rank: { S: 11000, A: 7500, B: 4500 },
    tips: ['弹幕中保持移动，判定核心只有机身中央一点', '导弹会自动追踪最近的空中目标', '地面目标随城市滚动，属于可选扫荡'],
    intel: ['港湾地面阵地与导弹艇都是可选目标', '攻击机分三波进入，最后一波带重型护航', '蓝调时段的弹幕颜色更冷，注意分辨'],
    threat: '中威胁',
    duration: '约 4 分钟',
  },
  m3: {
    id: 'm3',
    index: 3,
    chapter: '第三话',
    title: '云端之上，无人回头',
    subtitle: '金融区 · 落日',
    district: 'downtown',
    timeOfDay: 'dusk',
    stage: { x: 420, startZ: -180, endZ: -700, scrollSpeed: 18 },
    spawn: { x: 420, z: 52, heading: 0 },
    zone: { x: 420, z: -380, radius: 520 },
    objectives: [
      { id: 'aces', label: '击落敌方王牌', tags: ['ace'], count: 3 },
      { id: 'escort', label: '击落王牌僚机', tags: ['escort'], count: 8 },
      { id: 'radar', label: '摧毁雷达站', tags: ['radar'], count: 4, optional: true },
    ],
    waves: [
      {
        at: 2,
        groups: [{ type: 'turret', count: 4, tags: ['radar'], ground: true, pattern: 'scatter', radius: 360 }],
        message: '金融区雷达站已标记',
      },
      {
        at: 10,
        groups: [{ type: 'jet', count: 4, tags: ['escort'], pattern: 'line', radius: 420 }],
        message: '王牌僚机入场',
      },
      {
        at: 26,
        groups: [
          { type: 'ace', count: 1, tags: ['ace'], pattern: 'line', radius: 380, name: '断线' },
          { type: 'jet', count: 2, tags: ['escort'], pattern: 'ring', radius: 300 },
        ],
        message: '王牌「断线」出现',
        bark: '星隼:「注意高楼的阴影，她会从那里切出来。」',
      },
      {
        at: 44,
        groups: [
          { type: 'ace', count: 1, tags: ['ace'], pattern: 'line', radius: 400, name: '赤鸦' },
          { type: 'jet', count: 2, tags: ['escort'], pattern: 'line', radius: 360 },
        ],
        message: '王牌「赤鸦」出现',
        bark: '霜翼:「第二个。我来挡僚机。」',
      },
      {
        at: 64,
        groups: [
          { type: 'ace', count: 1, tags: ['ace'], pattern: 'line', radius: 460, name: '夜枭', hpScale: 1.6 },
          { type: 'jet', count: 2, tags: ['escort'], pattern: 'line', radius: 380 },
        ],
        message: '高能量反应——「夜枭」进入战场',
        bark: '夜枭:「陆沉。好久不见。你还是和上次一样慢。」',
      },
    ],
    rewards: { alloy: 300, girls: ['astra', 'snega'], weapon: 'piercer' },
    storyBefore: 'm3_before',
    storyAfter: 'm3_after',
    rank: { S: 13000, A: 9000, B: 5500 },
    tips: ['王牌会横向压枪，保持纵向错位躲她的扇形弹', 'Shift 低速时判定点更清晰，适合穿缝', 'Night Owl 残血会脱离，别追出屏幕'],
    intel: ['三名王牌与八架僚机是通关目标', '金融区雷达站属于可选扫荡', '夜枭的蚀灵信号会在残血时脱离战场'],
    threat: '高威胁',
    duration: '约 5 分钟',
  },
  m4: {
    id: 'm4',
    index: 4,
    chapter: '最终话',
    title: '天枢坠落之日',
    subtitle: '临港海湾 · 风暴前',
    district: 'bay',
    timeOfDay: 'storm',
    stage: { x: 700, startZ: 1010, endZ: 900, scrollSpeed: 20 },
    spawn: { x: 700, z: 52, heading: 0 },
    zone: { x: 700, z: 850, radius: 520 },
    objectives: [{ id: 'boss', label: '击落天枢', tags: ['boss'], count: 1 }],
    waves: [],
    boss: {
      name: '天枢',
      subtitle: '蚀灵核心 / 空中要塞',
      hp: 3400,
      generators: 4,
      phaseAt: [0.66, 0.33],
    },
    rewards: { alloy: 500 },
    storyBefore: 'm4_before',
    storyAfter: 'ending',
    rank: { S: 12000, A: 8500, B: 5500 },
    tips: ['第二阶段先打掉四台护盾发生器', '核心只在第三阶段暴露，别把导弹浪费在护盾上', 'Boss 的扇形弹从上方压下来，贴着画面下缘横向移动'],
    intel: ['天枢要塞由蚀灵核心驱动，外围有四台护盾发生器', '夜枭与核心融合后，会使用扇形弹幕与垂直光束', '这是最后一场。青鸾的灵契撑不了第二次重生'],
    threat: '灾厄',
    duration: '约 5 分钟',
  },
};

export const MISSION_ORDER: MissionId[] = ['m1', 'm2', 'm3', 'm4'];

export function getMission(id: MissionId): MissionSpec {
  return MISSIONS[id];
}

export function nextMission(id: MissionId): MissionId | null {
  const i = MISSION_ORDER.indexOf(id);
  return i >= 0 && i < MISSION_ORDER.length - 1 ? MISSION_ORDER[i + 1] : null;
}
