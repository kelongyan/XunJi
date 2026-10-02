/**
 * 3D/2D 场景共享色值单一来源。
 *
 * 只收口「跨场景复用」的色值——各场景独有的氛围色（长河水色、鎏金飞线、
 * 卷轴纸面、远山等）刻意留在组件内：它们不是重复实现，是逐场景调准的
 * 视觉参数，强行统一反而破坏观感（2026-10-03 色值普查结论）。
 *
 * 同步纪律：
 * - 朝代 accent 日/夜值唯一来源在 dynastyThemes.ts（accentNight 已与
 *   style.css `html.dark[data-dynasty]` token 对齐，2026-10-03 修复五朝漂移）；
 * - 本文件改动需兼顾 style.css 对应 token（夜读纸底 = --paper #1A1611）。
 */

/** 深墨（线条/描边，日读）——原 InkRiver/RelicViewer/StarGraph/Graph2D 各自硬编码 */
export const SCENE_INK_DARK = '#2B2620'
/** 焦墨（比深墨浅一档） */
export const SCENE_INK = '#3D372F'
/** 灰褐（辅助标注/朝代锚点） */
export const SCENE_MUTED = '#8C8378'
/** 夜读纸底（RULE 铁律：深褐非纯黑，与 style.css --paper 同源） */
export const SCENE_PAPER_NIGHT = '#1A1611'
/** 星图日读纸底（StarGraph 与 Graph2D 降级画布共用） */
export const SCENE_PAPER_DAY = '#F4EBDC'
/** 星图日读纸底浅一档（同上，两渲染层共用） */
export const SCENE_PAPER_SOFT = '#EFE9DC'
