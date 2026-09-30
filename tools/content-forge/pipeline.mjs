/**
 * 寻迹 · 内容扩充全自动流水线（Pipeline Runner）
 *
 * 将「模型生成 → ID清洗 → TS合入 → 坏链审计」全链路一键串联，提供标准化的扩充执行体验。
 *
 * 用法：
 *   node tools/content-forge/pipeline.mjs --topics=tools/content-forge/topics/ming-events.json
 *   node tools/content-forge/pipeline.mjs --topics=... --concurrency=3 --limit=5
 *   node tools/content-forge/pipeline.mjs --topics=... --only="神龙政变,开元盛世"
 *   node tools/content-forge/pipeline.mjs --topics=... --skip-merge   # 仅生成与清洗，不合入
 *   node tools/content-forge/pipeline.mjs --topics=... --dry          # 预览合入效果，不写盘
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '../..')

const opts = {}
for (const a of process.argv.slice(2)) {
  if (a === '-h' || a === '--help') {
    printHelp()
    process.exit(0)
  }
  const [k, ...rest] = a.replace(/^--/, '').split('=')
  opts[k] = rest.join('=') || true
}

function printHelp() {
  console.log(`
寻迹 · 内容扩充自动化流水线 (Pipeline)

命令参数：
  --topics=<path>       选题 JSON 文件路径（必填）
  --concurrency=<N>     大模型并发生成数（默认 2）
  --limit=<N>           限制生成的条目数量
  --only=<name1,name2>  只生成指定名称的选题（逗号分隔）
  --out=<dir>           中间产物 JSON 输出目录（默认 tools/content-forge/out）
  --skip-merge          仅执行生成与清洗，暂停合入 TS 文件（便于人工校验）
  --dry                 预览模式（merge 阶段不实际修改 TS 文件）
  --help, -h            显示本帮助信息

示例：
  node tools/content-forge/pipeline.mjs --topics=tools/content-forge/topics/tang-events.json
  node tools/content-forge/pipeline.mjs --topics=tools/content-forge/topics/ming-figures.json --concurrency=3
  node tools/content-forge/pipeline.mjs --topics=tools/content-forge/topics/ming-events.json --only="空印案,郭桓案"
`)
}

if (!opts.topics) {
  console.error('✗ 缺少必填参数 --topics')
  console.error('用法示例: node tools/content-forge/pipeline.mjs --topics=tools/content-forge/topics/ming-events.json')
  console.error('运行 node tools/content-forge/pipeline.mjs --help 查看详情')
  process.exit(1)
}

const topicsPath = path.resolve(ROOT, opts.topics)
if (!fs.existsSync(topicsPath)) {
  console.error(`✗ 选题文件不存在: ${topicsPath}`)
  process.exit(1)
}

function runStep(title, scriptRelPath, args = []) {
  console.log(`\n============================================================`)
  console.log(`▶ [流水线步骤] ${title}`)
  console.log(`  执行: node ${scriptRelPath} ${args.join(' ')}`)
  console.log(`============================================================`)
  
  const targetScript = path.resolve(ROOT, scriptRelPath)
  const res = spawnSync(process.execPath, [targetScript, ...args], {
    stdio: 'inherit',
    cwd: ROOT,
    env: process.env
  })

  if (res.status !== 0) {
    console.error(`\n✗ 步骤失败: ${title} (退出码: ${res.status})`)
    process.exit(res.status ?? 1)
  }
}

console.log('╔════════════════════════════════════════════════════════════╗')
console.log('║               寻迹 · 内容扩充自动化流水线启动               ║')
console.log('╚════════════════════════════════════════════════════════════╝')
console.log(`选题文件: ${path.relative(ROOT, topicsPath)}`)

// 步骤 1：调用大模型生成中间 JSON
const forgeArgs = [`--topics=${opts.topics}`]
if (opts.concurrency) forgeArgs.push(`--concurrency=${opts.concurrency}`)
if (opts.limit) forgeArgs.push(`--limit=${opts.limit}`)
if (opts.only) forgeArgs.push(`--only=${opts.only}`)
if (opts.out) forgeArgs.push(`--out=${opts.out}`)

runStep('1/4 大模型知识抽取与词条生成 (forge)', 'tools/content-forge/forge.mjs', forgeArgs)

// 步骤 2：清洗 ID 与文件名（防拼音符号污染）
const fixArgs = []
if (opts.out) fixArgs.push(`--dir=${opts.out}`)
runStep('2/4 词条 ID 与文件名标准化清洗 (fix-ids)', 'tools/content-forge/fix-ids.mjs', fixArgs)

// 如果指定跳过合入，流程在此安全中止
if (opts['skip-merge']) {
  console.log('\n✔ 已设置 --skip-merge：生成与清洗完成，中间产物已落盘至 out/，跳过合入 TS。')
  process.exit(0)
}

// 步骤 3：数据合入到 src/data/*.ts
const mergeArgs = []
if (opts.out) mergeArgs.push(`--dir=${opts.out}`)
if (opts.dry) mergeArgs.push('--dry')
runStep('3/4 智能去重与安全合入 (merge)', 'tools/content-forge/merge.mjs', mergeArgs)

// 步骤 4：全站数据一致性与坏链审计
runStep('4/4 全站关联关系与长卷坏链审计 (audit-relations)', 'tools/audit-relations.mjs')

console.log('\n✔ 流水线执行完毕！所有数据已成功合入并通过一致性体检。')
