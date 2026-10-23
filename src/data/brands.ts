export interface BillboardBrand {
  title: string;
  sub: string;
  bg: string;
  fg: string;
}

/** 原创虚构品牌，避免照搬参考视频里的广告牌。 */
export const BRANDS: BillboardBrand[] = [
  { title: '玉醴可乐', sub: '冰镇 · 一瓶见底', bg: '#b7372f', fg: '#f7e9d2' },
  { title: '海港银行', sub: 'HARBOR BANK', bg: '#1c3f6e', fg: '#d9e6f5' },
  { title: '青囊药房', sub: 'PHARMACY +', bg: '#1f6b4f', fg: '#e8f3e2' },
  { title: '天枢重工', sub: 'TIANSHU DYNAMICS', bg: '#2c3038', fg: '#f0b43a' },
  { title: '栖霞航空', sub: 'QIXIA AEROSPACE', bg: '#d8d2c4', fg: '#1b1f24' },
  { title: '白鹭咖啡', sub: 'CAFE · 24H', bg: '#7a2c2a', fg: '#f3dfc4' },
];

export const ROAD_NAMES = ['临港大道', '西环高架', '栖霞路', '潮汐街', '青鸾路', '港湾三号'];
