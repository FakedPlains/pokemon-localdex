"""
一致性验证脚本：对比爬虫重新解析的数据与数据库中已有数据是否一致。
验证重构后 parsers/ 和 upsert/ 模块的行为未发生变化。
"""
import json
import os
import sqlite3
import sys

sys.path.insert(0, os.path.dirname(__file__))

from localdex_crawler.config import CrawlerPaths
from localdex_crawler.fetcher import PageFetcher
from localdex_crawler.parsers.pokemon_detail import (
    PokemonSeed,
    normalize_pokemon_detail_page,
    parse_pokemon_list_page,
)
from localdex_crawler.parsers.learnset import parse_learnset_page
from localdex_crawler.parsers.moves import (
    MoveSeed,
    normalize_move_detail_page,
    parse_move_list_page,
)
from localdex_crawler.parsers.abilities import (
    AbilitySeed,
    normalize_ability_detail_page,
    parse_ability_list_page,
)
from localdex_crawler.parsers.items import (
    ItemSeed,
    normalize_item_detail_page,
    parse_item_list_page,
)
from localdex_crawler.upsert.base import connect

# ─── Config ────────────────────────────────────────────────────────────
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(__file__)))
DB_PATH = os.path.join(PROJECT_ROOT, "data", "sqlite", "localdex.sqlite")
RAW_DIR = os.path.join(PROJECT_ROOT, "data", "raw")

passed = 0
failed = 0
skipped = 0
errors = []


def report(label, ok, detail=""):
    global passed, failed
    if ok:
        passed += 1
        print(f"  ✓ {label}")
    else:
        failed += 1
        msg = f"  ✗ {label}: {detail}"
        print(msg)
        errors.append(msg)


def skip(label, reason):
    global skipped
    skipped += 1
    print(f"  ⊘ {label}: {reason}")


# ─── 1. 宝可梦详情对比 ────────────────────────────────────────────────
def test_pokemon_detail(fetcher, conn):
    print("\n═══ 宝可梦详情对比 ═══")
    # 选几只有代表性的宝可梦
    test_cases = [
        (25, "皮卡丘"),
        (6, "喷火龙"),   # 有 Mega 形态
        (150, "超梦"),   # 有 Mega X/Y
        (890, "无极汰那"),  # 有超极巨化
    ]

    for dex, name_zh in test_cases:
        cache_key = f"pokemon-{dex:04d}"
        cache_path = os.path.join(RAW_DIR, f"{cache_key}.json")
        if not os.path.exists(cache_path):
            skip(f"#{dex} {name_zh}", "无缓存页面")
            continue

        # 先查数据库获取 seed 所需信息
        row = conn.execute(
            "SELECT id, dex_number, name_zh, name_ja, name_en, category FROM pokemon WHERE dex_number = ?",
            (dex,),
        ).fetchone()

        if not row:
            skip(f"#{dex} {name_zh}", "数据库无记录")
            continue

        # 构造世代信息（从 introduced_generation 开始到第9世代）
        intro_gen = conn.execute(
            "SELECT introduced_generation FROM pokemon WHERE id = ?",
            (row[0],),
        ).fetchone()
        intro = intro_gen[0] if intro_gen and intro_gen[0] else 1
        generations = tuple(range(intro, 10))

        seed = PokemonSeed(
            dex_number=dex,
            name_zh=name_zh,
            detail_url=f"https://wiki.52poke.com/wiki/{name_zh}",
            name_ja=row[3],
            name_en=row[4],
            generations=generations,
        )

        page = fetcher.load_or_fetch(
            cache_key=cache_key,
            url=f"https://wiki.52poke.com/wiki/{name_zh}",
        )
        payload = normalize_pokemon_detail_page(page, seed)

        pokemon_id = row[0]
        report(
            f"#{dex} {name_zh} 名称一致",
            payload.get("name_zh") == row[2],
            f"解析={payload.get('name_zh')}, DB={row[2]}",
        )

        # 对比形态数量
        db_forms = conn.execute(
            "SELECT form_type, name_zh, is_default FROM pokemon_forms WHERE pokemon_id = ? ORDER BY sort_order",
            (pokemon_id,),
        ).fetchall()
        parsed_forms = payload.get("forms", [])
        report(
            f"#{dex} {name_zh} 形态数量一致",
            len(parsed_forms) == len(db_forms),
            f"解析={len(parsed_forms)}, DB={len(db_forms)}",
        )

        # 对比默认形态种族值
        default_form = conn.execute(
            "SELECT pf.id FROM pokemon_forms pf WHERE pf.pokemon_id = ? AND pf.is_default = 1",
            (pokemon_id,),
        ).fetchone()
        if default_form:
            form_id = default_form[0]
            db_stats = conn.execute(
                "SELECT hp, atk, def, spa, spd, spe FROM pokemon_form_stats WHERE form_id = ? ORDER BY generation_start DESC LIMIT 1",
                (form_id,),
            ).fetchone()
            if db_stats and parsed_forms:
                # 找默认形态的种族值
                default_parsed = next(
                    (f for f in parsed_forms if f.get("is_default")), parsed_forms[0]
                )
                parsed_stats = default_parsed.get("stats", {})
                if parsed_stats:
                    # 取最新世代的种族值
                    if isinstance(parsed_stats, list):
                        latest = parsed_stats[-1] if parsed_stats else {}
                    else:
                        latest = parsed_stats
                    stats_match = (
                        latest.get("hp") == db_stats[0]
                        and latest.get("atk") == db_stats[1]
                        and latest.get("def") == db_stats[2]
                        and latest.get("spa") == db_stats[3]
                        and latest.get("spd") == db_stats[4]
                        and latest.get("spe") == db_stats[5]
                    )
                    report(
                        f"#{dex} {name_zh} 默认形态种族值一致",
                        stats_match,
                        f"解析={latest}, DB=hp={db_stats[0]} atk={db_stats[1]} def={db_stats[2]} spa={db_stats[3]} spd={db_stats[4]} spe={db_stats[5]}",
                    )

        # 对比属性
        if default_form:
            form_id = default_form[0]
            db_types = conn.execute(
                "SELECT type_name FROM pokemon_form_types WHERE form_id = ? AND generation_end IS NULL ORDER BY slot",
                (form_id,),
            ).fetchall()
            if parsed_forms:
                default_parsed = next(
                    (f for f in parsed_forms if f.get("is_default")), parsed_forms[0]
                )
                parsed_types = default_parsed.get("types", [])
                if isinstance(parsed_types, list) and parsed_types:
                    # 取最新世代的属性
                    if isinstance(parsed_types[0], dict):
                        latest_types = [
                            t.get("type_name") or t.get("name")
                            for t in parsed_types
                            if t.get("generation_end") is None
                        ]
                    else:
                        latest_types = parsed_types
                    db_type_names = [t[0] for t in db_types]
                    report(
                        f"#{dex} {name_zh} 默认形态属性一致",
                        set(latest_types) == set(db_type_names),
                        f"解析={latest_types}, DB={db_type_names}",
                    )


# ─── 2. 招式对比 ──────────────────────────────────────────────────────
def test_moves(fetcher, conn):
    print("\n═══ 招式对比 ═══")
    test_moves_list = ["十万伏特", "冲浪", "地震", "火焰放射"]

    for name in test_moves_list:
        from localdex_crawler.text import slugify
        cache_key = f"move-{slugify(name)}"
        cache_path = os.path.join(RAW_DIR, f"{cache_key}.json")
        if not os.path.exists(cache_path):
            skip(f"招式 {name}", "无缓存页面")
            continue

        # 先查数据库获取 seed 所需信息
        db_row = conn.execute(
            "SELECT id, name_zh, type_name, category, power, accuracy, pp, description FROM moves WHERE name_zh = ?",
            (name,),
        ).fetchone()

        if not db_row:
            skip(f"招式 {name}", "数据库无记录")
            continue

        seed = MoveSeed(
            name_zh=name,
            detail_url=f"https://wiki.52poke.com/wiki/{name}（招式）",
            type=db_row[2],
            category=db_row[3],
            power=db_row[4],
            accuracy=db_row[5],
            pp=db_row[6],
            description=db_row[7],
        )

        page = fetcher.load_or_fetch(
            cache_key=cache_key,
            url=f"https://wiki.52poke.com/wiki/{name}（招式）",
        )
        payload = normalize_move_detail_page(page, seed)

        report(
            f"招式 {name} 属性一致",
            payload.get("type") == db_row[2],
            f"解析={payload.get('type')}, DB={db_row[2]}",
        )
        report(
            f"招式 {name} 分类一致",
            payload.get("category") == db_row[3],
            f"解析={payload.get('category')}, DB={db_row[3]}",
        )
        report(
            f"招式 {name} 威力一致",
            payload.get("power") == db_row[4],
            f"解析={payload.get('power')}, DB={db_row[4]}",
        )
        report(
            f"招式 {name} 命中一致",
            payload.get("accuracy") == db_row[5],
            f"解析={payload.get('accuracy')}, DB={db_row[5]}",
        )
        report(
            f"招式 {name} PP一致",
            payload.get("pp") == db_row[6],
            f"解析={payload.get('pp')}, DB={db_row[6]}",
        )


# ─── 3. 特性对比 ──────────────────────────────────────────────────────
def test_abilities(fetcher, conn):
    print("\n═══ 特性对比 ═══")
    test_abilities_list = ["静电", "威吓", "飘浮", "加速"]

    for name in test_abilities_list:
        from localdex_crawler.text import slugify
        cache_key = f"ability-{slugify(name)}"
        cache_path = os.path.join(RAW_DIR, f"{cache_key}.json")
        if not os.path.exists(cache_path):
            skip(f"特性 {name}", "无缓存页面")
            continue

        # 先查数据库获取 seed 所需信息
        db_row = conn.execute(
            "SELECT id, name_zh, description, number, introduced_generation FROM abilities WHERE name_zh = ?",
            (name,),
        ).fetchone()

        if not db_row:
            skip(f"特性 {name}", "数据库无记录")
            continue

        seed = AbilitySeed(
            name_zh=name,
            detail_url=f"https://wiki.52poke.com/wiki/{name}（特性）",
            number=db_row[3] or 0,
            generation=db_row[4] or 3,
            description=db_row[2],
        )

        page = fetcher.load_or_fetch(
            cache_key=cache_key,
            url=f"https://wiki.52poke.com/wiki/{name}（特性）",
        )
        payload = normalize_ability_detail_page(page, seed)

        report(
            f"特性 {name} 名称一致",
            payload.get("name_zh") == db_row[1],
            f"解析={payload.get('name_zh')}, DB={db_row[1]}",
        )
        # 验证世代记录数量（parser 返回字段名为 generations）
        # 注意：DB 中同一 (ability_id, generation) 只保留一条（unique 约束，
        # 同世代不同 game_version_code 会被 upsert 覆盖），
        # 而 parser 可能解析出同世代多条（不同 game_version_code）。
        # 因此这里对比"去重后世代数"是否一致。
        db_gen_count = conn.execute(
            "SELECT COUNT(*) FROM ability_generation_records WHERE ability_id = ?",
            (db_row[0],),
        ).fetchone()[0]
        parsed_gens = payload.get("generations", [])
        # parser 的输出按 (generation, game_version_code) 去重，DB 按 (generation) 去重
        # 所以只能确认 DB 数量 <= parser 数量
        parsed_unique_gens = len(set(g["generation"] for g in parsed_gens))
        report(
            f"特性 {name} 世代记录数量一致",
            parsed_unique_gens == db_gen_count,
            f"解析去重世代数={parsed_unique_gens}, DB={db_gen_count}",
        )


# ─── 4. 道具对比 ──────────────────────────────────────────────────────
def test_items(fetcher, conn):
    print("\n═══ 道具对比 ═══")
    test_items_list = ["气息腰带", "生命宝珠", "讲究围巾", "突击背心"]

    for name in test_items_list:
        from localdex_crawler.text import slugify
        cache_key = f"item-{slugify(name)}"
        cache_path = os.path.join(RAW_DIR, f"{cache_key}.json")
        if not os.path.exists(cache_path):
            skip(f"道具 {name}", "无缓存页面")
            continue

        # 先查数据库获取 seed 所需信息
        db_row = conn.execute(
            "SELECT id, name_zh, category, effect_summary FROM items WHERE name_zh = ?",
            (name,),
        ).fetchone()

        if not db_row:
            skip(f"道具 {name}", "数据库无记录")
            continue

        seed = ItemSeed(
            name_zh=name,
            detail_url=f"https://wiki.52poke.com/wiki/{name}（道具）",
            category=db_row[2],
            effect_summary=db_row[3],
        )

        page = fetcher.load_or_fetch(
            cache_key=cache_key,
            url=f"https://wiki.52poke.com/wiki/{name}（道具）",
        )
        payload = normalize_item_detail_page(page, seed)

        report(
            f"道具 {name} 名称一致",
            payload.get("name_zh") == db_row[1],
            f"解析={payload.get('name_zh')}, DB={db_row[1]}",
        )


# ─── 5. 招式学习表对比 ─────────────────────────────────────────────────
def test_learnsets(fetcher, conn):
    print("\n═══ 招式学习表对比 ═══")
    # 皮卡丘第9世代
    dex = 25
    name_zh = "皮卡丘"
    gen = 9
    cache_key = f"pokemon-{dex:04d}-learnset-gen{gen}"
    cache_path = os.path.join(RAW_DIR, f"{cache_key}.json")
    if not os.path.exists(cache_path):
        skip(f"#{dex} {name_zh} Gen{gen} 招式表", "无缓存页面")
        return

    page = fetcher.load_or_fetch(
        cache_key=cache_key,
        url=f"https://wiki.52poke.com/wiki/{name_zh}/第九世代招式表",
    )
    parsed = parse_learnset_page(page, gen)

    # 获取数据库中的招式数量
    pokemon_row = conn.execute(
        "SELECT id FROM pokemon WHERE dex_number = ?", (dex,)
    ).fetchone()
    if not pokemon_row:
        skip(f"#{dex} {name_zh} Gen{gen} 招式表", "数据库无宝可梦记录")
        return

    pokemon_id = pokemon_row[0]
    # 获取默认形态的招式数量
    default_form = conn.execute(
        "SELECT id FROM pokemon_forms WHERE pokemon_id = ? AND is_default = 1",
        (pokemon_id,),
    ).fetchone()
    if not default_form:
        skip(f"#{dex} {name_zh} Gen{gen} 招式表", "数据库无默认形态")
        return

    form_id = default_form[0]
    db_move_count = conn.execute(
        "SELECT COUNT(*) FROM pokemon_moves WHERE form_id = ? AND generation = ?",
        (form_id, gen),
    ).fetchone()[0]

    # 解析结果中所有形态的招式总数
    total_parsed = 0
    for form_label, moves in parsed.items():
        total_parsed += len(moves)

    # 获取该宝可梦在该世代的全部招式数（所有形态）
    db_total = conn.execute(
        "SELECT COUNT(*) FROM pokemon_moves WHERE pokemon_id = ? AND generation = ?",
        (pokemon_id, gen),
    ).fetchone()[0]

    report(
        f"#{dex} {name_zh} Gen{gen} 招式总数接近",
        abs(total_parsed - db_total) <= 5,  # 允许小幅差异（去重等）
        f"解析={total_parsed}, DB={db_total}",
    )

    # 验证几个具体招式存在
    expected_moves = ["十万伏特", "电击", "铁尾"]
    for move_name in expected_moves:
        db_has = conn.execute(
            "SELECT COUNT(*) FROM pokemon_moves WHERE pokemon_id = ? AND generation = ? AND move_name_zh = ?",
            (pokemon_id, gen, move_name),
        ).fetchone()[0]
        # 检查解析结果
        parsed_has = any(
            any(m.get("move_name_zh") == move_name or m.get("name_zh") == move_name for m in moves)
            for moves in parsed.values()
        )
        report(
            f"#{dex} {name_zh} Gen{gen} 招式'{move_name}' 存在性一致",
            (db_has > 0) == parsed_has,
            f"解析={'有' if parsed_has else '无'}, DB={'有' if db_has > 0 else '无'}",
        )


# ─── Main ─────────────────────────────────────────────────────────────
def main():
    global passed, failed, skipped

    if not os.path.exists(DB_PATH):
        print(f"错误：数据库不存在 {DB_PATH}")
        sys.exit(1)

    if not os.path.exists(RAW_DIR):
        print(f"警告：缓存目录不存在 {RAW_DIR}，将跳过需要缓存的测试")

    conn = sqlite3.connect(DB_PATH)
    from pathlib import Path
    fetcher = PageFetcher(raw_dir=Path(RAW_DIR), refresh_raw=False)

    print("=" * 60)
    print("爬虫重构一致性验证")
    print(f"数据库: {DB_PATH}")
    print(f"缓存目录: {RAW_DIR}")
    print("=" * 60)

    test_pokemon_detail(fetcher, conn)
    test_moves(fetcher, conn)
    test_abilities(fetcher, conn)
    test_items(fetcher, conn)
    test_learnsets(fetcher, conn)

    conn.close()

    print("\n" + "=" * 60)
    print(f"结果汇总: {passed} 通过, {failed} 失败, {skipped} 跳过")
    print("=" * 60)

    if errors:
        print("\n失败详情:")
        for e in errors:
            print(e)

    sys.exit(0 if failed == 0 else 1)


if __name__ == "__main__":
    main()
