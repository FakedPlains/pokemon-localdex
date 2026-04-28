# Python 52Poke Crawler

This package keeps crawling and page extraction independent from the web UI and API.

The crawler reads cached 52Poke raw pages from `data/raw`, optionally fetches missing or refreshed pages, parses page elements with Python (`requests` + `BeautifulSoup`), and updates `data/sqlite/localdex.sqlite` directly in small idempotent transactions.

Main entry point:

```bash
npm run crawl:52poke:db -- --start-dex 1 --end-dex 151
```

Subcommands:

```bash
npm run crawl:52poke:db -- catalog
npm run crawl:52poke:db -- pokemon --start-dex 1 --end-dex 151
npm run crawl:52poke:db -- learnsets --pokemon 皮卡丘 --generations 9
npm run crawl:52poke:db -- pokemon-abilities --pokemon 耿鬼
npm run crawl:52poke:all -- --start-dex 1 --end-dex 151
```

Useful options:

```bash
npm run crawl:52poke:db -- pokemon --pokemon 妙蛙花 --dry-run
npm run crawl:52poke:db -- catalog --name 十万伏特 --name 静电 --dry-run
npm run crawl:52poke:db -- pokemon --start-dex 1 --limit 20 --refresh-raw
npm run crawl:52poke:db -- --db-path data/sqlite/localdex.sqlite --raw-dir data/raw pokemon
```

Coverage:

- `catalog`: move, ability, and item list/detail pages, including generation-specific move and ability effects.
- `pokemon`: Pokemon detail pages, base fields, types, base stats, ability slots, generation ability changes, forms, and online image URLs.
- `learnsets`: Pokemon generation learnset pages, writing `pokemon_moves` and move stubs directly to SQLite.
- `pokemon-abilities`: focused compatibility updater for ability slots and generation ability records.

The previous npm commands `import:52poke` and `import:52poke:catalog` now point to this Python crawler so old workflows use the new module boundary.
