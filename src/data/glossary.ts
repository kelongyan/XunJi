/**
 * 典籍夹注 · 术语表（A3）
 *
 * 站内正文（摘要/背景/编年 gist 等）中的专门术语，悬停/点按弹出
 * 古籍双行夹注卡：白话释义 + 相关词条直达。全部释义依据站内数据
 * 的通行史学表述编写，不引入站外论断。
 *
 * 约定：
 * - `entryId` 指向站内词条时，夹注卡显示「直达此卷」；
 * - `see` 为交叉引用术语（无对应词条时用）；
 * - AnnotateText 自动标注最长匹配、不嵌套（见组件注释）。
 */

export interface GlossaryTerm {
  /** 术语（正文匹配用） */
  term: string
  /** 白话释义（夹注卡正文，60 字内为宜） */
  note: string
  /** 关联词条 id（站内直达） */
  entryId?: string
  /** 交叉引用（见站内其他夹注） */
  see?: string
  /** 类别（夹注卡角标） */
  kind: 'institution' | 'office' | 'event' | 'concept' | 'text'
}

export const GLOSSARY: GlossaryTerm[] = [
  /* ── 制度 ── */
  { term: '内阁', kind: 'institution', entryId: 'neige-zhi', note: '明成祖起设立的顾问机构，大学士替皇帝起草批答。后来阁权渐重，首辅几同宰相，但名义上始终不是正式宰相。' },
  { term: '首辅', kind: 'office', note: '内阁诸大学士之首，票拟出自其手，权重一时，然名义上仍是秘书之职，非宰相。' },
  { term: '票拟', kind: 'institution', note: '内阁将处理意见写在票签上供皇帝批红，是明代中枢决策的关键环节。' },
  { term: '批红', kind: 'institution', note: '皇帝用朱笔批准票拟；后多由司礼监太监代笔，成为宦官干政的制度缺口。' },
  { term: '司礼监', kind: 'office', note: '明代宦官二十四衙门之首，掌批红与东厂，权势可压内阁。' },
  { term: '废丞相', kind: 'institution', entryId: 'hu-weiyong-an', note: '洪武十三年朱元璋借胡惟庸案废除丞相制，六部直接对皇帝负责，皇权空前集中。' },
  { term: '丞相', kind: 'office', note: '百官之长，秦汉以来协助皇帝总揽政务；明初以后此官永久消失。' },
  { term: '六部', kind: 'institution', note: '吏、户、礼、兵、刑、工六尚书分掌政务，自隋唐定型，为帝制时代中央行政主干。' },
  { term: '军机处', kind: 'institution', note: '雍正朝设立的枢密班子，军国大计皆出其手，标志着皇权专制达到顶峰。' },
  { term: '郡县制', kind: 'institution', note: '以郡县两级取代分封，官员由中央任免——中国两千年中央集权政体的地基。' },
  { term: '分封制', kind: 'institution', note: '天子分封诸侯各建邦国。西周行之，后世屡废屡兴，终为郡县所代。' },
  { term: '科举制', kind: 'institution', entryId: 'keju-zhi', note: '以考试取士的选官制度，隋唐创立，至清末废除，行约一千三百年。' },
  { term: '八股取士', kind: 'institution', entryId: 'bagu-qushi', note: '明清科举以八股文命题作答，文体僵化，士人思想为之所囿。' },
  { term: '一条鞭法', kind: 'institution', entryId: 'yitiaobian-fa', note: '张居正推行的赋役改革：赋役合并、折银征收，是中国赋税史上的大转折。' },
  { term: '考成法', kind: 'institution', note: '张居正创的考绩法：立限责事、逐级稽查，以「月有考、岁有稽」整饬吏治。' },
  { term: '两税法', kind: 'institution', note: '唐德宗时杨炎所创，按资产分夏秋两季征税，取代租庸调，开后世赋税之新轨。' },
  { term: '租庸调', kind: 'institution', note: '唐前期赋役制度：租（田租）、庸（代役绢）、调（户税），以均田制为根基。' },
  { term: '摊丁入亩', kind: 'institution', note: '清雍正朝将丁银并入田赋，人头税就此并入财产税，人口随之大增。' },
  { term: '行省制度', kind: 'institution', note: '元朝创置的地方大区制度，「省」之名沿用至今。' },
  { term: '土司制度', kind: 'institution', note: '西南边疆以土酋世袭治理之制，明清相继改土归流，渐入内地化。' },
  { term: '改土归流', kind: 'institution', note: '废除土司世袭、改设流官，明清两代推进的西南边疆整合大政。' },
  { term: '羁縻之策', kind: 'concept', note: '对边疆部族松散约束、因其俗而治之的传统方略，与内地郡县并行。' },
  { term: '朝贡贸易', kind: 'concept', note: '以朝贡名义进行的官方贸易，厚往薄来，政治意义大于经济利益。' },
  { term: '开中法', kind: 'institution', note: '商人运粮至边镇换取盐引的制度，明初以此充实边防军需。' },
  { term: '黄册', kind: 'institution', note: '明代全国户口档案，因封面黄纸得名，与鱼鳞图册共为赋役之依据。' },
  { term: '鱼鳞图册', kind: 'institution', note: '明代全国土地登记册，绘田形如鱼鳞，是清丈田亩、征收田赋的底账。' },
  { term: '重文轻武', kind: 'concept', note: '宋代立国方略：以文臣驭武将、枢密掌兵符，防唐末藩镇之祸重演。' },
  { term: '更戍法', kind: 'institution', note: '宋初军队轮番换防、将兵分离之制，防将拥兵自重，代价是兵不识将。' },
  { term: '杯酒释兵权', kind: 'event', entryId: 'beijiu-shibingquan', note: '宋太祖宴请禁军宿将，劝其交出兵权、厚禄养老，兵变起家的皇帝和平解除了心腹之患。' },
  { term: '察举制', kind: 'institution', note: '汉代由地方举荐人才的选官制度，举孝廉、贤良方正，是科举的前身之一。' },
  { term: '九品中正制', kind: 'institution', note: '魏晋南北朝选官制，中正官品评人物定其等第，后期为门阀所把持。' },
  { term: '门阀政治', kind: 'concept', note: '世家大族垄断仕途与清议的魏晋南北朝政治形态，科举兴起后逐渐终结。' },

  /* ── 职官 ── */
  { term: '锦衣卫', kind: 'office', entryId: 'jinyiwei', note: '明代皇帝亲军侍卫机构，兼掌缉捕刑狱，诏狱令百官胆寒，是皇权的耳目爪牙。' },
  { term: '东厂', kind: 'office', note: '明成祖设的宦官特务机关，缉访谋逆妖言，与锦衣卫合称「厂卫」。' },
  { term: '厂卫', kind: 'concept', note: '东厂与锦衣卫的合称，明代特务政治的代名词。' },
  { term: '枢密院', kind: 'institution', note: '唐末五代至宋元的最高军政机构，宋代以文臣掌枢密，分宰相之兵权。' },
  { term: '三司', kind: 'institution', note: '明代省级布政、按察、都指挥三使分掌民政、刑名、军务，互不统属。' },
  { term: '巡抚', kind: 'office', note: '明代临时差遣巡行安抚的中央大员，后渐成省级常设长官，清代定型。' },
  { term: '翰林院', kind: 'institution', note: '储才清要之地，明清内阁大学士几乎皆出自翰林。' },
  { term: '节度使', kind: 'office', note: '唐中期总揽一方军政财权之官，尾大不掉，酿成安史之乱与藩镇割据。' },
  { term: '太尉', kind: 'office', note: '秦汉三公之一，掌武事；后世渐为虚衔或改置。' },
  { term: '尚书', kind: 'office', note: '六部长官，秦汉本为少府小吏，后成政府首脑级官职。' },
  { term: '宦官', kind: 'concept', note: '宫廷内侍之人。汉、唐、明三代皆有宦官干政之祸，形态各异。' },

  /* ── 事件与军政概念 ── */
  { term: '靖难之役', kind: 'event', entryId: 'jingnan-zhiyi', note: '建文帝削藩，燕王朱棣以「清君侧」起兵，四年夺位，是为明成祖。' },
  { term: '土木堡之变', kind: 'event', entryId: 'tumu-zhi-bian', note: '正统十四年英宗亲征瓦剌被俘，明军精锐尽丧，北京保卫战由此而起。' },
  { term: '安史之乱', kind: 'event', entryId: 'anshi-zhiluan', note: '755 年安禄山、史思明起兵叛唐，八年战乱是唐由盛转衰、藩镇割据的转折点。' },
  { term: '靖康之变', kind: 'event', entryId: 'jingkang-zhibian', note: '1127 年金军攻破汴京，掳徽钦二帝北去，北宋就此覆亡。' },
  { term: '玄武门之变', kind: 'event', entryId: 'xuanwumen-zhibian', note: '626 年李世民伏兵玄武门杀兄弟、逼父让位，随即开启贞观之治。' },
  { term: '藩镇割据', kind: 'concept', note: '唐中期以后节度使拥兵自重的政治局面，延续至唐亡，教训为宋所深戒。' },
  { term: '和亲', kind: 'concept', note: '以宗室女出嫁边疆政权换取和平的传统邦交手段，汉唐皆行之。' },
  { term: '漕运', kind: 'concept', note: '把江南赋粮经水路运抵京师的命脉工程，元代起以大运河为干道。' },
  { term: '海禁', kind: 'concept', note: '明清禁止民间出海贸易的法令，与朝贡体制互为表里，隆庆年间一度弛禁。' },
  { term: '隆庆开关', kind: 'event', note: '1567 年明穆宗解除海禁、开放月港，白银自此大量流入中国。' },
  { term: '屯田', kind: 'institution', note: '军队或移民垦荒种田以自给军需的制度，汉唐明皆大规模推行。' },
  { term: '八旗制度', kind: 'institution', entryId: 'nuerhaci', note: '努尔哈赤创的兵民合一社会组织，出则为兵、入则为民，是清朝立国之本。' },
  { term: '南书房', kind: 'institution', note: '康熙朝设于乾清宫西侧的机要班子，翰林入值草诏，分割议政王大臣之权。' },

  /* ── 思想与文化 ── */
  { term: '理学', kind: 'concept', entryId: 'chengzhu-lixue', note: '两宋兴起的儒家新学统，以「天理」为核心，程朱为代表，元明清为官学。' },
  { term: '心学', kind: 'concept', note: '南宋陆九渊开端、明代王阳明集大成的儒学流派，主「心即理」「致良知」。' },
  { term: '致良知', kind: 'concept', note: '王阳明学说宗旨：良知人人本有，学问功夫只在扫除私欲遮蔽、依良知而行。' },
  { term: '知行合一', kind: 'concept', note: '王阳明论学要义：知而不行只是未知，真知必见于行。' },
  { term: '无为而治', kind: 'concept', entryId: 'wenjing-zhizhi', note: '黄老政治的核心主张：不扰民、省苛政，以最小政府成本换取社会自我恢复。' },
  { term: '黄老之学', kind: 'concept', note: '汉初盛行的黄帝、老子之学，主清静无为，成就文景之治。' },
  { term: '罢黜百家，独尊儒术', kind: 'event', entryId: 'bachu-baijia-duzun-rushu', note: '汉武帝采纳董仲舒之议，尊儒学为官学正统，塑造此后两千年意识形态格局。' },
  { term: '古文运动', kind: 'event', entryId: 'han-yu', note: '唐韩愈、柳宗元与宋欧阳修相继倡导的文体革新，以先秦两汉古文反对骈俪浮风。' },
  { term: '科举必由学校', kind: 'concept', note: '明清入学（府州县学）方能应试的规制，官学与科举就此打通。' },
  { term: '文字狱', kind: 'concept', note: '因文字著述获罪的政治案件，康雍乾三朝最烈，士人思想为之钳束。' },
  { term: '士大夫政治', kind: 'concept', note: '科举官僚阶层兼具政事与学术、以天下自任的政治文化形态，宋代最为典型。' },
  { term: '史臣曰', kind: 'concept', note: '正史论赞的起笔套语，史家于篇末总评得失——本站朱批栏即仿此体。' },
  { term: '年号', kind: 'concept', note: '皇帝纪名之号，汉武帝首创；明清一帝一元号，故常以年号称皇帝。' },
  { term: '庙号', kind: 'concept', note: '皇帝死后在太庙立室奉祀的名号，如太祖、太宗、成祖。' },
  { term: '谥号', kind: 'concept', note: '对去世帝后大臣的盖棺定评，美谥贬谥皆有褒贬笔意。' },

  /* ── 科技与典籍 ── */
  { term: '活字印刷术', kind: 'text', entryId: 'huozhi-yinshua', note: '北宋毕昇以胶泥刻字烧制排版印刷，比古腾堡金属活字早四百年。' },
  { term: '雕版印刷', kind: 'text', note: '整版刻字刷印之术，唐五代成熟，宋刻本为巅峰，活字即由其演进。' },
  { term: '指南针', kind: 'concept', note: '四大发明之一，北宋已用于航海，是远洋时代的钥匙。' },
  { term: '火药', kind: 'concept', note: '唐末用于军事，宋金元火器渐繁，改写了战争形态与世界史。' },
  { term: '浑天仪', kind: 'text', note: '演示天象的仪器，张衡始制，历代重制精研，明清由西学参酌改进。' },
  { term: '《梦溪笔谈》', kind: 'text', entryId: 'mengxi-bitan', note: '沈括笔记，纵横百科，活字印刷最早可靠记载即出于此。' },
  { term: '《天工开物》', kind: 'text', entryId: 'tiangong-kaiwu', note: '明宋应星著，举凡农工百艺皆绘图详说，是中国技术史的百科图录。' },
  { term: '《本草纲目》', kind: 'text', entryId: 'bencao-gangmu', note: '李时珍历时二十七年编成的药物学巨著，达尔文称之为中国古代百科全书。' },
  { term: '《农政全书》', kind: 'text', note: '徐光启集古今农学大成的巨帙，兼收西学水利之法。' },
  { term: '《资治通鉴》', kind: 'text', entryId: 'zizhi-tongjian', note: '司马光主编的编年通史，上起战国下迄五代，「鉴于往事，有资于治道」。' },
  { term: '《永乐大典》', kind: 'text', entryId: 'yongle-dadian', note: '明永乐朝编纂的类书之冠，辑书七八千种，今存残卷不及原书百分之一。' },
  { term: '《大唐西域记》', kind: 'text', entryId: 'xuanzang-xixing-qufa', note: '玄奘口述西行见闻，为中亚南亚史地的第一手记载，弥足珍贵。' },
  { term: '类书', kind: 'concept', note: '辑录群书原文、按类编排的工具书，古人的「数据库」。' }
]
