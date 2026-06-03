from __future__ import annotations

import argparse
from pathlib import Path
import subprocess
import sys

from .config import CrawlerPaths
from .constants import ABILITY_LIST_URL, ITEM_LIST_URL, MOVE_LIST_URL, POKEMON_LIST_URL
from .fetcher import PageFetcher, PageNotFoundError
from .fetcher_pokechamdb import PokechamdbFetcher
from .form_items import (
    apply_form_item_bindings,
    bindings_to_json,
    bindings_to_sql,
    collect_form_item_bindings,
    extract_all_form_item_bindings,
)
from .parsers.abilities import AbilitySeed, normalize_ability_detail_page, parse_ability_list_page
from .parsers.champions import (
    CHAMPIONS_ITEMS_URL,
    CHAMPIONS_REGULATIONS_URL,
    CHAMPIONS_SEASONS_URL,
    normalize_champions_pages,
)
from .parsers.evolution import parse_evolution_chain
from .parsers.field_effects import (
    ALL_FIELD_EFFECT_SEEDS,
    KIND_FIELD,
    KIND_SIDE,
    KIND_STATUS,
    KIND_TERRAIN,
    KIND_WEATHER,
    build_field_effect_page_url,
    normalize_field_effect_detail_page,
)
from .parsers.items import ItemSeed, normalize_item_detail_page, parse_item_list_page
from .parsers.learnset import learnset_cache_key, parse_learnset_page
from .parsers.moves import MoveSeed, normalize_move_detail_page, parse_move_list_page
from .parsers.pokemon_abilities import parse_pokemon_abilities
from .parsers.pokemon_detail import normalize_pokemon_detail_page, parse_pokemon_list_page, pokemon_cache_key
from .parsers.pokemon_images import resolve_pokemon_image_assets
from .text import slugify
from .urls import build_learnset_page_url, build_move_page_url
from .upsert.base import connect
from .upsert.catalog import upsert_ability_detail, upsert_item_detail, upsert_move_detail
from .upsert.champions import upsert_champions_data
from .upsert.clear import (
    clear_abilities,
    clear_all,
    clear_champions,
    clear_field_effects,
    clear_items,
    clear_moves,
    clear_pokemon,
)
from .upsert.pokechamdb_usage import clear_usage_data, upsert_usage_detail, upsert_usage_pokemon
from .upsert.field_effects import upsert_field_effect_detail
from .upsert.learnset import upsert_pokemon_moves
from .upsert.pokemon import (
    PokemonRow,
    cache_key,
    generate_form_change_chains,
    pokemon_source_url,
    select_pokemon,
    upsert_evolution_chains,
    upsert_pokemon_abilities,
    upsert_pokemon_detail,
)


def parse_args(argv: list[str]) -> argparse.Namespace:
    paths = CrawlerPaths()
    parser = argparse.ArgumentParser(
        description="Crawl 52Poke data and update LocalDex SQLite data."
    )
    parser.add_argument("--db-path", type=Path, default=paths.default_db_path)
    parser.add_argument("--raw-dir", type=Path, default=paths.default_raw_dir)
    parser.add_argument("--refresh-raw", action="store_true", help="Fetch pages even if cache exists.")
    parser.add_argument("--dry-run", action="store_true", help="Parse and print without writing SQLite.")
    subparsers = parser.add_subparsers(dest="command")

    pokemon = subparsers.add_parser("pokemon", help="Crawl Pokemon list, detail, images, abilities.")
    add_runtime_flags(pokemon)
    add_pokemon_filters(pokemon)
    pokemon_abilities = subparsers.add_parser("pokemon-abilities", help="Only refresh Pokemon ability records.")
    add_runtime_flags(pokemon_abilities)
    add_pokemon_filters(pokemon_abilities)
    evolution = subparsers.add_parser("evolution", help="Crawl Pokemon evolution chain data.")
    add_runtime_flags(evolution)
    add_pokemon_filters(evolution)

    form_changes = subparsers.add_parser("form-changes", help="Generate form change chains (mega, gigantamax, fusion, etc.) from existing form data.")
    add_runtime_flags(form_changes)

    form_items = subparsers.add_parser("form-items", help="Extract and write form required-item bindings.")
    add_runtime_flags(form_items)
    form_items.add_argument("--output", choices=["summary", "json", "sql"], default="summary")

    learnsets = subparsers.add_parser("learnsets", help="Crawl Pokemon generation learnsets.")
    add_runtime_flags(learnsets)
    add_pokemon_filters(learnsets)

    catalog = subparsers.add_parser("catalog", help="Crawl move, ability, and item catalog detail pages.")
    add_runtime_flags(catalog)
    catalog.add_argument("--moves", action=argparse.BooleanOptionalAction, default=True)
    catalog.add_argument("--abilities", action=argparse.BooleanOptionalAction, default=True)
    catalog.add_argument("--items", action=argparse.BooleanOptionalAction, default=True)
    catalog.add_argument("--move-limit", type=int)
    catalog.add_argument("--ability-limit", type=int)
    catalog.add_argument("--item-limit", type=int)
    catalog.add_argument("--name", action="append", default=[], help="Catalog Chinese name filter.")
    add_catalog_range_filters(catalog)

    champions = subparsers.add_parser("champions", help="Crawl Pokemon Champions seasons, regulations, Pokemon, and items.")
    add_runtime_flags(champions)

    field_effects_parser = subparsers.add_parser("field-effects", help="Crawl field effects (weather, terrain, status, etc.) from Wiki.")
    add_runtime_flags(field_effects_parser)
    field_effects_parser.add_argument("--kind", choices=["weather", "terrain", "status", "side", "field"], help="Only crawl a specific kind.")
    field_effects_parser.add_argument("--name", action="append", default=[], help="Only crawl specific effects by Chinese name.")

    usage_parser = subparsers.add_parser("usage", help="Crawl Pokemon usage stats from pokechamdb.com.")
    add_runtime_flags(usage_parser)
    usage_parser.add_argument("--season", required=True, help="Season code, e.g. M-2")
    usage_parser.add_argument("--format", dest="battle_format", default="single", help="Battle format: single, double, tournament (default: single)")
    usage_parser.add_argument("--event-id", help="Event ID (only for tournament format).")
    usage_parser.add_argument("--limit", type=int, help="Limit number of Pokemon to fetch details for.")
    usage_parser.add_argument("--pokemon", action="append", default=[], help="Only fetch details for specific Pokemon slugs.")
    usage_parser.add_argument("--interval", type=float, help="Request interval in seconds (default: 4.0).")

    all_parser = subparsers.add_parser("all", help="Crawl catalog, Pokemon details, learnsets, and Champions data.")
    add_runtime_flags(all_parser)
    add_pokemon_filters(all_parser)
    all_parser.add_argument("--moves", action=argparse.BooleanOptionalAction, default=True)
    all_parser.add_argument("--abilities", action=argparse.BooleanOptionalAction, default=True)
    all_parser.add_argument("--items", action=argparse.BooleanOptionalAction, default=True)
    all_parser.add_argument("--champions", action=argparse.BooleanOptionalAction, default=True)
    all_parser.add_argument("--move-limit", type=int)
    all_parser.add_argument("--ability-limit", type=int)
    all_parser.add_argument("--item-limit", type=int)

    # Backward-compatible default from the first Python extraction step.
    add_pokemon_filters(parser)
    return parser.parse_args(argv)


def add_catalog_range_filters(parser: argparse.ArgumentParser) -> None:
    """为 catalog 子命令添加编号范围筛选参数。"""
    parser.add_argument("--start-number", type=int, help="Start number for moves/abilities (inclusive).")
    parser.add_argument("--end-number", type=int, help="End number for moves/abilities (inclusive).")


def add_pokemon_filters(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--start-dex", type=int)
    parser.add_argument("--end-dex", type=int)
    parser.add_argument("--limit", type=int)
    parser.add_argument(
        "--pokemon",
        action="append",
        default=[],
        help="Pokemon Chinese name or legacy id. Can be repeated or comma-separated.",
    )
    parser.add_argument("--generations", default="", help="Comma-separated generation numbers for learnsets.")


def add_runtime_flags(parser: argparse.ArgumentParser) -> None:
    parser.add_argument("--refresh-raw", action="store_true", default=argparse.SUPPRESS, help="Fetch pages even if cache exists.")
    parser.add_argument("--dry-run", action="store_true", default=argparse.SUPPRESS, help="Parse and print without writing SQLite.")
    parser.add_argument("--clean", action="store_true", default=argparse.SUPPRESS, help="Clear existing data before crawling (delete then re-insert).")


def _git_lfs_uninstall_local() -> bool:
    """在本地仓库级别禁用 Git LFS filter，防止写库期间 clean filter 不断缓存中间状态。"""
    try:
        subprocess.run(
            ["git", "lfs", "uninstall", "--local"],
            cwd=Path(__file__).resolve().parents[3],  # 仓库根目录
            capture_output=True,
            check=True,
        )
        print("[lfs] Disabled Git LFS filter (local) before database write.")
        return True
    except (subprocess.CalledProcessError, FileNotFoundError):
        # git 或 git-lfs 不可用时静默跳过
        return False


def _git_lfs_install_local() -> None:
    """恢复本地仓库的 Git LFS filter。"""
    try:
        subprocess.run(
            ["git", "lfs", "install", "--local"],
            cwd=Path(__file__).resolve().parents[3],
            capture_output=True,
            check=True,
        )
        print("[lfs] Re-enabled Git LFS filter (local) after database write.")
    except (subprocess.CalledProcessError, FileNotFoundError):
        pass


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    command = args.command or "pokemon-abilities"
    conn = connect(args.db_path)
    fetcher = PageFetcher(args.raw_dir, refresh_raw=args.refresh_raw)

    # dry-run 不写库，无需禁用 LFS filter
    lfs_disabled = False
    if not args.dry_run:
        lfs_disabled = _git_lfs_uninstall_local()

    try:
        result = _dispatch(conn, fetcher, args, command)
    finally:
        if lfs_disabled:
            _git_lfs_install_local()

    return result


def _dispatch(conn, fetcher: PageFetcher, args, command: str) -> int:
    if command == "catalog":
        return crawl_catalog(conn, fetcher, args)
    if command == "pokemon":
        return crawl_pokemon(conn, fetcher, args)
    if command == "pokemon-abilities":
        return crawl_pokemon_abilities(conn, fetcher, args)
    if command == "evolution":
        return crawl_evolution(conn, fetcher, args)
    if command == "form-changes":
        return crawl_form_changes(conn, args)
    if command == "form-items":
        return crawl_form_items(conn, fetcher, args)
    if command == "learnsets":
        return crawl_learnsets(conn, fetcher, args)
    if command == "champions":
        return crawl_champions(conn, fetcher, args)
    if command == "field-effects":
        return crawl_field_effects(conn, fetcher, args)
    if command == "usage":
        return crawl_usage(conn, args)
    if command == "all":
        clean = getattr(args, "clean", False)
        if clean and not args.dry_run:
            counts = clear_all(conn)
            print(f"[clean] Cleared all data: {counts}")
            # 已经全部清除，子命令不需要再单独清除
            args.clean = False
        catalog_result = crawl_catalog(conn, fetcher, args)
        pokemon_result = crawl_pokemon(conn, fetcher, args)
        evolution_result = crawl_evolution(conn, fetcher, args)
        learnset_result = crawl_learnsets(conn, fetcher, args)
        champions_result = crawl_champions(conn, fetcher, args) if getattr(args, "champions", True) else 0
        field_effects_result = crawl_field_effects(conn, fetcher, args)
        return catalog_result or pokemon_result or evolution_result or learnset_result or champions_result or field_effects_result
    raise ValueError(f"Unsupported command: {command}")


def crawl_catalog(conn, fetcher: PageFetcher, args) -> int:
    clean = getattr(args, "clean", False)
    name_filters = parse_name_filters(getattr(args, "name", []))
    totals = {"moves": 0, "abilities": 0, "items": 0}

    if clean and not args.dry_run:
        if getattr(args, "moves", True):
            n = clear_moves(conn)
            print(f"[clean] Deleted {n} moves.")
        if getattr(args, "abilities", True):
            n = clear_abilities(conn)
            print(f"[clean] Deleted {n} abilities.")
        if getattr(args, "items", True):
            n = clear_items(conn)
            print(f"[clean] Deleted {n} items.")

    if getattr(args, "moves", True):
        page = fetcher.load_or_fetch("move-list", MOVE_LIST_URL)
        seeds = filter_by_name(parse_move_list_page(page.html), name_filters)
        seeds = filter_by_number_range(seeds, args)
        if getattr(args, "move_limit", None) is not None:
            seeds = seeds[: args.move_limit]
        for seed in seeds:
            detail = fetcher.load_or_fetch(f"move-{slugify(seed.name_zh)}", seed.detail_url)
            payload = normalize_move_detail_page(detail, seed)
            if args.dry_run:
                num_str = f"#{payload['number']:03d}" if payload.get('number') is not None else "#---"
                print(f"[dry-run] move {num_str} {seed.name_zh}: gen={payload['introduced_generation']} changes={len(payload['generations'])}")
            else:
                upsert_move_detail(conn, payload)
                num_str = f"#{payload['number']:03d}" if payload.get('number') is not None else "#---"
                print(f"[updated] move {num_str} {seed.name_zh}: gen={payload['introduced_generation']} changes={len(payload['generations'])}")
            totals["moves"] += 1

    if getattr(args, "abilities", True):
        page = fetcher.load_or_fetch("ability-list", ABILITY_LIST_URL)
        seeds = filter_by_name(parse_ability_list_page(page.html), name_filters)
        seeds = filter_by_number_range(seeds, args)
        if getattr(args, "ability_limit", None) is not None:
            seeds = seeds[: args.ability_limit]
        for seed in seeds:
            detail = fetcher.load_or_fetch(f"ability-{slugify(seed.name_zh)}", seed.detail_url)
            payload = normalize_ability_detail_page(detail, seed)
            if args.dry_run:
                print(f"[dry-run] ability {seed.name_zh}: generations={len(payload['generations'])}")
            else:
                upsert_ability_detail(conn, payload)
                print(f"[updated] ability {seed.name_zh}: generations={len(payload['generations'])}")
            totals["abilities"] += 1

    if getattr(args, "items", True):
        page = fetcher.load_or_fetch("item-list", ITEM_LIST_URL)
        seeds = filter_by_name(parse_item_list_page(page.html), name_filters)
        if getattr(args, "item_limit", None) is not None:
            seeds = seeds[: args.item_limit]
        skipped_items = 0
        for seed in seeds:
            try:
                detail = fetcher.load_or_fetch(f"item-{slugify(seed.name_zh)}", seed.detail_url)
            except (PageNotFoundError, Exception) as e:
                print(f"[skip] item {seed.name_zh}: {e}")
                skipped_items += 1
                continue
            payload = normalize_item_detail_page(detail, seed)
            gen_info = f" gen={payload.get('introduced_generation') or '-'} changes={len(payload.get('generations', []))}"
            img_info = " img=✓" if payload.get("image_url") else ""
            if args.dry_run:
                print(f"[dry-run] item {seed.name_zh}: category={payload.get('category') or '-'}{gen_info}{img_info}")
            else:
                upsert_item_detail(conn, payload)
                print(f"[updated] item {seed.name_zh}: category={payload.get('category') or '-'}{gen_info}{img_info}")
            totals["items"] += 1
        if skipped_items:
            print(f"[warn] Skipped {skipped_items} items due to fetch errors.")

    print(f"Catalog finished. {totals} dryRun={args.dry_run}")
    return 0


def crawl_pokemon(conn, fetcher: PageFetcher, args) -> int:
    clean = getattr(args, "clean", False)
    if clean and not args.dry_run:
        n = clear_pokemon(conn)
        print(f"[clean] Deleted {n} pokemon.")
    seeds = selected_pokemon_seeds(fetcher, args)
    updated = 0
    for seed in seeds:
        page = fetcher.load_or_fetch(pokemon_cache_key(seed.dex_number), seed.detail_url)
        payload = normalize_pokemon_detail_page(page, seed)
        if args.dry_run:
            print(
                f"[dry-run] pokemon #{seed.dex_number:04d} {seed.name_zh}: "
                f"types={payload.get('primary_type') or '-'} {payload.get('secondary_type') or ''} "
                f"abilities={payload.get('abilities') or '-'}"
            )
            continue
        upsert_pokemon_detail(conn, payload)
        updated += 1
        print(f"[updated] pokemon #{seed.dex_number:04d} {seed.name_zh}")
    print(f"Pokemon finished. matched={len(seeds)} updated={updated} dryRun={args.dry_run}")
    if not args.dry_run:
        crawl_form_items(conn, fetcher, args)
    return 0


def crawl_pokemon_abilities(conn, fetcher: PageFetcher, args) -> int:
    clean = getattr(args, "clean", False)
    if clean and not args.dry_run:
        # pokemon-abilities 只清除特性关联数据，不清除宝可梦主表
        conn.executescript("""
            DROP TABLE IF EXISTS pokemon_form_abilities;
            CREATE TABLE IF NOT EXISTS pokemon_form_abilities (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                form_id INTEGER NOT NULL REFERENCES pokemon_forms(id) ON DELETE CASCADE,
                ability_id INTEGER REFERENCES abilities(id),
                ability_name_zh TEXT NOT NULL,
                slot INTEGER NOT NULL,
                is_hidden INTEGER NOT NULL DEFAULT 0,
                generation_start INTEGER,
                generation_end INTEGER,
                UNIQUE (form_id, slot, generation_start)
            );
            CREATE INDEX IF NOT EXISTS idx_form_abilities_form ON pokemon_form_abilities(form_id);
            CREATE INDEX IF NOT EXISTS idx_form_abilities_ability ON pokemon_form_abilities(ability_id, form_id);
        """)
        print("[clean] Rebuilt pokemon_form_abilities table.")
    names = parse_name_filters(args.pokemon)
    rows = select_pokemon(
        conn,
        start_dex=args.start_dex,
        end_dex=args.end_dex,
        limit=args.limit,
        names=names or None,
    )
    if not rows:
        print("No Pokemon rows matched the crawler filters.")
        return 0
    updated = 0
    for row in rows:
        page = fetcher.load_or_fetch(cache_key(row), pokemon_source_url(row))
        parsed = parse_pokemon_abilities(page.html)
        if args.dry_run:
            changes = ", ".join(f"gen<{item.before_generation}:{item.ability}" for item in parsed.changes) or "-"
            print(
                f"[dry-run] #{row.dex_number:04d} {row.name_zh}: "
                f"abilities={parsed.abilities or '-'} hidden={parsed.hidden_ability or '-'} changes={changes}"
            )
            continue
        summary = upsert_pokemon_abilities(conn, row, page, parsed)
        updated += 1
        print(
            f"[updated] #{row.dex_number:04d} {row.name_zh}: "
            f"abilities={summary.abilities or '-'} hidden={summary.hidden_ability or '-'} "
            f"forms={summary.form_count}"
        )
    print(f"Pokemon abilities finished. matched={len(rows)} updated={updated} dryRun={args.dry_run}")
    return 0


def crawl_evolution(conn, fetcher: PageFetcher, args) -> int:
    """爬取宝可梦进化链数据。

    使用已缓存的宝可梦详情页 HTML 解析进化关系，写入 evolution_chains 表。
    """
    clean = getattr(args, "clean", False)
    if clean and not args.dry_run:
        conn.executescript("""
            DROP TABLE IF EXISTS evolution_chains;
            CREATE TABLE IF NOT EXISTS evolution_chains (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                chain_id INTEGER NOT NULL,
                from_pokemon_id INTEGER REFERENCES pokemon(id) ON DELETE CASCADE,
                to_pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
                from_form_id INTEGER REFERENCES pokemon_forms(id) ON DELETE SET NULL,
                to_form_id INTEGER REFERENCES pokemon_forms(id) ON DELETE SET NULL,
                stage INTEGER NOT NULL DEFAULT 0,
                sort_order INTEGER NOT NULL DEFAULT 0,
                evolution_method TEXT,
                evolution_condition TEXT,
                evolution_item TEXT,
                evolution_level INTEGER,
                notes TEXT
            );
            CREATE INDEX IF NOT EXISTS idx_evo_chain ON evolution_chains(chain_id);
            CREATE INDEX IF NOT EXISTS idx_evo_to ON evolution_chains(to_pokemon_id);
            CREATE INDEX IF NOT EXISTS idx_evo_from ON evolution_chains(from_pokemon_id);
        """)
        print("[clean] Rebuilt evolution_chains table.")

    names = parse_name_filters(args.pokemon)
    rows = select_pokemon(
        conn,
        start_dex=args.start_dex,
        end_dex=args.end_dex,
        limit=args.limit,
        names=names or None,
    )
    if not rows:
        print("No Pokemon rows matched the crawler filters.")
        return 0

    updated = 0
    total_steps = 0
    skipped = 0
    for idx, row in enumerate(rows, 1):
        page = fetcher.load_or_fetch(cache_key(row), pokemon_source_url(row))
        steps = parse_evolution_chain(page.html, row.name_zh)
        if not steps:
            skipped += 1
            continue
        if args.dry_run:
            print(
                f"[{idx}/{len(rows)}] dry-run #{row.dex_number:04d} {row.name_zh}: "
                f"{len(steps)} evolution steps"
            )
            for step in steps:
                print(f"  {step['from_name']} -> {step['to_name']} ({step['method'] or '?'})")
            continue
        count = upsert_evolution_chains(conn, row.id, steps)
        total_steps += count
        updated += 1
        if count > 0:
            print(f"[{idx}/{len(rows)}] #{row.dex_number:04d} {row.name_zh}: {count} steps")

    print(
        f"Evolution finished. matched={len(rows)} updated={updated} "
        f"steps={total_steps} skipped={skipped} dryRun={args.dry_run}"
    )

    # 自动生成形态变化链（超级进化、超极巨化、合体等）
    print("\n--- Generating form change chains ---")
    form_stats = generate_form_change_chains(conn, dry_run=args.dry_run)
    print(f"Form changes: {form_stats}")
    return 0


def crawl_form_changes(conn, args) -> int:
    """独立的形态变化链生成命令。"""
    dry_run = getattr(args, "dry_run", False)
    stats = generate_form_change_chains(conn, dry_run=dry_run)
    print(f"Form change chains generated: {stats}")
    return 0


def crawl_form_items(conn, fetcher: PageFetcher, args) -> int:
    """刷新 pokemon_forms.required_item_id。

    主爬虫和手动修复命令共用同一套提取、推导和写库逻辑。
    """
    dry_run = getattr(args, "dry_run", False)
    output = getattr(args, "output", "summary")
    bindings = extract_all_form_item_bindings(fetcher=fetcher, raw_dir=getattr(args, "raw_dir", None))
    output_bindings = collect_form_item_bindings(conn, bindings, include_derived=True)

    if output == "json":
        print(bindings_to_json(output_bindings))
    elif output == "sql":
        print(bindings_to_sql(output_bindings))

    result = apply_form_item_bindings(conn, bindings, dry_run=dry_run, include_derived=True)
    missing_items = len(result["missing_items"])
    missing_forms = len(result["missing_forms"])
    print(
        "Form items finished. "
        f"bindings={result['bindings']} derived={result['derived']} matched={result['matched']} "
        f"updated={result['updated']} unchanged={result['unchanged']} "
        f"missingItems={missing_items} missingForms={missing_forms} dryRun={dry_run}"
    )
    if missing_items:
        examples = ", ".join(item["itemNameZh"] for item in result["missing_items"][:5])
        print(f"[warn] Missing item examples: {examples}")
    if missing_forms:
        examples = ", ".join(f"{item['pokemonNameZh']} - {item['formNameZh']}" for item in result["missing_forms"][:5])
        print(f"[warn] Missing form examples: {examples}")
    return 0


def crawl_learnsets(conn, fetcher: PageFetcher, args) -> int:
    clean = getattr(args, "clean", False)
    if clean and not args.dry_run:
        conn.executescript("""
            DROP TABLE IF EXISTS pokemon_moves;
            CREATE TABLE IF NOT EXISTS pokemon_moves (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                pokemon_id INTEGER NOT NULL REFERENCES pokemon(id) ON DELETE CASCADE,
                form_id INTEGER NOT NULL REFERENCES pokemon_forms(id) ON DELETE CASCADE,
                move_id INTEGER REFERENCES moves(id),
                move_name_zh TEXT NOT NULL,
                generation INTEGER NOT NULL,
                game_version_code TEXT,
                learn_method TEXT NOT NULL,
                level INTEGER,
                tm_number TEXT,
                sort_order INTEGER NOT NULL DEFAULT 0,
                notes TEXT
            );
            CREATE UNIQUE INDEX IF NOT EXISTS uq_pokemon_moves ON pokemon_moves(
                form_id, move_name_zh, generation,
                COALESCE(game_version_code, ''),
                learn_method, COALESCE(level, -1), COALESCE(tm_number, '')
            );
            CREATE INDEX IF NOT EXISTS idx_pokemon_moves_lookup ON pokemon_moves(pokemon_id, generation, form_id, game_version_code, learn_method, sort_order);
            CREATE INDEX IF NOT EXISTS idx_pokemon_moves_form_gen ON pokemon_moves(form_id, generation);
            CREATE INDEX IF NOT EXISTS idx_pokemon_moves_move ON pokemon_moves(move_id);
        """)
        print("[clean] Rebuilt pokemon_moves table.")
    seeds = selected_pokemon_seeds(fetcher, args)
    generations_filter = parse_generations(args.generations)
    updated = 0
    entries = 0
    skipped = 0
    errors = 0
    total_seeds = len(seeds)
    for idx, seed in enumerate(seeds, 1):
        row = conn.execute("SELECT id FROM pokemon WHERE dex_number = ? OR name_zh = ?", (seed.dex_number, seed.name_zh)).fetchone()
        if not row and not args.dry_run:
            try:
                detail = fetcher.load_or_fetch(pokemon_cache_key(seed.dex_number), seed.detail_url)
                pokemon_id = upsert_pokemon_detail(conn, normalize_pokemon_detail_page(detail, seed))
            except (PageNotFoundError, Exception) as e:
                print(f"[{idx}/{total_seeds}] SKIP #{seed.dex_number:04d} {seed.name_zh}: cannot load detail ({e})")
                skipped += 1
                continue
        else:
            pokemon_id = int(row["id"]) if row else -1
        # 默认只爬最新世代（gen9）+ Champions(99)，除非用户通过 --generations 指定
        generations = generations_filter or sorted(set(seed.generations or (9,)) | {99})
        for generation in generations:
            url = build_learnset_page_url(seed.name_zh, generation)
            if not url:
                continue
            try:
                page = fetcher.load_or_fetch(learnset_cache_key(seed.dex_number, generation), url)
            except PageNotFoundError:
                # 该世代没有招式页面，跳过
                skipped += 1
                continue
            except Exception as e:
                print(f"[{idx}/{total_seeds}] ERROR #{seed.dex_number:04d} {seed.name_zh} gen{generation}: {e}")
                errors += 1
                continue
            form_learnsets = parse_learnset_page(page, generation)
            # form_learnsets: {"default": [...], "骑白马的样子": [...], ...}
            total_moves = sum(len(moves) for moves in form_learnsets.values())
            if total_moves == 0:
                skipped += 1
                continue
            if args.dry_run:
                forms_info = ", ".join(f"{k}={len(v)}" for k, v in form_learnsets.items())
                print(f"[{idx}/{total_seeds}] dry-run #{seed.dex_number:04d} {seed.name_zh} gen{generation}: {total_moves} moves ({forms_info})")
            else:
                entries += upsert_pokemon_moves(conn, pokemon_id, generation, form_learnsets)
                updated += 1
                forms_info = ", ".join(f"{k}={len(v)}" for k, v in form_learnsets.items())
                print(f"[{idx}/{total_seeds}] #{seed.dex_number:04d} {seed.name_zh} gen{generation}: {total_moves} moves ({forms_info})")
    print(f"Learnsets finished. updated={updated} entries={entries} skipped={skipped} errors={errors} dryRun={args.dry_run}")

    # 自动补全空壳招式（由 ensure_move 创建但缺少详情的记录）
    if not args.dry_run:
        _backfill_incomplete_moves(conn, fetcher)

    return 0


def crawl_champions(conn, fetcher: PageFetcher, args) -> int:
    clean = getattr(args, "clean", False)
    if clean and not args.dry_run:
        n = clear_champions(conn)
        print(f"[clean] Deleted {n} Champions rows.")

    seasons_page = fetcher.load_or_fetch("champions-seasons", CHAMPIONS_SEASONS_URL)
    regulations_page = fetcher.load_or_fetch("champions-regulations", CHAMPIONS_REGULATIONS_URL)
    items_page = fetcher.load_or_fetch("champions-items", CHAMPIONS_ITEMS_URL)
    payload = normalize_champions_pages(seasons_page, regulations_page, items_page)

    seasons = payload.get("seasons") or []
    regulations = payload.get("regulations") or []
    items = payload.get("items") or []
    pokemon_count = sum(len(regulation.pokemon) for regulation in regulations)
    battle_item_count = sum(1 for item in items if item.is_battle_item)
    linked_item_count = None

    if args.dry_run:
        for season in seasons:
            print(
                f"[dry-run] champions season {season.season_code}: "
                f"regulation={season.regulation_code} period={season.period_text or '-'}"
            )
        for regulation in regulations:
            print(
                f"[dry-run] champions regulation {regulation.regulation_code}: "
                f"pokemon={len(regulation.pokemon)} items={battle_item_count} "
                f"period={regulation.period_text or '-'}"
            )
    else:
        summary = upsert_champions_data(conn, payload)
        linked_item_count = summary.get("linkedItems")
        print(f"[updated] champions: {summary}")

    linked_info = f"linkedItems={linked_item_count} " if linked_item_count is not None else ""
    print(
        "Champions finished. "
        f"seasons={len(seasons)} regulations={len(regulations)} "
        f"pokemon={pokemon_count} items={len(items)} battleItems={battle_item_count} "
        f"{linked_info}dryRun={args.dry_run}"
    )
    return 0


def crawl_field_effects(conn, fetcher: PageFetcher, args) -> int:
    """爬取场地效果（天气、地形、状态、屏障、气场）。"""
    clean = getattr(args, "clean", False)
    dry_run = getattr(args, "dry_run", False)

    if clean and not dry_run:
        n = clear_field_effects(conn)
        print(f"[clean] Deleted {n} field_effects rows.")

    # 筛选 seeds
    seeds = list(ALL_FIELD_EFFECT_SEEDS)
    kind_filter = getattr(args, "kind", None)
    name_filters = parse_name_filters(getattr(args, "name", []))

    KIND_MAP = {"weather": KIND_WEATHER, "terrain": KIND_TERRAIN, "status": KIND_STATUS, "side": KIND_SIDE, "field": KIND_FIELD}
    if kind_filter:
        kind_int = KIND_MAP[kind_filter]
        seeds = [s for s in seeds if s.kind == kind_int]
    if name_filters:
        seeds = [s for s in seeds if s.name_zh in name_filters]

    updated = 0
    errors = 0
    total = len(seeds)

    for idx, seed in enumerate(seeds, 1):
        url = build_field_effect_page_url(seed)
        cache_name = f"field-effect-{seed.kind}-{slugify(seed.name_zh)}"
        try:
            page = fetcher.load_or_fetch(cache_name, url)
        except PageNotFoundError:
            print(f"[{idx}/{total}] SKIP {seed.kind}/{seed.name_zh}: page not found")
            errors += 1
            continue
        except Exception as e:
            print(f"[{idx}/{total}] ERROR {seed.kind}/{seed.name_zh}: {e}")
            errors += 1
            continue

        payload = normalize_field_effect_detail_page(page, seed)
        gen_count = len(payload.get("generations") or [])
        desc_len = len(payload.get("description") or "")

        if dry_run:
            print(
                f"[{idx}/{total}] dry-run {seed.kind}/{seed.name_zh}: "
                f"desc={desc_len}chars gen_changes={gen_count}"
            )
        else:
            upsert_field_effect_detail(conn, payload)
            print(
                f"[{idx}/{total}] updated {seed.kind}/{seed.name_zh}: "
                f"desc={desc_len}chars gen_changes={gen_count}"
            )
            updated += 1

    print(
        f"Field effects finished. total={total} updated={updated} "
        f"errors={errors} dryRun={dry_run}"
    )
    return 0


def crawl_usage(conn, args) -> int:
    """从 pokechamdb.com 爬取使用率排名数据。"""
    from .parsers.pokechamdb_usage import parse_usage_detail, parse_usage_list

    dry_run = getattr(args, "dry_run", False)
    clean = getattr(args, "clean", False)
    season_code = args.season
    fmt = args.battle_format
    event_id = getattr(args, "event_id", None)
    limit = getattr(args, "limit", None)
    pokemon_filters = parse_name_filters(getattr(args, "pokemon", []))

    # 查找 season_id
    row = conn.execute(
        "SELECT id FROM champions_seasons WHERE season_code = ?",
        (season_code,),
    ).fetchone()
    if not row:
        print(f"[error] Season '{season_code}' not found in champions_seasons table.")
        print("  Hint: Run 'npm run crawl:champions' first to populate seasons data.")
        return 1
    season_id = int(row["id"])
    print(f"Season: {season_code} (id={season_id}), format={fmt}")

    if clean and not dry_run:
        n = clear_usage_data(conn, season_id=season_id, fmt=fmt)
        print(f"[clean] Deleted {n} usage records for {season_code}/{fmt}.")

    # 初始化 pokechamdb fetcher
    raw_dir = args.raw_dir / "pokechamdb"
    interval = getattr(args, "interval", None)
    pcdb_fetcher = PokechamdbFetcher(
        raw_dir=raw_dir,
        refresh_raw=args.refresh_raw,
        **(dict(request_interval=interval) if interval is not None else {}),
    )

    # 1. 获取列表页
    print(f"\nFetching usage list for {season_code}/{fmt}...")
    list_page = pcdb_fetcher.fetch_usage_list(season_code, fmt, event_id)
    pokemon_list = parse_usage_list(list_page.html)

    if not pokemon_list:
        print("[warn] No Pokemon found in usage list page. The RSC payload structure may have changed.")
        return 0

    print(f"Found {len(pokemon_list)} Pokemon in usage rankings.")

    # 应用筛选
    if pokemon_filters:
        pokemon_list = [p for p in pokemon_list if p.slug in pokemon_filters or p.name_zh in pokemon_filters]
        print(f"Filtered to {len(pokemon_list)} Pokemon.")
    if limit is not None:
        pokemon_list = pokemon_list[:limit]
        print(f"Limited to top {limit} Pokemon.")

    # 2. 写入主表
    if dry_run:
        for entry in pokemon_list:
            print(f"  [dry-run] #{entry.rank} {entry.name_zh or entry.slug} (slug={entry.slug})")
        print(f"\n[dry-run] Would write {len(pokemon_list)} usage_pokemon records.")
    else:
        slug_to_id = upsert_usage_pokemon(
            conn, season_id, fmt, event_id, pokemon_list, fetched_at=list_page.fetched_at
        )
        print(f"Wrote {len(slug_to_id)} usage_pokemon records.")

    # 3. 逐个获取详情页
    print(f"\nFetching detail pages...")
    detail_count = 0
    detail_errors = 0
    total = len(pokemon_list)

    for idx, entry in enumerate(pokemon_list, 1):
        try:
            detail_page = pcdb_fetcher.fetch_pokemon_detail(entry.slug, season_code, fmt, event_id)
        except Exception as e:
            print(f"  [{idx}/{total}] ERROR {entry.slug}: {e}")
            detail_errors += 1
            continue

        detail = parse_usage_detail(detail_page.html, entry.slug)
        if not detail.name_zh:
            detail.name_zh = entry.name_zh

        if dry_run:
            print(
                f"  [{idx}/{total}] dry-run {entry.slug} ({detail.name_zh}): "
                f"moves={len(detail.moves)} items={len(detail.items)} "
                f"abilities={len(detail.abilities)} natures={len(detail.natures)} "
                f"partners={len(detail.partners)} evs={len(detail.ev_spreads)}"
            )
        else:
            usage_pokemon_id = slug_to_id.get(entry.slug)
            if not usage_pokemon_id:
                print(f"  [{idx}/{total}] SKIP {entry.slug}: no usage_pokemon_id")
                continue
            stats = upsert_usage_detail(conn, usage_pokemon_id, detail)
            print(
                f"  [{idx}/{total}] {entry.slug} ({detail.name_zh}): "
                f"moves={stats['moves']} items={stats['items']} "
                f"abilities={stats['abilities']} natures={stats['natures']} "
                f"partners={stats['partners']} evs={stats['ev_spreads']}"
            )
        detail_count += 1

    print(
        f"\nUsage crawl finished. "
        f"season={season_code} format={fmt} "
        f"pokemon={total} details={detail_count} errors={detail_errors} "
        f"dryRun={dry_run}"
    )
    return 0


def _backfill_incomplete_moves(conn, fetcher: PageFetcher) -> None:
    """补全由 ensure_move 创建的空壳招式记录（缺少 type_name 等详情）。"""
    rows = conn.execute(
        "SELECT id, name_zh FROM moves WHERE type_name IS NULL OR type_name = ''"
    ).fetchall()
    if not rows:
        return
    print(f"\n[backfill] 发现 {len(rows)} 个空壳招式，正在补全详情...")
    success = 0
    for row in rows:
        name_zh = row["name_zh"]
        detail_url = build_move_page_url(name_zh)
        try:
            page = fetcher.load_or_fetch(f"move-{slugify(name_zh)}", detail_url)
        except (PageNotFoundError, Exception):
            print(f"  [backfill] SKIP {name_zh}: 无法获取详情页")
            continue
        # 从列表页缓存中查找 seed 信息
        list_page = fetcher.load_or_fetch("move-list", MOVE_LIST_URL)
        all_seeds = parse_move_list_page(list_page.html)
        seed = next((s for s in all_seeds if s.name_zh == name_zh), None)
        if not seed:
            # 列表页中没有该招式，构建最小 seed
            from .parsers.moves import MoveSeed
            seed = MoveSeed(name_zh=name_zh, detail_url=detail_url)
        payload = normalize_move_detail_page(page, seed)
        upsert_move_detail(conn, payload)
        success += 1
    print(f"  [backfill] 完成，补全了 {success}/{len(rows)} 个招式。")


def selected_pokemon_seeds(fetcher: PageFetcher, args) -> list:
    page = fetcher.load_or_fetch("pokemon-list-simple", POKEMON_LIST_URL)
    seeds = parse_pokemon_list_page(page.html)
    names = parse_name_filters(args.pokemon)
    if args.start_dex is not None:
        seeds = [seed for seed in seeds if seed.dex_number >= args.start_dex]
    if args.end_dex is not None:
        seeds = [seed for seed in seeds if seed.dex_number <= args.end_dex]
    if names:
        seeds = [seed for seed in seeds if seed.name_zh in names or f"pokemon-{seed.dex_number:04d}" in names]
    if args.limit is not None:
        seeds = seeds[: args.limit]
    return seeds


def parse_name_filters(values: list[str]) -> list[str]:
    return [item.strip() for value in values for item in value.split(",") if item.strip()]


def parse_generations(value: str) -> list[int]:
    return [int(item) for item in value.split(",") if item.strip().isdigit()]


def filter_by_name(seeds, names: list[str]):
    if not names:
        return seeds
    return [seed for seed in seeds if seed.name_zh in names]


def filter_by_number_range(seeds, args):
    """按编号范围筛选 seeds（适用于 MoveSeed/AbilitySeed 等有 number 字段的对象）。"""
    start = getattr(args, "start_number", None)
    end = getattr(args, "end_number", None)
    if start is None and end is None:
        return seeds
    result = []
    for seed in seeds:
        num = getattr(seed, "number", None)
        if num is None or num == 0:
            # 没有编号的 seed 不受范围筛选影响（如道具）
            result.append(seed)
            continue
        if start is not None and num < start:
            continue
        if end is not None and num > end:
            continue
        result.append(seed)
    return result


if __name__ == "__main__":
    raise SystemExit(main())
