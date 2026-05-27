from __future__ import annotations

from dataclasses import dataclass
import re
import unicodedata

from bs4 import BeautifulSoup, Tag

from .fetcher import RawPage
from .utils import (
    clean_inline_text,
    normalize_media_url,
    to_absolute_url,
    to_simplified,
    unique_by_key,
)


CHAMPIONS_SEASONS_URL = "https://wiki.52poke.com/wiki/%E8%B5%9B%E5%AD%A3%EF%BC%88Champions%EF%BC%89"
CHAMPIONS_REGULATIONS_URL = "https://wiki.52poke.com/wiki/%E8%B5%9B%E5%88%B6%EF%BC%88Champions%EF%BC%89"
CHAMPIONS_ITEMS_URL = "https://wiki.52poke.com/wiki/%E9%81%93%E5%85%B7%E5%88%97%E8%A1%A8%EF%BC%88Champions%EF%BC%89"


@dataclass(frozen=True)
class ChampionsSeason:
    season_code: str
    regulation_code: str
    period_text: str | None = None
    start_at: str | None = None
    end_at: str | None = None


@dataclass(frozen=True)
class ChampionsPokemonAvailability:
    msp_code: str
    dex_number: int | None
    form_code: str | None
    name_zh: str
    sort_order: int


@dataclass(frozen=True)
class ChampionsRegulation:
    regulation_code: str
    name: str
    period_text: str | None
    start_at: str | None
    end_at: str | None
    special_feature: str | None
    held_item_rule: str | None
    battle_time: str | None
    pokemon: list[ChampionsPokemonAvailability]


@dataclass(frozen=True)
class ChampionsItem:
    name_zh: str
    name_ja: str | None
    name_en: str | None
    category: str
    effect_summary: str | None
    image_url: str | None
    detail_url: str | None
    is_battle_item: bool
    sort_order: int


def normalize_champions_pages(
    seasons_page: RawPage,
    regulations_page: RawPage,
    items_page: RawPage,
) -> dict:
    return {
        "seasons": parse_champions_seasons_page(seasons_page.html),
        "regulations": parse_champions_regulations_page(regulations_page.html),
        "items": parse_champions_items_page(items_page.html),
        "sources": {
            "seasons": seasons_page,
            "regulations": regulations_page,
            "items": items_page,
        },
    }


def parse_champions_seasons_page(html: str) -> list[ChampionsSeason]:
    soup = BeautifulSoup(html or "", "html.parser")
    seasons: list[ChampionsSeason] = []
    for table in soup.find_all("table"):
        rows = table.find_all("tr")
        if not rows:
            continue
        header = [_cell_text(cell) for cell in rows[0].find_all(["th", "td"])]
        if not {"赛季", "日期", "赛制"}.issubset(set(header)):
            continue
        col = {name: index for index, name in enumerate(header)}
        for row in rows[1:]:
            cells = row.find_all(["th", "td"], recursive=False)
            if len(cells) <= max(col["赛季"], col["日期"], col["赛制"]):
                continue
            season_code = _normalize_code(_cell_text(cells[col["赛季"]]))
            if not season_code:
                continue
            regulation_cell = cells[col["赛制"]]
            regulation_code = _normalize_code(_cell_text(regulation_cell))
            link = regulation_cell.find("a")
            if link:
                regulation_code = _normalize_code(link.get_text(" ", strip=True)) or regulation_code
            if not regulation_code:
                continue
            period_text = _cell_text(cells[col["日期"]])
            start_at, end_at = _parse_period(period_text)
            seasons.append(
                ChampionsSeason(
                    season_code=season_code,
                    regulation_code=regulation_code,
                    period_text=period_text or None,
                    start_at=start_at,
                    end_at=end_at,
                )
            )
    return unique_by_key(seasons, lambda item: item.season_code)


def parse_champions_regulations_page(html: str) -> list[ChampionsRegulation]:
    soup = BeautifulSoup(html or "", "html.parser")
    content = soup.find("div", class_="mw-parser-output") or soup
    regulations: list[ChampionsRegulation] = []
    for heading in content.find_all("h2"):
        heading_text = _cell_text(heading)
        regulation_code = _regulation_code_from_text(heading_text)
        if not regulation_code:
            continue
        table = _next_tag(heading, "table")
        if not table:
            continue
        fields = _parse_regulation_fields(table)
        name = fields.get("name") or f"赛制{regulation_code}"
        period_text = fields.get("期间")
        start_at, end_at = _parse_period(period_text)
        msp = _find_regulation_msp(table)
        regulations.append(
            ChampionsRegulation(
                regulation_code=regulation_code,
                name=name,
                period_text=period_text,
                start_at=start_at,
                end_at=end_at,
                special_feature=fields.get("特别要素"),
                held_item_rule=fields.get("持有物"),
                battle_time=fields.get("对战时间"),
                pokemon=_parse_msp_entries(msp),
            )
        )
    return unique_by_key(regulations, lambda item: item.regulation_code)


def parse_champions_items_page(html: str) -> list[ChampionsItem]:
    soup = BeautifulSoup(html or "", "html.parser")
    content = soup.find("div", class_="mw-parser-output") or soup
    items: list[ChampionsItem] = []
    sort_order = 1
    for heading in content.find_all("h2"):
        category = _cell_text(heading)
        if not category or category in {"名字", "细节"}:
            continue
        table = _next_tag(heading, "table")
        if not table:
            continue
        rows = table.find_all("tr")
        if not rows:
            continue
        header = [_cell_text(cell) for cell in rows[0].find_all(["th", "td"])]
        if "中文" not in header:
            continue
        name_idx = header.index("中文")
        ja_idx = header.index("日文") if "日文" in header else None
        en_idx = header.index("英文") if "英文" in header else None
        effect_idx = next((i for i, text in enumerate(header) if "说明" in text or "說明" in text), None)
        for row in rows[1:]:
            cells = row.find_all(["th", "td"], recursive=False)
            if len(cells) <= name_idx:
                continue
            name = _cell_text(cells[name_idx])
            if not name:
                continue
            anchor = cells[name_idx].find("a", href=True)
            img = cells[0].find("img") if cells else None
            image_url = normalize_media_url(str(img.get("src"))) if img and img.get("src") else None
            detail_url = to_absolute_url(str(anchor.get("href"))) if anchor and anchor.get("href") else None
            items.append(
                ChampionsItem(
                    name_zh=name,
                    name_ja=_cell_text(cells[ja_idx]) if ja_idx is not None and len(cells) > ja_idx else None,
                    name_en=_cell_text(cells[en_idx]) if en_idx is not None and len(cells) > en_idx else None,
                    category=category,
                    effect_summary=_cell_text(cells[effect_idx]) if effect_idx is not None and len(cells) > effect_idx else None,
                    image_url=image_url,
                    detail_url=detail_url,
                    is_battle_item=category != "票券",
                    sort_order=sort_order,
                )
            )
            sort_order += 1
    return unique_by_key(items, lambda item: item.name_zh)


def _parse_regulation_fields(table: Tag) -> dict[str, str]:
    fields: dict[str, str] = {}
    rows = table.find_all("tr")
    for index, row in enumerate(rows):
        cells = row.find_all(["th", "td"], recursive=False)
        if index == 0 and cells:
            title = _cell_text(cells[0])
            if title:
                fields["name"] = title
            continue
        if len(cells) < 2:
            continue
        key = _cell_text(cells[0])
        value = _cell_text(cells[1])
        if key and value:
            fields[key] = value
    return fields


def _find_regulation_msp(table: Tag) -> str | None:
    for sibling in table.next_siblings:
        if isinstance(sibling, Tag) and sibling.name == "h2":
            return None
        if not isinstance(sibling, Tag):
            continue
        span = sibling.find("span", attrs={"data-msp": True})
        if span:
            return str(span.get("data-msp") or "")
    return None


def _parse_msp_entries(value: str | None) -> list[ChampionsPokemonAvailability]:
    entries: list[ChampionsPokemonAvailability] = []
    if not value:
        return entries
    for sort_order, chunk in enumerate(value.split(","), start=1):
        if "\\" not in chunk:
            continue
        msp_code, raw_name = chunk.split("\\", 1)
        msp_code = _normalize_code(msp_code)
        name = _normalize_name(raw_name)
        if not msp_code or not name:
            continue
        dex_match = re.match(r"(\d{4})(.*)", msp_code)
        dex_number = int(dex_match.group(1)) if dex_match else None
        form_code = dex_match.group(2) if dex_match and dex_match.group(2) else None
        entries.append(
            ChampionsPokemonAvailability(
                msp_code=msp_code,
                dex_number=dex_number,
                form_code=form_code,
                name_zh=name,
                sort_order=sort_order,
            )
        )
    return entries


def _parse_period(value: str | None) -> tuple[str | None, str | None]:
    text = _normalize_name(value)
    if not text:
        return None, None
    parts = re.split(r"\s*[~～]\s*", text, maxsplit=1)
    if len(parts) != 2:
        return _parse_datetime_text(parts[0], None), None
    start = _parse_datetime_text(parts[0], None)
    start_year = start[:4] if start else None
    end = _parse_datetime_text(parts[1], start_year)
    return start, end


def _parse_datetime_text(value: str, default_year: str | None) -> str | None:
    text = _normalize_name(value)
    matched = re.search(r"(?:(\d{4})年)?(\d{1,2})月(\d{1,2})日(?:(\d{1,2}):(\d{2}))?", text)
    if not matched:
        return None
    year = matched.group(1) or default_year
    if not year:
        return None
    month = int(matched.group(2))
    day = int(matched.group(3))
    hour = matched.group(4)
    minute = matched.group(5)
    base = f"{year}-{month:02d}-{day:02d}"
    return f"{base}T{int(hour):02d}:{int(minute):02d}" if hour and minute else base


def _regulation_code_from_text(value: str | None) -> str | None:
    text = _normalize_name(value)
    matched = re.search(r"赛制\s*([A-Z]+-[A-Z0-9]+)", text, flags=re.IGNORECASE)
    return matched.group(1).upper() if matched else None


def _next_tag(tag: Tag, name: str) -> Tag | None:
    for sibling in tag.next_siblings:
        if isinstance(sibling, Tag) and sibling.name == name:
            return sibling
        if isinstance(sibling, Tag) and sibling.name == "h2":
            return None
    return None


def _cell_text(tag: Tag | None) -> str:
    if tag is None:
        return ""
    return _normalize_name(tag.get_text(" ", strip=True))


def _normalize_name(value: str | None) -> str:
    text = to_simplified(value or "") or ""
    text = unicodedata.normalize("NFKC", text)
    return clean_inline_text(text)


def _normalize_code(value: str | None) -> str:
    return unicodedata.normalize("NFKC", clean_inline_text(value or "")).upper()
