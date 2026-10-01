# 寻迹 · 内容锻造炉（Content Forge）

本项目用于借助具备深度推理能力的通用大模型（默认 Atria-Dawn-Preview，兼容 OpenAI 接口），批量扩充和深化中国历史词条。

## 目录结构

- `pipeline.mjs` — 全自动串联流水线：生成 → 清洗 → 合入 → 坏链审计一键完成
- `forge.mjs` — 核心生成器：读选题清单、注入已收录 id 白名单、调用大模型、校验、落盘 JSON
- `fix-ids.mjs` — ID 清洗器：修复模型输出非法字符（如拼音撇号、大写、空格）
- `merge.mjs` — 数据合入器：将 JSON 转 TS 对象、自动备份 `.bak`、按朝代分流、自愈关联关系
- `topics/` — 选题清单目录（JSON 格式）
- `out/` — 生成中间产物目录（已在 `.gitignore` 中，合入后可定期清理）
- `.env` — API 凭据文件（从 `.env.example` 复制，不入库）

## 快速上手

### 1. 配置环境凭据
复制 `.env.example` 为 `.env`：
```bash
cp tools/content-forge/.env.example tools/content-forge/.env
```
编辑 `tools/content-forge/.env` 填入有效的 `ATRIA_KEY`。

### 2. 方式 A：全自动流水线（推荐）
```bash
# 全流程一键完成：生成 -> 清洗 -> 合入 -> 审计
node tools/content-forge/pipeline.mjs --topics=tools/content-forge/topics/ming-events.json

# 常用参数：
#   --concurrency=3       并发数（默认 2）
#   --limit=5             限制生成条目数
#   --only="空印案,郭桓案" 定点重跑特定词条
#   --skip-merge          仅生成与清洗，不合入 TS（便于人工复核）
#   --dry                 预览合入效果，不写盘
```

### 3. 方式 B：分步执行（手动控制）
```bash
# 步骤 1：生成中间 JSON
node tools/content-forge/forge.mjs --topics=tools/content-forge/topics/ming-events.json

# 步骤 2：清洗 ID
node tools/content-forge/fix-ids.mjs

# 步骤 3：合入数据文件
node tools/content-forge/merge.mjs

# 步骤 4：检查关系坏链
node tools/audit-relations.mjs
```

完整流水线规范与避坑手册请参考：`docs/内容锻造流水线规范.md`。
