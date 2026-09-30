#!/usr/bin/env python3
"""寻迹 · P1 人物大观并发温控调度器

支持按朝代推进、多 Worker 错峰并发、任务间冷却等待、断点续跑、自动重试退避。
"""

import argparse
import concurrent.futures
import json
import os
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time

ROOT = Path(__file__).resolve().parent.parent.parent
TASKS_FILE = ROOT / "tools" / "image-forge" / "p1-tasks.json"
IMAGE_GEN_SCRIPT = Path(
    "C:/Users/Administrator/.workbuddy/skills/imagegen/scripts/image_gen.py"
)
PROVIDERS_TOML = Path(
    "C:/Users/Administrator/AppData/Roaming/imagegen/workbuddy/providers.toml"
)
PYTHON_EXE = Path(
    "C:/Users/Administrator/AppData/Local/Programs/Python/Python312/python.exe"
)

print_lock = threading.Lock()


def safe_print(*args, **kwargs):
    with print_lock:
        print(*args, **kwargs)
        sys.stdout.flush()


def run_single_job(cmd, timeout=120):
    return subprocess.run(
        cmd,
        cwd=str(ROOT),
        capture_output=True,
        text=True,
        encoding="utf-8",
        timeout=timeout,
    )


def process_task(task_info, delay, dry_run, retry_attempts):
    idx, total, task = task_info
    tag = f"[{idx:2d}/{total:2d}] [{task['dynasty']}·{task['type']}] {task['name']} ({task['id']})"
    out_rel_path = Path(task["outPath"])
    out_abs_path = ROOT / out_rel_path

    # 断点续跑检测
    if out_abs_path.exists() and out_abs_path.stat().st_size > 5000:
        safe_print(
            f"{tag} -> ⚡ [已存在跳过] {out_rel_path.name} ({out_abs_path.stat().st_size // 1024} KB)"
        )
        return "skip"

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
    if dry_run:
        cmd.append("--dry-run")

    safe_print(f"{tag} -> 🎨 开始生图...")
    start_t = time.time()

    job_ok = False
    for attempt in range(1, retry_attempts + 1):
        try:
            res = run_single_job(cmd, timeout=140)
            if res.returncode == 0:
                elapsed = time.time() - start_t
                file_size = (
                    out_abs_path.stat().st_size // 1024
                    if out_abs_path.exists()
                    else 0
                )
                safe_print(
                    f"{tag} -> ✔ 成功生成！耗时 {elapsed:.1f}s | 大小: {file_size} KB"
                )
                job_ok = True
                break
            else:
                err_msg = res.stderr.strip() or res.stdout.strip()
                safe_print(f"{tag} -> ⚠ 第 {attempt} 次失败: {err_msg[:120]}")
                if attempt < retry_attempts:
                    time.sleep(8 * attempt)
        except subprocess.TimeoutExpired:
            safe_print(f"{tag} -> ⚠ 第 {attempt} 次超时 (140s)")
            if attempt < retry_attempts:
                time.sleep(10)
        except Exception as e:
            safe_print(f"{tag} -> ⚠ 执行异常: {e}")
            if attempt < retry_attempts:
                time.sleep(8)

    if not dry_run and delay > 0:
        time.sleep(delay)

    if job_ok:
        return "ok"
    else:
        safe_print(f"{tag} -> ✗ 最终生成失败")
        return "fail"


def worker_loop(task_q, worker_id, delay, dry_run, retry_attempts, results):
    # 错峰启动，防止同时向上游建立连接
    time.sleep(worker_id * 2.0)
    while True:
        try:
            task_info = task_q.get_nowait()
        except queue.Empty:
            break
        res = process_task(task_info, delay, dry_run, retry_attempts)
        results.append(res)
        task_q.task_done()


def main():
    parser = argparse.ArgumentParser(description="P1 人物大观并发调度器")
    parser.add_argument(
        "--dynasty",
        type=str,
        default=None,
        help="指定朝代执行（明 / 唐 / 宋 / 汉 / 清）",
    )
    parser.add_argument(
        "--concurrency",
        type=int,
        default=2,
        help="并发 Worker 数量（默认 2，既保证效率又避免触发上游突发限流）",
    )
    parser.add_argument(
        "--delay",
        type=float,
        default=3.0,
        help="单个 Worker 任务完成后的冷却等待秒数（默认 3 秒）",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=None,
        help="限制生成的条目数量",
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
        help="预览模式",
    )
    args = parser.parse_args()

    if not TASKS_FILE.exists():
        safe_print(f"✗ 任务文件不存在: {TASKS_FILE}")
        sys.exit(1)

    all_tasks = json.loads(TASKS_FILE.read_text(encoding="utf-8"))
    tasks = all_tasks

    if args.dynasty:
        tasks = [t for t in tasks if t["dynasty"] == args.dynasty]

    if args.only:
        targets = set(s.strip() for s in args.only.split(","))
        tasks = [t for t in tasks if t["id"] in targets or t["name"] in targets]

    if args.limit:
        tasks = tasks[: args.limit]

    total_tasks = len(tasks)
    safe_print("=" * 65)
    safe_print("  寻迹 · P1 人物大观并发调度启动")
    safe_print(
        f"  目标朝代: {args.dynasty + '朝' if args.dynasty else '全部朝代'} | 任务数: {total_tasks}"
    )
    safe_print(f"  并发 Worker: {args.concurrency} | 任务冷却间隔: {args.delay} 秒")
    safe_print(f"  运行模式: {'[预览模式 DRY-RUN]' if args.dry_run else '[真实执行 REAL-RUN]'}")
    safe_print("=" * 65)

    task_q = queue.Queue()
    for idx, task in enumerate(tasks, start=1):
        task_q.put((idx, total_tasks, task))

    results = []
    threads = []
    start_total_t = time.time()

    for w_id in range(args.concurrency):
        t = threading.Thread(
            target=worker_loop,
            args=(task_q, w_id, args.delay, args.dry_run, 3, results),
            daemon=True,
        )
        t.start()
        threads.append(t)

    for t in threads:
        t.join()

    total_time = time.time() - start_total_t
    ok_count = results.count("ok")
    skip_count = results.count("skip")
    fail_count = results.count("fail")

    safe_print("\n" + "=" * 65)
    safe_print(f"  P1 [{args.dynasty or '全部'}] 调度完毕 (总耗时: {total_time:.1f}s)")
    safe_print(
        f"  总计: {total_tasks} | 成功: {ok_count} | 跳过: {skip_count} | 失败: {fail_count}"
    )
    safe_print("=" * 65)

    if fail_count > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
