from __future__ import annotations

import argparse
from pathlib import Path
import sys

from .catalog import (
    parse_ability_list_page,
    parse_item_list_page,
    parse_move_list_page,
    normalize_ability_detail_page,
    normalize_item_detail_page,
    normalize_move_detail_page,
)
from .config import CrawlerPaths
from .fetcher import PageFetcher
from .html_tools import parse_pokemon_abilities
from .pokemon import (
    build_learnset_page_url,
    learnset_cache_key,
    normalize_pokemon_detail_page,
    parse_learnset_page,
    parse_pokemon_list_page,
    pokemon_cache_key,
)
from .sqlite_upsert import (
    PokemonRow,
    cache_key,
    connect,
    pokemon_source_url,
    select_pokemon,
    upsert_ability_detail,
    upsert_item_detail,
    upsert_move_detail,
    upsert_pokemon_abilities,
    upsert_pokemon_detail,
    upsert_pokemon_learnset,
)
from .utils import ABILITY_LIST_URL, ITEM_LIST_URL, MOVE_LIST_URL, POKEMON_LIST_URL, slugify


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

    all_parser = subparsers.add_parser("all", help="Crawl catalog, Pokemon details, and learnsets.")
    add_runtime_flags(all_parser)
    add_pokemon_filters(all_parser)
    all_parser.add_argument("--moves", action=argparse.BooleanOptionalAction, default=True)
    all_parser.add_argument("--abilities", action=argparse.BooleanOptionalAction, default=True)
    all_parser.add_argument("--items", action=argparse.BooleanOptionalAction, default=True)
    all_parser.add_argument("--move-limit", type=int)
    all_parser.add_argument("--ability-limit", type=int)
    all_parser.add_argument("--item-limit", type=int)

    # Backward-compatible default from the first Python extraction step.
    add_pokemon_filters(parser)
    return parser.parse_args(argv)


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


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv or sys.argv[1:])
    command = args.command or "pokemon-abilities"
    conn = connect(args.db_path)
    fetcher = PageFetcher(args.raw_dir, refresh_raw=args.refresh_raw)

    if command == "catalog":
        return crawl_catalog(conn, fetcher, args)
    if command == "pokemon":
        return crawl_pokemon(conn, fetcher, args)
    if command == "pokemon-abilities":
        return crawl_pokemon_abilities(conn, fetcher, args)
    if command == "learnsets":
        return crawl_learnsets(conn, fetcher, args)
    if command == "all":
        catalog_result = crawl_catalog(conn, fetcher, args)
        pokemon_result = crawl_pokemon(conn, fetcher, args)
        learnset_result = crawl_learnsets(conn, fetcher, args)
        return catalog_result or pokemon_result or learnset_result
    raise ValueError(f"Unsupported command: {command}")


def crawl_catalog(conn, fetcher: PageFetcher, args) -> int:
    name_filters = parse_name_filters(getattr(args, "name", []))
    totals = {"moves": 0, "abilities": 0, "items": 0}

    if getattr(args, "moves", True):
        page = fetcher.load_or_fetch("move-list", MOVE_LIST_URL)
        seeds = filter_by_name(parse_move_list_page(page.html), name_filters)
        if getattr(args, "move_limit", None) is not None:
            seeds = seeds[: args.move_limit]
        for seed in seeds:
            detail = fetcher.load_or_fetch(f"move-{slugify(seed.name_zh)}", seed.detail_url)
            payload = normalize_move_detail_page(detail, seed)
            if args.dry_run:
                print(f"[dry-run] move {seed.name_zh}: generations={len(payload['generations'])}")
            else:
                upsert_move_detail(conn, payload)
                print(f"[updated] move {seed.name_zh}: generations={len(payload['generations'])}")
            totals["moves"] += 1

    if getattr(args, "abilities", True):
        page = fetcher.load_or_fetch("ability-list", ABILITY_LIST_URL)
        seeds = filter_by_name(parse_ability_list_page(page.html), name_filters)
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
        for seed in seeds:
            detail = fetcher.load_or_fetch(f"item-{slugify(seed.name_zh)}", seed.detail_url)
            payload = normalize_item_detail_page(detail, seed)
            if args.dry_run:
                print(f"[dry-run] item {seed.name_zh}: category={payload.get('category') or '-'}")
            else:
                upsert_item_detail(conn, payload)
                print(f"[updated] item {seed.name_zh}: category={payload.get('category') or '-'}")
            totals["items"] += 1

    print(f"Catalog finished. {totals} dryRun={args.dry_run}")
    return 0


def crawl_pokemon(conn, fetcher: PageFetcher, args) -> int:
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
    return 0


def crawl_pokemon_abilities(conn, fetcher: PageFetcher, args) -> int:
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
            f"generationRecords={summary.generation_count}"
        )
    print(f"Pokemon abilities finished. matched={len(rows)} updated={updated} dryRun={args.dry_run}")
    return 0


def crawl_learnsets(conn, fetcher: PageFetcher, args) -> int:
    seeds = selected_pokemon_seeds(fetcher, args)
    generations_filter = parse_generations(args.generations)
    updated = 0
    entries = 0
    for seed in seeds:
        row = conn.execute("SELECT id FROM pokemon WHERE legacy_id = ? OR dex_number = ?", (f"pokemon-{seed.dex_number:04d}", seed.dex_number)).fetchone()
        if not row and not args.dry_run:
            detail = fetcher.load_or_fetch(pokemon_cache_key(seed.dex_number), seed.detail_url)
            pokemon_id = upsert_pokemon_detail(conn, normalize_pokemon_detail_page(detail, seed))
        else:
            pokemon_id = int(row["id"]) if row else -1
        generations = generations_filter or sorted(set(seed.generations or tuple(range(1, 10))))
        for generation in generations:
            url = build_learnset_page_url(seed.name_zh, generation)
            if not url:
                continue
            page = fetcher.load_or_fetch(learnset_cache_key(seed.dex_number, generation), url)
            parsed = parse_learnset_page(page, generation)
            if args.dry_run:
                print(f"[dry-run] learnset #{seed.dex_number:04d} {seed.name_zh} gen{generation}: {len(parsed['learnset'])} moves")
            else:
                entries += upsert_pokemon_learnset(conn, pokemon_id, generation, parsed)
                updated += 1
                print(f"[updated] learnset #{seed.dex_number:04d} {seed.name_zh} gen{generation}: {len(parsed['learnset'])} moves")
    print(f"Learnsets finished. pages={updated} entries={entries} dryRun={args.dry_run}")
    return 0


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


if __name__ == "__main__":
    raise SystemExit(main())
