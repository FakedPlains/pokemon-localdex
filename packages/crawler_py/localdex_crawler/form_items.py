"""
形态绑定道具 — 爬虫自动提取模块

从 52poke wiki 的 Mega 进化、原始回归等页面自动提取形态-道具绑定关系。
也支持从单个宝可梦页面中提取（如果页面包含相关信息）。

策略：
1. 从 "超级进化" 汇总页面提取所有 Mega 石与对应宝可梦的关系
2. 从 "原始回归" 页面提取原始宝珠绑定
3. 从道具分类页面（如 "进化石" 分类）补充遗漏
4. 从单个宝可梦页面的形态描述中提取（备用）

⚠️ 注意：本模块仅提取数据并输出映射关系，不会自动写入数据库。
需要配合 migrate-form-required-items.ts 或手动执行 SQL 来写入。

使用方式：
    python -m localdex_crawler.form_items [--output json|sql] [--fetch]
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

from .fetcher import PageFetcher, RawPage
from .utils import to_simplified, clean_inline_text


@dataclass
class FormItemBinding:
    """一条形态-道具绑定关系"""
    pokemon_name_zh: str
    form_name_zh: str
    item_name_zh: str
    form_type: str  # mega, primal, drive, plate, memory, etc.
    source: str = ""  # 数据来源页面 URL


# ══════════════════════════════════════════════════════════════
# Wiki 页面 URL
# ══════════════════════════════════════════════════════════════

MEGA_EVOLUTION_PAGE = "https://wiki.52poke.com/wiki/超级进化"
PRIMAL_REVERSION_PAGE = "https://wiki.52poke.com/wiki/原始回归"
ARCEUS_PAGE = "https://wiki.52poke.com/wiki/阿尔宙斯"
SILVALLY_PAGE = "https://wiki.52poke.com/wiki/银伴战兽"
GENESECT_PAGE = "https://wiki.52poke.com/wiki/盖诺赛克特"


# ══════════════════════════════════════════════════════════════
# 提取逻辑
# ══════════════════════════════════════════════════════════════

def extract_mega_bindings(html: str, source_url: str = "") -> list[FormItemBinding]:
    """从超级进化汇总页面提取 Mega 石绑定关系。

    页面通常包含一个表格，列出宝可梦名称、Mega 形态名称和对应的进化石。
    表格结构大致为：| 宝可梦 | 超级进化形态 | 超级进化石 | 属性 | ... |
    """
    soup = BeautifulSoup(html, "html.parser")
    bindings: list[FormItemBinding] = []

    # 查找包含 "超级进化石" 或 "进化石" 的表格
    for table in soup.find_all("table", class_="Pokemon"):
        # 尝试从表头确定列索引
        headers = table.find_all("th")
        header_texts = [to_simplified(clean_inline_text(th.get_text(strip=True))) for th in headers]

        pokemon_col = -1
        item_col = -1
        form_col = -1

        for i, text in enumerate(header_texts):
            if "宝可梦" in text or "名称" in text:
                pokemon_col = i
            elif "进化石" in text or "道具" in text:
                item_col = i
            elif "超级进化" in text or "形态" in text:
                form_col = i

        if item_col == -1:
            continue

        # 遍历数据行
        for tr in table.find_all("tr"):
            cells = tr.find_all(["td", "th"])
            if len(cells) <= max(pokemon_col, item_col):
                continue

            pokemon_name = ""
            item_name = ""
            form_name = ""

            if pokemon_col >= 0 and pokemon_col < len(cells):
                pokemon_name = to_simplified(clean_inline_text(cells[pokemon_col].get_text(strip=True)))
            if item_col >= 0 and item_col < len(cells):
                item_name = to_simplified(clean_inline_text(cells[item_col].get_text(strip=True)))
            if form_col >= 0 and form_col < len(cells):
                form_name = to_simplified(clean_inline_text(cells[form_col].get_text(strip=True)))

            if not pokemon_name or not item_name:
                continue
            if not form_name:
                form_name = f"超级{pokemon_name}"

            bindings.append(FormItemBinding(
                pokemon_name_zh=pokemon_name,
                form_name_zh=form_name,
                item_name_zh=item_name,
                form_type="mega",
                source=source_url,
            ))

    # 备用策略：从页面文本中用正则提取
    if not bindings:
        bindings = _extract_mega_from_text(soup, source_url)

    return bindings


def _extract_mega_from_text(soup: BeautifulSoup, source_url: str) -> list[FormItemBinding]:
    """备用策略：从页面正文中提取 Mega 进化石绑定。

    匹配模式如：
    - "XXX进化石" → 对应 "超级XXX"
    - "XXX进化石X/Y" → 对应 "超级XXXX/Y"
    """
    bindings: list[FormItemBinding] = []
    text = soup.get_text()

    # 匹配 "XXX进化石" 模式
    pattern = re.compile(r"(.{2,6}?)进化石([XY])?")
    seen = set()

    for match in pattern.finditer(text):
        pokemon_name = to_simplified(match.group(1).strip())
        suffix = match.group(2) or ""
        item_name = f"{pokemon_name}进化石{suffix}"
        form_name = f"超级{pokemon_name}{suffix}"

        key = (pokemon_name, form_name, item_name)
        if key in seen:
            continue
        seen.add(key)

        bindings.append(FormItemBinding(
            pokemon_name_zh=pokemon_name,
            form_name_zh=form_name,
            item_name_zh=item_name,
            form_type="mega",
            source=source_url,
        ))

    return bindings


def extract_primal_bindings(html: str, source_url: str = "") -> list[FormItemBinding]:
    """从原始回归页面提取宝珠绑定关系。"""
    bindings: list[FormItemBinding] = []
    text = to_simplified(BeautifulSoup(html, "html.parser").get_text())

    # 已知的原始回归绑定（数量极少，直接匹配关键词）
    if "靛蓝色宝珠" in text or "蓝色宝珠" in text:
        bindings.append(FormItemBinding(
            pokemon_name_zh="盖欧卡",
            form_name_zh="原始盖欧卡",
            item_name_zh="靛蓝色宝珠",
            form_type="primal",
            source=source_url,
        ))
    if "深红色宝珠" in text or "红色宝珠" in text:
        bindings.append(FormItemBinding(
            pokemon_name_zh="固拉多",
            form_name_zh="原始固拉多",
            item_name_zh="深红色宝珠",
            form_type="primal",
            source=source_url,
        ))

    return bindings


def extract_silvally_bindings(html: str, source_url: str = "") -> list[FormItemBinding]:
    """从银伴战兽页面提取记忆碟绑定。"""
    bindings: list[FormItemBinding] = []
    soup = BeautifulSoup(html, "html.parser")
    text = to_simplified(soup.get_text())

    # 记忆碟类型映射
    memory_types = [
        ("火焰", "火焰"), ("水流", "水流"), ("电击", "电击"), ("青草", "青草"),
        ("冰冻", "冰冻"), ("格斗", "格斗"), ("毒击", "毒击"), ("大地", "大地"),
        ("飞翔", "飞翔"), ("精神", "精神"), ("虫蛀", "虫蛀"), ("岩石", "岩石"),
        ("幽灵", "幽灵"), ("龙之", "龙之"), ("恶之", "恶之"), ("钢铁", "钢铁"),
        ("妖精", "妖精"),
    ]

    for type_prefix, item_prefix in memory_types:
        item_name = f"{item_prefix}记忆碟"
        if item_name in text or f"{type_prefix}记忆" in text:
            bindings.append(FormItemBinding(
                pokemon_name_zh="银伴战兽",
                form_name_zh=f"{type_prefix}驾驭形态",
                item_name_zh=item_name,
                form_type="memory",
                source=source_url,
            ))

    return bindings


def extract_arceus_bindings(html: str, source_url: str = "") -> list[FormItemBinding]:
    """从阿尔宙斯页面提取石板绑定。"""
    bindings: list[FormItemBinding] = []
    soup = BeautifulSoup(html, "html.parser")
    text = to_simplified(soup.get_text())

    # 石板类型映射
    plates = [
        ("火焰石板", "火焰石板形态"), ("水滴石板", "水滴石板形态"),
        ("雷电石板", "雷电石板形态"), ("碧绿石板", "碧绿石板形态"),
        ("冰柱石板", "冰柱石板形态"), ("拳头石板", "拳头石板形态"),
        ("剧毒石板", "剧毒石板形态"), ("大地石板", "大地石板形态"),
        ("青空石板", "青空石板形态"), ("神奇石板", "神奇石板形态"),
        ("玉虫石板", "玉虫石板形态"), ("岩石石板", "岩石石板形态"),
        ("妖怪石板", "妖怪石板形态"), ("龙之石板", "龙之石板形态"),
        ("恶颜石板", "恶颜石板形态"), ("钢铁石板", "钢铁石板形态"),
        ("妖精石板", "妖精石板形态"),
    ]

    for item_name, form_name in plates:
        if item_name in text:
            bindings.append(FormItemBinding(
                pokemon_name_zh="阿尔宙斯",
                form_name_zh=form_name,
                item_name_zh=item_name,
                form_type="plate",
                source=source_url,
            ))

    return bindings


def extract_genesect_bindings(html: str, source_url: str = "") -> list[FormItemBinding]:
    """从盖诺赛克特页面提取卡带绑定。"""
    bindings: list[FormItemBinding] = []
    soup = BeautifulSoup(html, "html.parser")
    text = to_simplified(soup.get_text())

    drives = [
        ("火烧卡带", "火烧驱动形态"),
        ("闪电卡带", "闪电驱动形态"),
        ("冰冻卡带", "冰冻驱动形态"),
        ("水流卡带", "水流驱动形态"),
    ]

    for item_name, form_name in drives:
        if item_name in text:
            bindings.append(FormItemBinding(
                pokemon_name_zh="盖诺赛克特",
                form_name_zh=form_name,
                item_name_zh=item_name,
                form_type="drive",
                source=source_url,
            ))

    return bindings


# ══════════════════════════════════════════════════════════════
# 汇总提取
# ══════════════════════════════════════════════════════════════

def extract_all_form_item_bindings(
    fetcher: PageFetcher | None = None,
    raw_dir: Path | None = None,
) -> list[FormItemBinding]:
    """从所有相关 wiki 页面提取形态-道具绑定关系。

    如果提供了 fetcher，会从网络获取页面；否则尝试从 raw_dir 加载缓存。
    如果都没有，返回空列表。

    Args:
        fetcher: 页面获取器（可选）
        raw_dir: 原始页面缓存目录（可选）

    Returns:
        所有提取到的绑定关系列表
    """
    all_bindings: list[FormItemBinding] = []

    pages_to_extract = [
        ("mega_evolution", MEGA_EVOLUTION_PAGE, extract_mega_bindings),
        ("primal_reversion", PRIMAL_REVERSION_PAGE, extract_primal_bindings),
        ("silvally", SILVALLY_PAGE, extract_silvally_bindings),
        ("arceus", ARCEUS_PAGE, extract_arceus_bindings),
        ("genesect", GENESECT_PAGE, extract_genesect_bindings),
    ]

    for cache_key, url, extractor in pages_to_extract:
        page: RawPage | None = None

        if fetcher:
            try:
                page = fetcher.load_or_fetch(cache_key, url)
            except Exception as e:
                print(f"  ⚠ 获取页面失败: {url} ({e})")
                continue
        elif raw_dir:
            cache_path = raw_dir / f"{cache_key}.json"
            if cache_path.exists():
                page = RawPage.from_json(json.loads(cache_path.read_text(encoding="utf-8")))

        if page:
            bindings = extractor(page.html, page.url)
            all_bindings.extend(bindings)
            print(f"  ✓ {cache_key}: 提取到 {len(bindings)} 条绑定")

    return all_bindings


# ══════════════════════════════════════════════════════════════
# 输出格式
# ══════════════════════════════════════════════════════════════

def bindings_to_json(bindings: list[FormItemBinding]) -> str:
    """将绑定关系输出为 JSON 格式。"""
    return json.dumps(
        [
            {
                "pokemonNameZh": b.pokemon_name_zh,
                "formNameZh": b.form_name_zh,
                "itemNameZh": b.item_name_zh,
                "formType": b.form_type,
                "source": b.source,
            }
            for b in bindings
        ],
        ensure_ascii=False,
        indent=2,
    )


def bindings_to_sql(bindings: list[FormItemBinding]) -> str:
    """将绑定关系输出为 SQL UPDATE 语句。"""
    lines = [
        "-- 形态绑定道具（爬虫自动提取）",
        "BEGIN TRANSACTION;",
        "",
    ]

    for b in bindings:
        lines.append(
            f"UPDATE pokemon_forms SET required_item_id = "
            f"(SELECT id FROM items WHERE name_zh = '{b.item_name_zh}' LIMIT 1) "
            f"WHERE id = (SELECT pf.id FROM pokemon_forms pf "
            f"JOIN pokemon p ON p.id = pf.pokemon_id "
            f"WHERE p.name_zh = '{b.pokemon_name_zh}' AND pf.name_zh = '{b.form_name_zh}' LIMIT 1);"
        )

    lines.append("")
    lines.append("COMMIT;")
    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════
# CLI 入口
# ══════════════════════════════════════════════════════════════

def main():
    """CLI 入口：提取形态-道具绑定关系并输出。"""
    import argparse

    parser = argparse.ArgumentParser(description="从 wiki 页面提取形态-道具绑定关系")
    parser.add_argument("--output", choices=["json", "sql"], default="json", help="输出格式")
    parser.add_argument("--fetch", action="store_true", help="从网络获取页面（否则仅使用缓存）")
    parser.add_argument("--raw-dir", type=Path, default=Path("raw_pages"), help="原始页面缓存目录")
    args = parser.parse_args()

    fetcher = None
    if args.fetch:
        fetcher = PageFetcher(raw_dir=args.raw_dir, refresh_raw=True)

    print("🔍 提取形态-道具绑定关系...\n")
    bindings = extract_all_form_item_bindings(fetcher=fetcher, raw_dir=args.raw_dir)

    print(f"\n📊 共提取到 {len(bindings)} 条绑定关系\n")

    if args.output == "json":
        print(bindings_to_json(bindings))
    else:
        print(bindings_to_sql(bindings))


if __name__ == "__main__":
    main()
