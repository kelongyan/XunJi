#!/usr/bin/env python3
"""寻迹 · P0 批次温控批量生图调度器

针对生图上游限流风险，加入任务间休眠等待（delay）、断点续跑检测、失败自动退避重试。
"""

import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parent.parent.parent
TASKS_FILE = ROOT / "tools" / "image-forge" / "p0-tasks.json"
IMAGE_GEN_SCRIPT = Path(
    "C:/Users/Administrator/.workbuddy/skills/imagegen/scripts/image_gen.py"
)
PROVIDERS_TOML = Path(
    "C:/Users/Administrator/AppData/Roaming/imagegen/workbuddy/providers.toml"
)
PYTHON_EXE = Path("C:/Users/Administrator/AppData/Local/Programs/Python/Python312/python.exe")


def main():
    parser = argparse.ArgumentParser(description="P0 温控批量生图调度器")
    parser.add_argument(
        "--delay",
        type=float,
        default=4.0,
        help="单个生图成功后的冷却等待秒数（默认 4 秒，防止触发上游 RPM 限制）",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="限制执行的任务数（默认全量）",
    )
    parser.add_argument(
        "--only",
        type=str,
        default=None,
        help="只执行指定 ID 或名称的词条（逗号分隔）",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="预览模式，不发起真实网络请求",
    )
    parser.add_argument(
        "--retry-attempts",
        type=int,
        default=3,
        help="单条任务遭遇限流或失败时的最大重试次数（默认 3 次）",
    )
    args = parser.parse_args()

    if not TASKS_FILE.exists():
        print(f"✗ 任务文件不存在: {TASKS_FILE}", file=sys.stderr)
        sys.exit(1)

    tasks = json.loads(TASKS_FILE.read_text(encoding="utf-8"))

    if args.only:
        targets = set(s.strip() for s in args.only.split(","))
        tasks = [t for t in tasks if t["id"] in targets or t["name"] in targets]

    if args.limit:
        tasks = tasks[: args.limit]

    print("=" * 65)
    print("  寻迹 · P0 标杆生图批次调度启动")
    print(f"  待处理任务数: {len(tasks)}")
    print(f"  任务间冷却等待: {args.delay} 秒")
    print(f"  提供商配置池: {PROVIDERS_TOML}")
    print(f"  运行模式: {'[预览模式 DRY-RUN]' if args.dry_run else '[真实执行 REAL-RUN]'}")
    print("=" * 65)

    success_count = 0
    skip_count = 0
    fail_count = 0

    for idx, task in enumerate(tasks, start=1):
        tag = f"[{idx:2d}/{len(tasks):2d}] [{task['dynasty']}·{task['type']}] {task['name']} ({task['id']})"
        out_rel_path = Path(task["outPath"])
        out_abs_path = ROOT / out_rel_path

        # 检查是否已存在（断点续跑）
        if out_abs_path.exists() and out_abs_path.stat().st_size > 5000:
            print(f"{tag} -> ⚡ [已存在跳过] {out_rel_path.name} ({out_abs_path.stat().st_size // 1024} KB)")
            skip_count += 1
            continue

        out_abs_path.parent.mkdir(parents=True, exist_ok=True)

        cmd = [
            str(PYTHON_EXE),
            str(IMAGE_GEN_SCRIPT),
            "generate",
            "--providers",
            str(PROVIDERS_TOML),
            "--prompt",
            task["prompt"],
            "--size",
            task["size"],
            "--quality",
            "high",
            "--out",
            str(out_abs_path),
        ]
        if args.dry_run:
            cmd.append("--dry-run")

        print(f"\n{tag} -> 🎨 开始生图...")
        start_t = time.time()

        job_ok = False
        for attempt in range(1, args.retry_attempts + 1):
            try:
                res = subprocess.run(
                    cmd,
                    cwd=str(ROOT),
                    capture_output=True,
                    text=True,
                    encoding="utf-8",
                    timeout=180,
                )
                if res.returncode == 0:
                    elapsed = time.time() - start_t
                    file_size = (
                        out_abs_path.stat().st_size // 1024
                        if out_abs_path.exists()
                        else 0
                    )
                    print(
                        f"{tag} -> ✔ 成功生成！耗时 {elapsed:.1f}s | 大小: {file_size} KB"
                    )
                    success_count += 1
                    job_ok = True
                    break
                else:
                    err_msg = res.stderr.strip() or res.stdout.strip()
                    print(
                        f"{tag} -> ⚠ 第 {attempt}/{args.retry_attempts} 次失败: {err_msg[:120]}"
                    )
                    if attempt < args.retry_attempts:
                        backoff = 10 * attempt
                        print(f"      ↳ 冷却避让 {backoff} 秒后自动重试...")
                        time.sleep(backoff)
            except subprocess.TimeoutExpired:
                print(f"{tag} -> ⚠ 第 {attempt} 次超时 (180s)")
                if attempt < args.retry_attempts:
                    time.sleep(15)
            except Exception as e:
                print(f"{tag} -> ⚠ 执行异常: {e}")
                if attempt < args.retry_attempts:
                    time.sleep(10)

        if not job_ok:
            fail_count += 1
            print(f"{tag} -> ✗ 最终生成失败")

        # 任务间主动温控休眠，防止上游触发激进限流
        if not args.dry_run and idx < len(tasks):
            time.sleep(args.delay)

    print("\n" + "=" * 65)
    print("  P0 批次调度执行完毕汇总")
    print(
        f"  总计: {len(tasks)} | 成功: {success_count} | 跳过: {skip_count} | 失败: {fail_count}"
    )
    print("=" * 65)


if __name__ == "__main__":
    main()
