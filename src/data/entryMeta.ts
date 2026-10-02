/** 词条类型展示名（检索卡 / 联想 / 详情刊头 / 星图图例共用唯一来源，消除四处漂移的三元式） */
export const ENTRY_TYPES: Record<string, { label: string; seal: string; graphLabel: string }> = {
  emperor: { label: '帝王', seal: '帝', graphLabel: '帝王篇' },
  figure: { label: '人物', seal: '人', graphLabel: '人物篇' },
  event: { label: '事件', seal: '事', graphLabel: '重大事件' },
  classic: { label: '典籍', seal: '典', graphLabel: '传世典籍' },
  system: { label: '制度', seal: '制', graphLabel: '典章制度' }
}

export function entryTypeLabel(type: string): string {
  return ENTRY_TYPES[type]?.label ?? type
}

/** 详情页刊头与星图图例用（「篇」式长名） */
export function entryTypeGraphLabel(type: string): string {
  return ENTRY_TYPES[type]?.graphLabel ?? type
}

/** 单字印章（关联推荐侧栏）；非词条类型回落「制」（原 typeSeal 行为） */
export function entryTypeSeal(type: string): string {
  return ENTRY_TYPES[type]?.seal ?? '制'
}
