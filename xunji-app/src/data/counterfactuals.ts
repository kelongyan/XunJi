/**
 * 时空推演 · 反事实历史卷宗（预置静态数据，P2 可切换为 LLM 活生成）
 * 注意：全部内容为「推演 · 非史实」，界面必须带朱印水印标注。
 */
export interface CfNode {
  id: string
  title: string
  narrative: string
  children?: CfNode[]
}

export interface CounterfactualTree {
  id: string
  dynasty: string
  seedEntryId: string
  seedEventTitle: string
  /** 推演问题 */
  question: string
  /** 史实主干（实线） */
  reality: string
  root: CfNode
}

export const counterfactualTrees: CounterfactualTree[] = [
  {
    id: 'cf-tumu',
    dynasty: 'ming',
    seedEntryId: 'tumu-zhi-bian',
    seedEventTitle: '土木堡之变',
    question: '若土木堡明军无此一败，明朝的历史会被改写成什么样子？',
    reality: '史实：正统十四年（1449）英宗亲征土木堡被瓦剌俘获，于谦拥立景泰帝力守北京；八年后夺门之变英宗复辟，于谦蒙冤而死。',
    root: {
      id: 'cf-tumu-0',
      title: '土木堡无败 · 京营精锐尚存',
      narrative: '五十万大军全身而退，王振虽骄而未酿祸，英宗挟大胜之威回京。京营三大营精锐未丧，于谦此生或仍是兵部侍郎，永远等不到北京保卫战那个属于他的夜晚。',
      children: [
        {
          id: 'cf-tumu-a1',
          title: '宦官政治提前坐大',
          narrative: '王振挟亲征之功回朝，司礼监批红之权更无制衡——没有土木堡的惨痛教训，明代宦官专权可能提前百年制度化。唐末宦官废立天子的剧本，或在中原重演。',
          children: [
            {
              id: 'cf-tumu-a1x',
              title: '「以内制外」走向失控',
              narrative: '英宗之后的新君若再幼冲，批红权与东厂特务结合，司礼监或成事实上的内廷政府。明朝可能没有张居正的舞台——因为权力中心已不在内阁，而在乾清宫的帷幕之后。'
            }
          ]
        },
        {
          id: 'cf-tumu-a2',
          title: '九边不设，边防不内缩',
          narrative: '京营未损，明廷不必转入战略防御，大规模重修长城与九边设镇的国防转向或不会发生。省下的军费若投入海贸与开边，明朝的对外姿态可能从「守成」转向「进取」——历史在此分岔。',
          children: [
            {
              id: 'cf-tumu-a2x',
              title: '一种更外向的明朝？',
              narrative: '没有土木堡的心理阴影，下西洋的反对声浪或不再一面倒；白银与海贸若提前半个世纪成为国策，郑和的航线也许不至于断在宣德八年。当然，这只是推演——财政逻辑是否支持，另当别论。'
            }
          ]
        }
      ]
    }
  },
  {
    id: 'cf-zhenghe',
    dynasty: 'ming',
    seedEntryId: 'zhenghe-xiaxiyang',
    seedEventTitle: '郑和下西洋',
    question: '若宣德八年之后宝船继续远航，大航海时代的中国会是什么模样？',
    reality: '史实：郑和七下西洋（1405—1433）后，明廷以靡费与海疆不靖为由罢西洋宝船，海图档案渐散，海禁日严，中国与如火如荼的欧洲大航海时代擦肩而过。',
    root: {
      id: 'cf-zhenghe-0',
      title: '宣德之后宝船不辍',
      narrative: '假设正统朝顶住「靡费」之议，下西洋从政治工程转为常设制度：市舶收入养船队，船队护商路。明朝将在马六甲、古里保持常在的海军存在——比葡萄牙人东来早半个多世纪。',
      children: [
        {
          id: 'cf-zhenghe-b1',
          title: '白银与贸易提前改写财政',
          narrative: '若朝贡贸易让位于可持续的市舶抽分，宋元以来「以钱为难」的财政窘境或提前缓解；一条鞭法的白银化可能在成化、弘治年间就自然发生——张居正的改革清单，会短掉最重要的一项。'
        },
        {
          id: 'cf-zhenghe-b2',
          title: '海权与倭寇问题的另一种解',
          narrative: '常在的海上力量若与开海互市并行，嘉靖年间的「倭寇」——那群被海禁逼成海盗的沿海商人——可能根本不会成形。东南沿海的百年动荡，或化为一场由官方护航的民间大航海。'
        }
      ]
    }
  },
  {
    id: 'cf-anshi',
    dynasty: 'tang',
    seedEntryId: 'anshi-zhiluan',
    seedEventTitle: '安史之乱',
    question: '若开元末年彻底改革兵制，安史之乱是否可以避免？',
    reality: '史实：府兵制崩坏后募兵制坐大，天宝年间十节度拥兵四十九万而中央不过十二万；755 年安禄山范阳起兵，八年战火使唐朝由盛转衰。',
    root: {
      id: 'cf-anshi-0',
      title: '开元末重建中央武力',
      narrative: '假设张说之后玄宗持续推进彍骑与團练，把边镇兵额压缩到与中央大体均衡——安禄山即使有异心，也凑不齐十九万边军。渔阳鼙鼓可能永远不会动地而来。',
      children: [
        {
          id: 'cf-anshi-c1',
          title: '外患因此提前上门',
          narrative: '边军被削，吐蕃与契丹的压力立时吃紧：天宝年间对吐蕃的石堡城之战本已惨胜，若再裁边兵，陇右或先于范阳告急。中央强则四夷动——盛唐的武功本是靠节度使体系赊来的。'
        },
        {
          id: 'cf-anshi-c2',
          title: '无藩镇，也未必有中兴',
          narrative: '若安史不乱，河朔三镇不会出现，唐廷或可长久集权。但均田制与租庸调的崩坏是土地兼并的结果，与安禄山无关——财政危机只会换个方式爆发。中晚唐「江南财赋+两税法」的转型，也许会更早、更剧烈地上演。'
        }
      ]
    }
  }
]
