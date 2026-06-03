# Python 52Poke Crawler

This package keeps crawling and page extraction independent from the web UI and API.

The crawler reads cached 52Poke raw pages from `data/raw`, optionally fetches missing or refreshed pages, parses page elements with Python (`requests` + `BeautifulSoup`), and updates `data/sqlite/localdex.sqlite` directly in small idempotent transactions.

Main entry point:

```bash
npm run crawl -- --start-dex 1 --end-dex 151
```

Subcommands:

```bash
npm run crawl:catalog
npm run crawl:pokemon -- --start-dex 1 --end-dex 151
npm run crawl -- learnsets --pokemon 皮卡丘 --generations 9
npm run crawl -- pokemon-abilities --pokemon 耿鬼
npm run crawl:all -- --start-dex 1 --end-dex 151
npm run crawl -- usage --format single --limit 50
npm run crawl -- usage --format double --pokemon 黑鲁加 --refresh-raw
```

Useful options:

```bash
npm run crawl:pokemon -- --pokemon 妙蛙花 --dry-run
npm run crawl:catalog -- --name 十万伏特 --name 静电 --dry-run
npm run crawl:pokemon -- --start-dex 1 --limit 20 --refresh-raw
npm run crawl -- --db-path data/sqlite/localdex.sqlite --raw-dir data/raw pokemon
npm run crawl -- usage --clean --format single   # 全量重建单打使用率数据
```

Coverage:

- `catalog`: move, ability, and item list/detail pages, including generation-specific move and ability effects.
- `pokemon`: Pokemon detail pages, base fields, types, base stats, ability slots, generation ability changes, forms, and online image URLs.
- `learnsets`: Pokemon generation learnset pages, writing `pokemon_moves` and move stubs directly to SQLite.
- `pokemon-abilities`: focused compatibility updater for ability slots and generation ability records.
- `usage`: pokechamdb.com usage ranking data (single/double format), including moves, items, abilities, natures, EV spreads, and partner pokemon. Uses Chinese name matching with alias mapping for partner resolution.
