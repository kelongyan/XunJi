/**
 * 针路图航线数据（VoyageMap 数据源，参数化复用）
 *
 * 坐标为图面风格化坐标（x 东正 / y 南正，范围约 ±16/±7），
 * 非地理投影；major 节点用锥标 + 朱色大字标签。
 * 新增针路图 = 加一条 VoyageChart + EntryDetail 挂载点。
 */

export interface VoyagePort {
  name: string
  x: number
  y: number
  major?: boolean
}

export interface VoyageChart {
  id: string
  /** 底图题跋（左下角竖题） */
  caption: string
  /** 无障碍描述（role=img aria-label） */
  ariaLabel: string
  /** 巡游主体形制：sea=宝船（海路）/ land=行脚僧（陆路） */
  traveler: 'sea' | 'land'
  ports: VoyagePort[]
  /** 航线段（按 ports 索引） */
  routes: number[][]
  /** 巡游主路径（按 ports 索引；宝船/行脚沿此往复） */
  mainPath: number[]
}

/* 郑和七下西洋（自刘家港至忽鲁谟斯诸番；古里为西向枢纽） */
const ZHENGHE: VoyageChart = {
  id: 'zhenghe',
  caption: '自刘家港开船至忽鲁谟斯诸番 · 针路摹本',
  ariaLabel: '郑和下西洋针路图：自刘家港至忽鲁谟斯等诸番航路，金色飞线，宝船巡游',
  traveler: 'sea',
  ports: [
    { name: '刘家港', x: -16, y: 5.5, major: true },
    { name: '长乐港', x: -13.5, y: 3.8 },
    { name: '占城', x: -11, y: 2.2 },
    { name: '满剌加', x: -6, y: 0.4, major: true },
    { name: '苏门答腊', x: -4, y: -0.8 },
    { name: '锡兰山', x: -0.5, y: -1.6 },
    { name: '古里', x: 2.5, y: -2.2, major: true },
    { name: '忽鲁谟斯', x: 7.5, y: -3.6 },
    { name: '天方', x: 4.5, y: -6 },
    { name: '木骨都束', x: 8.5, y: -6.4 }
  ],
  routes: [
    [0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6],
    [6, 7], [6, 8], [6, 9]
  ],
  mainPath: [0, 1, 2, 3, 4, 5, 6]
}

/* 玄奘西行（长安→凉州→瓜州→伊吾→高昌→凌山→那烂陀；陆路行脚，凌山为葱岭险隘） */
const XUANZANG: VoyageChart = {
  id: 'xuanzang',
  caption: '贞观元年长安出发 · 西行五万里取经之路',
  ariaLabel: '玄奘西行针路图：自长安经凉州、高昌、凌山至那烂陀求法之路，金色行脚线，行脚僧巡游',
  traveler: 'land',
  ports: [
    { name: '长安', x: -15, y: 4.5, major: true },
    { name: '凉州', x: -11.5, y: 3.2 },
    { name: '瓜州', x: -8.5, y: 2.4 },
    { name: '伊吾', x: -6, y: 0.8 },
    { name: '高昌', x: -4, y: -0.6, major: true },
    { name: '凌山', x: -0.5, y: -2.2 },
    { name: '那烂陀', x: 4.5, y: -4.2, major: true }
  ],
  routes: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6]],
  mainPath: [0, 1, 2, 3, 4, 5, 6]
}

const VOYAGES: VoyageChart[] = [ZHENGHE, XUANZANG]

export function getVoyage(id: string): VoyageChart {
  return VOYAGES.find(v => v.id === id) ?? ZHENGHE
}
