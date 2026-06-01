import sqlite3
import unittest

from localdex_crawler.form_name_resolver import resolve_form_name_en
from localdex_crawler.sqlite_upsert import _lookup_form_id, upsert_pokemon_detail


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE pokemon (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dex_number INTEGER,
          name_zh TEXT,
          name_ja TEXT,
          name_en TEXT,
          category TEXT,
          height_m REAL,
          weight_kg REAL,
          introduced_generation INTEGER,
          source_url TEXT,
          source_title TEXT,
          source_fetched_at TEXT
        );
        CREATE TABLE pokemon_forms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pokemon_id INTEGER,
          form_type TEXT NOT NULL,
          form_category TEXT NOT NULL,
          name_zh TEXT NOT NULL,
          display_name_zh TEXT,
          name_en TEXT,
          is_default INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          required_item_id INTEGER,
          UNIQUE (pokemon_id, form_type)
        );
        CREATE TABLE pokemon_form_stats (
          form_id INTEGER,
          generation_start INTEGER,
          generation_end INTEGER,
          hp INTEGER,
          atk INTEGER,
          def INTEGER,
          spa INTEGER,
          spd INTEGER,
          spe INTEGER
        );
        CREATE TABLE pokemon_form_types (
          form_id INTEGER,
          type_name TEXT,
          slot INTEGER,
          generation_start INTEGER,
          generation_end INTEGER
        );
        CREATE TABLE pokemon_form_abilities (
          form_id INTEGER,
          ability_id INTEGER,
          ability_name_zh TEXT,
          slot INTEGER,
          is_hidden INTEGER,
          generation_start INTEGER,
          generation_end INTEGER
        );
        CREATE TABLE pokemon_form_images (
          form_id INTEGER,
          image_kind TEXT,
          url TEXT,
          alt TEXT
        );
        CREATE TABLE abilities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name_zh TEXT
        );
        """
    )
    return conn


class FormNameEnUpsertTest(unittest.TestCase):
    def test_resolves_shared_form_name_rules(self):
        cases = [
            ("Darmanitan", "伽勒尔达摩狒狒（达摩模式）", "Darmanitan-Galar-Zen"),
            ("Tatsugiri", "超级米立龙（上弓姿势）", "Tatsugiri-Curly-Mega"),
            ("Magearna", "超级玛机雅娜（５００年前的颜色）", "Magearna-Original-Mega"),
            ("Oricorio", "轻盈轻盈风格", "Oricorio-Sensu"),
            ("Urshifu", "超极巨化武道熊师连击流", "Urshifu-Rapid-Strike-Gmax"),
            ("Pyroar", "雌性的样子", "Pyroar"),
            ("Meowstic", "雌性的样子", "Meowstic-F"),
            ("Unfezant", "雌性的样子", "Unfezant"),
        ]

        for base_name_en, form_name_zh, expected in cases:
            with self.subTest(form_name_zh=form_name_zh):
                self.assertEqual(resolve_form_name_en(base_name_en, form_name_zh), expected)

    def test_upsert_derives_non_default_form_name_en(self):
        conn = make_conn()

        upsert_pokemon_detail(
            conn,
            {
                "dex_number": 555,
                "name_zh": "达摩狒狒",
                "name_en": "Darmanitan",
                "generations": [5],
                "forms": [
                    {
                        "name_zh": "达摩狒狒",
                        "is_default": True,
                        "sort_order": 0,
                    },
                    {
                        "name_zh": "伽勒尔达摩狒狒（达摩模式）",
                        "is_default": False,
                        "sort_order": 1,
                    },
                ],
            },
        )

        row = conn.execute(
            """
            SELECT name_en, form_type, form_category
            FROM pokemon_forms
            WHERE display_name_zh = '伽勒尔达摩狒狒（达摩模式）'
            """
        ).fetchone()

        self.assertEqual(row["name_en"], "Darmanitan-Galar-Zen")
        self.assertEqual(row["form_type"], "galar-zen")
        self.assertEqual(row["form_category"], "regional-galar")

    def test_upsert_keeps_display_name_and_uses_champions_name_format(self):
        conn = make_conn()

        pokemon_id = upsert_pokemon_detail(
            conn,
            {
                "dex_number": 26,
                "name_zh": "雷丘",
                "name_en": "Raichu",
                "generations": [1],
                "forms": [
                    {
                        "name_zh": "雷丘",
                        "is_default": True,
                        "sort_order": 0,
                    },
                    {
                        "name_zh": "阿罗拉雷丘",
                        "is_default": False,
                        "sort_order": 1,
                    },
                ],
            },
        )

        row = conn.execute(
            """
            SELECT id, name_zh, display_name_zh, form_type
            FROM pokemon_forms
            WHERE form_type = 'alola'
            """
        ).fetchone()

        self.assertEqual(row["name_zh"], "雷丘(阿罗拉的样子)")
        self.assertEqual(row["display_name_zh"], "阿罗拉雷丘")
        self.assertEqual(
            _lookup_form_id(conn, pokemon_id, "雷丘(阿罗拉的样子)", "A"),
            row["id"],
        )


if __name__ == "__main__":
    unittest.main()
