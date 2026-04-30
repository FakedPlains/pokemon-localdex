"""End-to-end test: parse cached pages and write to a temp DB."""
import json
import sqlite3
import tempfile
from pathlib import Path
from localdex_crawler.fetcher import RawPage
from localdex_crawler.pokemon import PokemonSeed, normalize_pokemon_detail_page
from localdex_crawler.sqlite_upsert import connect, upsert_pokemon_detail

# Use the real DB to get the schema
real_db = Path(__file__).resolve().parent.parent.parent / "data" / "sqlite" / "localdex.sqlite"
data_dir = Path(__file__).resolve().parent.parent.parent / "data" / "raw"

# Create a temp copy
import shutil
tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
tmp.close()
shutil.copy2(real_db, tmp.name)
print(f"Using temp DB: {tmp.name}")

conn = connect(Path(tmp.name))

# Clear existing pokemon data
conn.execute("DELETE FROM pokemon_learnsets")
conn.execute("DELETE FROM pokemon_form_images")
conn.execute("DELETE FROM pokemon_form_abilities")
conn.execute("DELETE FROM pokemon_form_types")
conn.execute("DELETE FROM pokemon_form_stats")
conn.execute("DELETE FROM pokemon_forms")
conn.execute("DELETE FROM pokemon_generation_regions")
conn.execute("DELETE FROM pokemon")
conn.commit()

test_pokemon = [
    (1, "妙蛙种子", "フシギダネ", "Bulbasaur", (1,)),
    (6, "喷火龙", "リザードン", "Charizard", (1,)),
    (25, "皮卡丘", "ピカチュウ", "Pikachu", (1,)),
    (52, "喵喵", "ニャース", "Meowth", (1,)),
    (94, "耿鬼", "ゲンガー", "Gengar", (1,)),
    (150, "超梦", "ミュウツー", "Mewtwo", (1,)),
]

for dex, name_zh, name_ja, name_en, gens in test_pokemon:
    cache_path = data_dir / f"pokemon-{dex:04d}.json"
    if not cache_path.exists():
        print(f"  SKIP #{dex} {name_zh} (no cache)")
        continue
    
    data = json.loads(cache_path.read_text(encoding="utf-8"))
    page = RawPage.from_json(data)
    seed = PokemonSeed(dex_number=dex, name_zh=name_zh, detail_url="", name_ja=name_ja, name_en=name_en, generations=gens)
    payload = normalize_pokemon_detail_page(page, seed)
    
    try:
        pokemon_id = upsert_pokemon_detail(conn, payload)
        print(f"  OK #{dex} {name_zh} -> pokemon_id={pokemon_id}")
    except Exception as e:
        print(f"  ERROR #{dex} {name_zh}: {e}")
        import traceback
        traceback.print_exc()

# Verify results
print()
print("=== Database Summary ===")
for table in ["pokemon", "pokemon_forms", "pokemon_form_stats", "pokemon_form_types", "pokemon_form_abilities", "pokemon_form_images"]:
    count = conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0]
    print(f"  {table}: {count} rows")

print()
print("=== Pokemon with forms ===")
for row in conn.execute("""
    SELECT p.dex_number, p.name_zh, pf.form_key, pf.name_zh as form_name, pf.form_type, pf.is_default,
           ps.hp, ps.atk, ps.def, ps.spa, ps.spd, ps.spe
    FROM pokemon p
    JOIN pokemon_forms pf ON pf.pokemon_id = p.id
    LEFT JOIN pokemon_form_stats ps ON ps.form_id = pf.id
    ORDER BY p.dex_number, pf.sort_order
""").fetchall():
    stats = f"HP={row['hp']} ATK={row['atk']} DEF={row['def']} SPA={row['spa']} SPD={row['spd']} SPE={row['spe']}" if row['hp'] is not None else "no stats"
    default = " [DEFAULT]" if row["is_default"] else ""
    print(f"  #{row['dex_number']:04d} {row['form_name']} ({row['form_type']}){default}: {stats}")

print()
print("=== Form types ===")
for row in conn.execute("""
    SELECT p.dex_number, pf.name_zh as form_name, ft.type_name, ft.slot
    FROM pokemon p
    JOIN pokemon_forms pf ON pf.pokemon_id = p.id
    JOIN pokemon_form_types ft ON ft.form_id = pf.id
    ORDER BY p.dex_number, pf.sort_order, ft.slot
""").fetchall():
    print(f"  #{row['dex_number']:04d} {row['form_name']}: slot{row['slot']}={row['type_name']}")

conn.close()

# Clean up
import os
os.unlink(tmp.name)
print()
print("Done! Temp DB cleaned up.")
