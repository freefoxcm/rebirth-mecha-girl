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
    spawn: { x: -620, z: 40, heading: -Math.PI / 2 },
    zone: { x: -380, z: 40, radius: 470 },
    objectives: [
      { id: 'ground', label: '摧毁收费站防空火力', tags: ['turret', 'sam'], count: 10 },
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
          { type: 'drone', count: 1, tags: ['drone'], pattern: 'line', radius: 300 },
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
    rank: { S: 12000, A: 8000, B: 5000 },
    tips: ['右键按住锁定地面目标，松开齐射导弹', '低空掠过楼顶，用俯冲角打掉炮塔', '连击越高，结算分数越多'],
    intel: ['敌方在西收费站部署了 10 处近程防空火力', '无人机群负责外围警戒，护航机在最后一批出现', '补给车队是可选的扫荡目标'],
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
    spawn: { x: 360, z: 700, heading: -Math.PI / 2 },
    zone: { x: 650, z: 650, radius: 520 },
    objectives: [
      { id: 'aa', label: '摧毁港区防空阵地', tags: ['aa'], count: 4 },
      { id: 'boats', label: '击沉导弹艇', tags: ['boat'], count: 2 },
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
    rank: { S: 14000, A: 9500, B: 6000 },
    tips: ['导弹艇的防空弹会追踪，保持横向机动', '吊机上的炮塔视野受限，从侧面切入', '蓝调时刻的低能见度会隐藏小型无人机'],
    intel: ['港湾有 4 处固定防空阵地与 2 艘导弹艇', '攻击机分三波进入，最后一波带重型护航', '吊机是可选目标，摧毁后港区火力会明显减弱'],
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
    spawn: { x: 140, z: -380, heading: -Math.PI / 2 },
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
    rank: { S: 15000, A: 10000, B: 6500 },
    tips: ['王牌会做高G 机动，提前把准星压在她的转弯内侧', '高楼会挡住导弹锁定，拉高或换角度', '夜枭在残血时会撤退，别追进楼群'],
    intel: ['三名王牌中，代号「夜枭」的机体带有蚀灵反应', '王牌僚机共 10 架，击落 8 架即可压制编队', '金融区雷达站是可选目标，摧毁后敌方锁定会变慢'],
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
    spawn: { x: 700, z: 1100, heading: 0 },
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
    tips: ['第二阶段先打掉四台护盾发生器', '核心只在第三阶段暴露，别把导弹浪费在护盾上', '风暴会干扰锁定，近距离反而更稳'],
    intel: ['天枢要塞由蚀灵核心驱动，外围有四台护盾发生器', '夜枭与核心融合后，会使用环形弹幕与光束扫射', '这是最后一场。青鸾的灵契撑不了第二次重生'],
    threat: '灾厄',
    duration: '约 6 分钟',
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
