import unittest

from localdex_crawler.pokemon import parse_pokemon_list_page


class PokemonListParserTest(unittest.TestCase):
    def test_keeps_accented_english_names(self):
        seeds = parse_pokemon_list_page(
            "#0669 花蓓蓓 フラベベ Flabébé\n"
            "#0670 花叶蒂 フラエッテ Floette\n"
        )

        by_dex = {seed.dex_number: seed for seed in seeds}
        self.assertEqual(by_dex[669].name_en, "Flabébé")
        self.assertEqual(by_dex[670].name_en, "Floette")


if __name__ == "__main__":
    unittest.main()
