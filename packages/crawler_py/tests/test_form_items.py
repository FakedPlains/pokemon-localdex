import sqlite3
import unittest

from localdex_crawler.form_items import (
    FormItemBinding,
    apply_form_item_bindings,
)


def make_conn():
    conn = sqlite3.connect(":memory:")
    conn.row_factory = sqlite3.Row
    conn.executescript(
        """
        CREATE TABLE pokemon (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          dex_number INTEGER,
          name_zh TEXT
        );
        CREATE TABLE items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name_zh TEXT
        );
        CREATE TABLE pokemon_forms (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          pokemon_id INTEGER,
          form_type TEXT NOT NULL,
          form_category TEXT NOT NULL,
          name_zh TEXT NOT NULL,
          display_name_zh TEXT,
          is_default INTEGER NOT NULL DEFAULT 0,
          sort_order INTEGER NOT NULL DEFAULT 0,
          required_item_id INTEGER
        );
        """
    )
    conn.execute("INSERT INTO pokemon (id, dex_number, name_zh) VALUES (1, 6, '喷火龙')")
    conn.execute("INSERT INTO pokemon (id, dex_number, name_zh) VALUES (2, 383, '固拉多')")
    conn.execute("INSERT INTO items (id, name_zh) VALUES (10, '喷火龙进化石Ｘ')")
    conn.execute("INSERT INTO items (id, name_zh) VALUES (11, '朱红色宝珠')")
    conn.execute(
        """
        INSERT INTO pokemon_forms
          (id, pokemon_id, form_type, form_category, name_zh, display_name_zh, is_default, sort_order)
        VALUES (100, 1, 'default', 'default', '喷火龙', '喷火龙', 1, 0)
        """
    )
    conn.execute(
        """
        INSERT INTO pokemon_forms
          (id, pokemon_id, form_type, form_category, name_zh, display_name_zh, is_default, sort_order)
        VALUES (101, 1, 'mega-x', 'mega', '喷火龙(超级喷火龙X)', '超级喷火龙Ｘ', 0, 1)
        """
    )
    conn.execute(
        """
        INSERT INTO pokemon_forms
          (id, pokemon_id, form_type, form_category, name_zh, display_name_zh, is_default, sort_order)
        VALUES (200, 2, 'primal', 'alternate', '固拉多(原始固拉多)', '原始固拉多', 0, 1)
        """
    )
    conn.commit()
    return conn


class FormItemsApplyTest(unittest.TestCase):
    def test_apply_uses_same_matching_for_explicit_and_derived_bindings(self):
        conn = make_conn()

        result = apply_form_item_bindings(
            conn,
            [
                FormItemBinding(
                    pokemon_name_zh="固拉多",
                    form_name_zh="原始固拉多",
                    item_name_zh="朱红色宝珠",
                    form_type="primal",
                    source="test",
                )
            ],
        )

        self.assertGreaterEqual(result["matched"], 2)
        self.assertEqual(result["updated"], 2)
        self.assertEqual(result["missing_items"], [])
        self.assertEqual(result["missing_forms"], [])

        rows = conn.execute(
            """
            SELECT COALESCE(pf.display_name_zh, pf.name_zh) AS form_name, i.name_zh AS item_name
            FROM pokemon_forms pf
            JOIN items i ON i.id = pf.required_item_id
            ORDER BY pf.id
            """
        ).fetchall()
        self.assertEqual(
            [(row["form_name"], row["item_name"]) for row in rows],
            [
                ("超级喷火龙Ｘ", "喷火龙进化石Ｘ"),
                ("原始固拉多", "朱红色宝珠"),
            ],
        )

    def test_dry_run_reports_without_updating(self):
        conn = make_conn()

        result = apply_form_item_bindings(conn, [], dry_run=True)

        self.assertEqual(result["updated"], 0)
        self.assertEqual(result["matched"], 2)
        row = conn.execute(
            "SELECT COUNT(*) AS count FROM pokemon_forms WHERE required_item_id IS NOT NULL"
        ).fetchone()
        self.assertEqual(row["count"], 0)


if __name__ == "__main__":
    unittest.main()
