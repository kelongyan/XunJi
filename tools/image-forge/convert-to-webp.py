import os
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent.parent
ENTRIES_DIR = ROOT / "public" / "images" / "entries"

converted = 0
for png_path in ENTRIES_DIR.rglob("*.png"):
    webp_path = png_path.with_suffix(".webp")
    if not webp_path.exists() or webp_path.stat().st_size < 1000:
        try:
            im = Image.open(png_path)
            im.save(webp_path, "WEBP", quality=85, method=6)
            print(f"✔ 转码成功: {png_path.name} -> {webp_path.name} ({webp_path.stat().st_size // 1024} KB)")
            converted += 1
        except Exception as e:
            print(f"✗ 转码失败: {png_path.name}: {e}")

print(f"WebP 转码完成，新增 {converted} 张")
