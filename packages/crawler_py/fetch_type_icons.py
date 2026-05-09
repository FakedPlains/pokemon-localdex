#!/usr/bin/env python3
"""
从 52poke wiki 下载属性图标 sprite 图片，切割为 18 个独立 PNG 并存入数据库。

wiki 使用 CSS sprite 方式渲染属性图标：
  背景图: https://media.52poke.com/wiki/8/87/MST_SV.webp
  尺寸:   20×420px（每个图标 20×20px）
  排列顺序（从上到下）:
    一般, 格斗, 飞行, 毒, 地面, 岩石, 虫, 幽灵, 钢,
    火, 水, 草, 电, 超能力, 冰, 龙, 恶, 妖精, (星晶)
"""
from __future__ import annotations

import io
import os
import subprocess
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("需要 Pillow 库，正在安装...")
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image

# ── 项目路径 ──────────────────────────────────────────────
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent
DB_PATH = PROJECT_ROOT / "data" / "sqlite" / "localdex.sqlite"
ICONS_DIR = PROJECT_ROOT / "data" / "type-icons"

USER_AGENT = (
    "PokemonLocalDexCrawler/0.1 "
    "(local research cache; source https://wiki.52poke.com/)"
)

# Sprite 图片 URL（朱紫 SV 版本属性图标）
SPRITE_URL = "https://media.52poke.com/wiki/8/87/MST_SV.webp"

# sprite 中属性图标的排列顺序（从上到下，每个 20×20px）
# 这个顺序来自 wiki CSS 中 background-position 的定义
SPRITE_ORDER = [
    "一般",    # 0px
    "格斗",    # -20px
    "飞行",    # -40px
    "毒",      # -60px
    "地面",    # -80px
    "岩石",    # -100px
    "虫",      # -120px
    "幽灵",    # -140px
    "钢",      # -160px
    "火",      # -180px
    "水",      # -200px
    "草",      # -220px
    "电",      # -240px
    "超能力",  # -260px
    "冰",      # -280px
    "龙",      # -300px
    "恶",      # -320px
    "妖精",    # -340px
    # "星晶",  # -360px  (太晶化属性，不在标准 18 属性中)
]

# sprite 实际尺寸 50×1050px，CSS 中用 background-size:20px 420px 缩放显示
# 原始每个图标 50×50px
ICON_SIZE = 50


def download_sprite(url: str) -> bytes:
    """下载 sprite 图片，返回原始字节（使用 curl 避免 SSL 问题）。"""
    result = subprocess.run(
        ["curl", "-L", "-sS", "--fail", "--connect-timeout", "15",
         "--max-time", "30", "-A", USER_AGENT, url],
        check=True, capture_output=True,
    )
    return result.stdout


def split_sprite(sprite_bytes: bytes) -> dict[str, Image.Image]:
    """将 sprite 图片切割为独立的属性图标。"""
    sprite = Image.open(io.BytesIO(sprite_bytes))
    print(f"  Sprite 尺寸: {sprite.size[0]}×{sprite.size[1]}px, 格式: {sprite.format}")

    # 确保是 RGBA 模式（支持透明度）
    if sprite.mode != "RGBA":
        sprite = sprite.convert("RGBA")

    icons = {}
    for i, type_name in enumerate(SPRITE_ORDER):
        top = i * ICON_SIZE
        box = (0, top, ICON_SIZE, top + ICON_SIZE)
        icon = sprite.crop(box)
        icons[type_name] = icon

    return icons


def upscale_icon(icon: Image.Image, target_size: int) -> Image.Image:
    """将图标放大到指定尺寸（使用 LANCZOS 插值保持质量）。"""
    return icon.resize((target_size, target_size), Image.LANCZOS)


def main():
    print("=" * 60)
    print("属性图标下载工具 (CSS Sprite 切割方案)")
    print("=" * 60)

    ICONS_DIR.mkdir(parents=True, exist_ok=True)

    # 1. 下载 sprite 图片
    sprite_cache = ICONS_DIR / "_sprite_MST_SV.webp"
    if sprite_cache.exists():
        print(f"\n使用缓存的 sprite: {sprite_cache.name}")
        sprite_bytes = sprite_cache.read_bytes()
    else:
        print(f"\n下载 sprite: {SPRITE_URL}")
        sprite_bytes = download_sprite(SPRITE_URL)
        sprite_cache.write_bytes(sprite_bytes)
        print(f"  已缓存到: {sprite_cache.name} ({len(sprite_bytes)} bytes)")

    # 2. 切割 sprite
    print("\n切割 sprite 为独立图标...")
    icons = split_sprite(sprite_bytes)
    print(f"  成功切割 {len(icons)} 个属性图标")

    # 3. 保存为独立 PNG 文件（原始 20px + 放大 40px/80px）
    print("\n保存图标文件...")
    saved_files = {}
    for type_name, icon in icons.items():
        # 保存三种尺寸：原始 50px、缩小 20px（CSS 展示尺寸）、放大 80px
        for size, suffix in [(50, ""), (20, "@sm"), (80, "@lg")]:
            if size == ICON_SIZE:
                img = icon
            else:
                img = upscale_icon(icon, size)

            filename = f"type-{type_name}{suffix}.png"
            filepath = ICONS_DIR / filename
            img.save(filepath, "PNG", optimize=True)

        # 记录主文件路径（使用原始 50px 作为默认展示尺寸）
        main_file = ICONS_DIR / f"type-{type_name}.png"
        saved_files[type_name] = str(main_file.relative_to(PROJECT_ROOT))
        print(f"  ✓ {type_name}: type-{type_name}.png / @sm / @lg")

    print(f"\n{'=' * 60}")
    print(f"完成！")
    print(f"  切割图标: {len(icons)} 个属性")
    print(f"  图标目录: {ICONS_DIR}")
    print("=" * 60)


if __name__ == "__main__":
    main()
