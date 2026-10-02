import { spawnSync } from 'node:child_process'

const commands = [
  ['audit', 'tools/audit.mjs'],
  ['audit:relations', 'tools/audit-relations.mjs'],
  ['audit:data', 'tools/audit-data.mjs'],
  ['audit:assets', 'tools/image-forge/verify-assets.mjs']
]

for (const [label, script] of commands) {
  console.log(`\n=== ${label} ===`)
  const result = spawnSync(process.execPath, [script], { stdio: 'inherit' })
  if (result.status !== 0) {
    console.error(`✗ ${label} failed`)
    process.exit(result.status ?? 1)
  }
}

console.log('\n✔ all audits passed')
