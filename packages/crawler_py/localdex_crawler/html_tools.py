from __future__ import annotations

from dataclasses import dataclass
import re

from bs4 import BeautifulSoup, Tag


CHINESE_GENERATIONS = {
    "一": 1,
    "二": 2,
    "三": 3,
    "四": 4,
    "五": 5,
    "六": 6,
    "七": 7,
    "八": 8,
    "九": 9,
}
SKIP_ABILITY_LABELS = {"特性", "隐藏特性", "隱藏特性", "或"}


@dataclass(frozen=True)
class AbilityChange:
    before_generation: int
    ability: str


@dataclass(frozen=True)
class ParsedPokemonAbilities:
    abilities: list[str]
    hidden_ability: str | None
    changes: list[AbilityChange]


def clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def dedupe(values: list[str]) -> list[str]:
    result: list[str] = []
    seen: set[str] = set()
    for value in values:
        if value and value not in seen:
            seen.add(value)
            result.append(value)
    return result


def extract_ability_names(fragment: Tag | str) -> list[str]:
    soup = BeautifulSoup(str(fragment), "html.parser")
    names: list[str] = []
    for anchor in soup.find_all("a"):
        title = clean_text(anchor.get("title"))
        if not title.endswith("（特性）"):
            continue
        title_name = title.removesuffix("（特性）").strip()
        label = clean_text(anchor.get_text(" ", strip=True))
        name = label if label and not re.search(r"[()[\]{}]", label) else title_name
        if name and name not in SKIP_ABILITY_LABELS:
            names.append(name)
    return dedupe(names)


def parse_pokemon_abilities(html: str) -> ParsedPokemonAbilities:
    soup = BeautifulSoup(html, "html.parser")
    ability_table = _find_ability_table(soup)
    abilities: list[str] = []
    hidden_ability: str | None = None

    if ability_table:
        for cell in ability_table.find_all("td"):
            names = extract_ability_names(cell)
            if not names:
                continue
            cell_text = clean_text(cell.get_text(" ", strip=True))
            if "隐藏特性" in cell_text or "隱藏特性" in cell_text:
                hidden_ability = names[0]
            else:
                abilities.extend(names)

    return ParsedPokemonAbilities(
        abilities=dedupe(abilities),
        hidden_ability=hidden_ability,
        changes=extract_ability_changes(html),
    )


def extract_ability_changes(html: str) -> list[AbilityChange]:
    records: list[AbilityChange] = []
    pattern = re.compile(
        r"第([一二三四五六七八九])世代</a>前[^。]{0,48}?特性[为為]\s*"
        r"<a\b[^>]*title=[\"']([^\"']+（特性）)[\"'][^>]*>([\s\S]*?)</a>"
    )
    for match in pattern.finditer(html):
        generation = CHINESE_GENERATIONS.get(match.group(1))
        names = extract_ability_names(match.group(0))
        ability = names[0] if names else match.group(2).removesuffix("（特性）").strip()
        if generation and ability:
            records.append(AbilityChange(before_generation=generation, ability=ability))
    return records


def _find_ability_table(soup: BeautifulSoup) -> Tag | None:
    label = soup.find("a", attrs={"title": "特性"})
    if not label:
        return None

    for table in label.find_all_next("table"):
        classes = set(table.get("class") or [])
        if {"bgwhite", "fulltable"}.issubset(classes):
            return table
    return None

