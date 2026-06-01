"""
形态绑定道具 — 爬虫自动提取与写库模块

从 52poke wiki 的 Mega 进化、原始回归等页面自动提取形态-道具绑定关系。
也支持从单个宝可梦页面中提取（如果页面包含相关信息）。

策略：
1. 从 "超级进化" 汇总页面提取所有 Mega 石与对应宝可梦的关系
2. 从 "原始回归" 页面提取原始宝珠绑定
3. 从道具分类页面（如 "进化石" 分类）补充遗漏
4. 从单个宝可梦页面的形态描述中提取（备用）

使用方式：
    python -m localdex_crawler.form_items [--output summary|json|sql] [--execute]
"""

from __future__ import annotations

import json
import re
import sqlite3
import unicodedata
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from bs4 import BeautifulSoup

from .config import CrawlerPaths
from .fetcher import PageFetcher, RawPage
from .text import to_simplified, clean_inline_text
from .upsert.base import connect


@dataclass
class FormItemBinding:
    """一条形态-道具绑定关系"""
    pokemon_name_zh: str
    form_name_zh: str
    item_name_zh: str
    form_type: str  # mega, primal, drive, plate, memory, etc.
    source: str = ""  # 数据来源页面 URL


MEGA_FORMS_WITHOUT_REQUIRED_ITEM = {
    ("烈空坐", "超级烈空坐"),
}


def _text_key(value: str | None) -> str:
    text = to_simplified(unicodedata.normalize("NFKC", value or ""))
    text = re.sub(r"\s+", "", text)
    return text.lower()


def _binding_to_dict(binding: FormItemBinding) -> dict[str, str]:
    return {
        "pokemonNameZh": binding.pokemon_name_zh,
        "formNameZh": binding.form_name_zh,
        "itemNameZh": binding.item_name_zh,
        "formType": binding.form_type,
        "source": binding.source,
    }


def _dedupe_bindings(bindings: list[FormItemBinding]) -> list[FormItemBinding]:
    seen: set[tuple[str, str, str]] = set()
    result: list[FormItemBinding] = []
    for binding in bindings:
        key = (
            _text_key(binding.pokemon_name_zh),
            _text_key(binding.form_name_zh),
            _text_key(binding.item_name_zh),
        )
        if key in seen:
            continue
        seen.add(key)
        result.append(binding)
    return result


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
            item_name_zh="朱红色宝珠",
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


def derive_form_item_bindings_from_db(conn: sqlite3.Connection) -> list[FormItemBinding]:
    """从当前 pokemon_forms/items 形态结构推导可确定的绑定关系。

    Wiki 汇总页能覆盖官方 Mega/原始回归等关系；数据库中已经存在的扩展 Mega
    形态也遵循“宝可梦名 + 进化石 + X/Y/Z 后缀”的命名规则，因此在写库阶段统一推导，
    避免再维护一份一次性静态迁移表。
    """
    rows = conn.execute(
        """
        SELECT
          p.name_zh AS pokemon_name_zh,
          pf.name_zh AS form_name_zh,
          pf.display_name_zh AS display_name_zh,
          pf.form_type AS form_type,
          pf.form_category AS form_category
        FROM pokemon_forms pf
        JOIN pokemon p ON p.id = pf.pokemon_id
        WHERE pf.is_default = 0
        ORDER BY p.dex_number, pf.sort_order, pf.id
        """
    ).fetchall()

    bindings: list[FormItemBinding] = []
    for row in rows:
        pokemon_name = str(row["pokemon_name_zh"])
        form_name = str(row["display_name_zh"] or row["form_name_zh"])
        form_type = str(row["form_type"] or "")
        form_category = str(row["form_category"] or "")

        item_name = _derive_required_item_name(pokemon_name, form_name, form_type, form_category)
        if not item_name:
            continue
        bindings.append(
            FormItemBinding(
                pokemon_name_zh=pokemon_name,
                form_name_zh=form_name,
                item_name_zh=item_name,
                form_type=form_type or form_category or "alternate",
                source="database:pokemon_forms",
            )
        )

    return bindings


def _derive_required_item_name(
    pokemon_name_zh: str,
    form_name_zh: str,
    form_type: str,
    form_category: str,
) -> str | None:
    normalized_type = unicodedata.normalize("NFKC", form_type or "").lower()
    normalized_category = unicodedata.normalize("NFKC", form_category or "").lower()
    normalized_form = unicodedata.normalize("NFKC", form_name_zh or "")

    if (pokemon_name_zh, form_name_zh) in MEGA_FORMS_WITHOUT_REQUIRED_ITEM:
        return None

    is_mega = (
        normalized_category == "mega"
        or "mega" in normalized_type
        or normalized_form.startswith("超级")
    )
    if is_mega:
        suffix = ""
        if normalized_type.endswith("-x") or normalized_form.endswith("X"):
            suffix = "Ｘ"
        elif normalized_type.endswith("-y") or normalized_form.endswith("Y"):
            suffix = "Ｙ"
        elif normalized_type.endswith("-z") or normalized_form.endswith("Z"):
            suffix = "Ｚ"
        return f"{pokemon_name_zh}进化石{suffix}"

    is_primal = normalized_type == "primal" or normalized_form.startswith("原始")
    if is_primal and pokemon_name_zh == "盖欧卡":
        return "靛蓝色宝珠"
    if is_primal and pokemon_name_zh == "固拉多":
        return "朱红色宝珠"

    return None


def apply_form_item_bindings(
    conn: sqlite3.Connection,
    bindings: list[FormItemBinding],
    *,
    dry_run: bool = False,
    include_derived: bool = True,
) -> dict[str, Any]:
    """将形态-道具绑定写入 pokemon_forms.required_item_id。

    手动修复命令和主爬虫都调用这个函数，保证匹配、推导和更新规则一致。
    """
    all_bindings = collect_form_item_bindings(conn, bindings, include_derived=include_derived)
    derived_count = len(derive_form_item_bindings_from_db(conn)) if include_derived else 0

    item_rows = conn.execute("SELECT id, name_zh FROM items").fetchall()
    item_by_name = {_text_key(str(row["name_zh"])): int(row["id"]) for row in item_rows}

    form_rows = conn.execute(
        """
        SELECT
          pf.id,
          pf.name_zh AS form_name_zh,
          pf.display_name_zh AS display_name_zh,
          pf.required_item_id,
          p.name_zh AS pokemon_name_zh
        FROM pokemon_forms pf
        JOIN pokemon p ON p.id = pf.pokemon_id
        """
    ).fetchall()
    form_by_name: dict[tuple[str, str], list[sqlite3.Row]] = {}
    for row in form_rows:
        key = (_text_key(str(row["pokemon_name_zh"])), _text_key(str(row["form_name_zh"])))
        form_by_name.setdefault(key, []).append(row)
        if row["display_name_zh"]:
            display_key = (_text_key(str(row["pokemon_name_zh"])), _text_key(str(row["display_name_zh"])))
            form_by_name.setdefault(display_key, []).append(row)

    result: dict[str, Any] = {
        "bindings": len(all_bindings),
        "derived": derived_count,
        "matched": 0,
        "updated": 0,
        "unchanged": 0,
        "dryRun": dry_run,
        "missing_items": [],
        "missing_forms": [],
    }

    with conn:
        for binding in all_bindings:
            item_id = item_by_name.get(_text_key(binding.item_name_zh))
            if item_id is None:
                result["missing_items"].append(_binding_to_dict(binding))
                continue

            form_key = (_text_key(binding.pokemon_name_zh), _text_key(binding.form_name_zh))
            form_matches = form_by_name.get(form_key) or []
            if not form_matches:
                result["missing_forms"].append(_binding_to_dict(binding))
                continue

            form = form_matches[0]
            result["matched"] += 1
            if form["required_item_id"] == item_id:
                result["unchanged"] += 1
                continue
            if dry_run:
                continue
            conn.execute(
                "UPDATE pokemon_forms SET required_item_id = ? WHERE id = ?",
                (item_id, int(form["id"])),
            )
            result["updated"] += 1

    return result


def collect_form_item_bindings(
    conn: sqlite3.Connection,
    bindings: list[FormItemBinding],
    *,
    include_derived: bool = True,
) -> list[FormItemBinding]:
    all_bindings: list[FormItemBinding] = []
    if include_derived:
        all_bindings.extend(derive_form_item_bindings_from_db(conn))
    all_bindings.extend(bindings)
    return _dedupe_bindings(all_bindings)


def extract_and_apply_form_item_bindings(
    conn: sqlite3.Connection,
    *,
    fetcher: PageFetcher | None = None,
    raw_dir: Path | None = None,
    dry_run: bool = False,
) -> dict[str, Any]:
    bindings = extract_all_form_item_bindings(fetcher=fetcher, raw_dir=raw_dir)
    return apply_form_item_bindings(conn, bindings, dry_run=dry_run, include_derived=True)


# ══════════════════════════════════════════════════════════════
# 输出格式
# ══════════════════════════════════════════════════════════════

def bindings_to_json(bindings: list[FormItemBinding]) -> str:
    """将绑定关系输出为 JSON 格式。"""
    return json.dumps(
        [_binding_to_dict(binding) for binding in bindings],
        ensure_ascii=False,
        indent=2,
    )


def _sql_quote(value: str) -> str:
    return value.replace("'", "''")


def bindings_to_sql(bindings: list[FormItemBinding]) -> str:
    """将绑定关系输出为 SQL UPDATE 语句。"""
    lines = [
        "-- 形态绑定道具（爬虫自动提取）",
        "BEGIN TRANSACTION;",
        "",
    ]

    for b in bindings:
        item_name = _sql_quote(b.item_name_zh)
        pokemon_name = _sql_quote(b.pokemon_name_zh)
        form_name = _sql_quote(b.form_name_zh)
        lines.append(
            f"UPDATE pokemon_forms SET required_item_id = "
            f"(SELECT id FROM items WHERE name_zh = '{item_name}' LIMIT 1) "
            f"WHERE id = (SELECT pf.id FROM pokemon_forms pf "
            f"JOIN pokemon p ON p.id = pf.pokemon_id "
            f"WHERE p.name_zh = '{pokemon_name}' "
            f"AND (pf.name_zh = '{form_name}' OR pf.display_name_zh = '{form_name}') LIMIT 1);"
        )

    lines.append("")
    lines.append("COMMIT;")
    return "\n".join(lines)


# ══════════════════════════════════════════════════════════════
# CLI 入口
# ══════════════════════════════════════════════════════════════

def main():
    """CLI 入口：提取形态-道具绑定关系，可输出或写库。"""
    import argparse

    paths = CrawlerPaths()
    parser = argparse.ArgumentParser(description="从 wiki 页面提取形态-道具绑定关系")
    parser.add_argument("--db-path", type=Path, default=paths.default_db_path, help="SQLite 数据库路径")
    parser.add_argument("--raw-dir", type=Path, default=paths.default_raw_dir, help="原始页面缓存目录")
    parser.add_argument("--output", choices=["summary", "json", "sql"], default="summary", help="输出格式")
    parser.add_argument("--execute", action="store_true", help="写入 pokemon_forms.required_item_id")
    parser.add_argument("--dry-run", action="store_true", help="演练写库匹配，不修改数据库")
    parser.add_argument("--refresh-raw", action="store_true", help="强制重新获取页面")
    args = parser.parse_args()

    fetcher = PageFetcher(raw_dir=args.raw_dir, refresh_raw=args.refresh_raw)

    print("Extracting form required-item bindings...\n")
    bindings = extract_all_form_item_bindings(fetcher=fetcher, raw_dir=args.raw_dir)

    conn = connect(args.db_path)
    all_bindings = collect_form_item_bindings(conn, bindings, include_derived=True)

    print(f"\nExtracted {len(bindings)} wiki bindings; total with derived bindings: {len(all_bindings)}\n")

    if args.output == "json":
        print(bindings_to_json(all_bindings))
    elif args.output == "sql":
        print(bindings_to_sql(all_bindings))
    else:
        dry_run = args.dry_run or not args.execute
        result = apply_form_item_bindings(conn, bindings, dry_run=dry_run, include_derived=True)
        mode = "dry-run" if dry_run else "updated"
        print(f"[{mode}] form items: {result}")
        if dry_run:
            print("Run with --execute to write required_item_id.")
    conn.close()


if __name__ == "__main__":
    main()
