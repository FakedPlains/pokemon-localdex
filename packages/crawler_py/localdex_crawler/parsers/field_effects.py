"""Field Effects (天气/场地/异常状态等) 解析模块。

数据来源：52Poké Wiki 各效果详情页。
由于 Wiki 没有统一的"场地效果列表"页面，这里使用硬编码的 Seed 清单，
每条记录对应一个 Wiki 详情页。
"""
from __future__ import annotations

from dataclasses import dataclass
from urllib.parse import quote

from ..fetcher import RawPage
from ..generations import clean_name, extract_generation_changes, extract_intro_names, section_text_by_heading
from ..text import clean_summary, normalize_text, to_simplified


# ══════════════════════════════════════════════════════════════════════════════
# Seed 数据：字段效果清单（手动维护，对应 FIELD_EFFECT_KIND 枚举）
# ══════════════════════════════════════════════════════════════════════════════

# kind 枚举值
KIND_WEATHER = 1
KIND_TERRAIN = 2
KIND_STATUS = 3
KIND_SIDE = 4
KIND_FIELD = 5


@dataclass(frozen=True)
class FieldEffectSeed:
    """一条场地效果的基础信息（用于定位详情页）。"""
    kind: int               # FIELD_EFFECT_KIND 枚举值
    key: str                # 程序内标识（英文 slug）
    name_zh: str            # 中文名
    name_en: str | None     # 英文名
    name_ja: str | None     # 日文名
    wiki_page: str          # Wiki 页面标题（URL 路径部分，非 URL 编码）
    introduced_generation: int
    max_turns: int | None = None
    max_layers: int | None = None


# ─────────────────────────────────────────────────────────────────────────────
# 天气 (kind=1)
# ─────────────────────────────────────────────────────────────────────────────
WEATHER_SEEDS: list[FieldEffectSeed] = [
    FieldEffectSeed(KIND_WEATHER, "sun", "大晴天", "Harsh Sunlight", "にほんばれ",
                    "大晴天（状态）", 2, max_turns=5),
    FieldEffectSeed(KIND_WEATHER, "rain", "下雨", "Rain", "あめ",
                    "下雨（状态）", 2, max_turns=5),
    FieldEffectSeed(KIND_WEATHER, "sandstorm", "沙暴", "Sandstorm", "すなあらし",
                    "沙暴（状态）", 2, max_turns=5),
    FieldEffectSeed(KIND_WEATHER, "hail", "冰雹", "Hail", "あられ",
                    "冰雹（状态）", 3, max_turns=5),
    FieldEffectSeed(KIND_WEATHER, "snow", "下雪", "Snow", "ゆき",
                    "下雪（状态）", 9, max_turns=5),
    FieldEffectSeed(KIND_WEATHER, "harsh-sun", "大日照", "Extremely Harsh Sunlight", "おおひでり",
                    "大日照（状态）", 6, max_turns=None),
    FieldEffectSeed(KIND_WEATHER, "heavy-rain", "大雨", "Heavy Rain", "おおあめ",
                    "大雨（状态）", 6, max_turns=None),
    FieldEffectSeed(KIND_WEATHER, "strong-winds", "乱流", "Strong Winds", "らんきりゅう",
                    "乱流（状态）", 6, max_turns=None),
]

# ─────────────────────────────────────────────────────────────────────────────
# 场地 (kind=2)
# ─────────────────────────────────────────────────────────────────────────────
TERRAIN_SEEDS: list[FieldEffectSeed] = [
    FieldEffectSeed(KIND_TERRAIN, "electric", "电气场地", "Electric Terrain", "エレキフィールド",
                    "电气场地（状态）", 6, max_turns=5),
    FieldEffectSeed(KIND_TERRAIN, "grassy", "青草场地", "Grassy Terrain", "グラスフィールド",
                    "青草场地（状态）", 6, max_turns=5),
    FieldEffectSeed(KIND_TERRAIN, "misty", "薄雾场地", "Misty Terrain", "ミストフィールド",
                    "薄雾场地（状态）", 6, max_turns=5),
    FieldEffectSeed(KIND_TERRAIN, "psychic", "精神场地", "Psychic Terrain", "サイコフィールド",
                    "精神场地（状态）", 7, max_turns=5),
]

# ─────────────────────────────────────────────────────────────────────────────
# 异常状态 (kind=3)
# ─────────────────────────────────────────────────────────────────────────────
STATUS_SEEDS: list[FieldEffectSeed] = [
    FieldEffectSeed(KIND_STATUS, "burn", "灼伤", "Burn", "やけど",
                    "灼伤（状态）", 1),
    FieldEffectSeed(KIND_STATUS, "paralysis", "麻痹", "Paralysis", "まひ",
                    "麻痹（状态）", 1),
    FieldEffectSeed(KIND_STATUS, "poison", "中毒", "Poison", "どく",
                    "中毒（状态）", 1),
    FieldEffectSeed(KIND_STATUS, "bad-poison", "剧毒", "Bad Poison", "もうどく",
                    "剧毒（状态）", 1),
    FieldEffectSeed(KIND_STATUS, "sleep", "睡眠", "Sleep", "ねむり",
                    "睡眠（状态）", 1),
    FieldEffectSeed(KIND_STATUS, "freeze", "冰冻", "Freeze", "こおり",
                    "冰冻（状态）", 1),
    FieldEffectSeed(KIND_STATUS, "frostbite", "冻伤", "Frostbite", "こおり",
                    "冻伤（状态）", 8),
    FieldEffectSeed(KIND_STATUS, "confusion", "混乱", "Confusion", "こんらん",
                    "混乱（状态）", 1),
    FieldEffectSeed(KIND_STATUS, "infatuation", "着迷", "Infatuation", "メロメロ",
                    "着迷（状态）", 2),
]

# ─────────────────────────────────────────────────────────────────────────────
# 场侧效果 (kind=4)
# ─────────────────────────────────────────────────────────────────────────────
SIDE_SEEDS: list[FieldEffectSeed] = [
    FieldEffectSeed(KIND_SIDE, "reflect", "反射壁", "Reflect", "リフレクター",
                    "反射壁（状态）", 1, max_turns=5),
    FieldEffectSeed(KIND_SIDE, "light-screen", "光墙", "Light Screen", "ひかりのかべ",
                    "光墙（状态）", 1, max_turns=5),
    FieldEffectSeed(KIND_SIDE, "aurora-veil", "极光幕", "Aurora Veil", "オーロラベール",
                    "极光幕（状态）", 7, max_turns=5),
    FieldEffectSeed(KIND_SIDE, "spikes", "撒菱", "Spikes", "まきびし",
                    "撒菱（状态）", 2, max_layers=3),
    FieldEffectSeed(KIND_SIDE, "toxic-spikes", "毒菱", "Toxic Spikes", "どくびし",
                    "毒菱（状态）", 4, max_layers=2),
    FieldEffectSeed(KIND_SIDE, "stealth-rock", "隐形岩", "Stealth Rock", "ステルスロック",
                    "隐形岩（状态）", 4),
    FieldEffectSeed(KIND_SIDE, "sticky-web", "黏黏网", "Sticky Web", "ねばねばネット",
                    "黏黏网（状态）", 6),
    FieldEffectSeed(KIND_SIDE, "tailwind", "顺风", "Tailwind", "おいかぜ",
                    "顺风（状态）", 4, max_turns=4),
]

# ─────────────────────────────────────────────────────────────────────────────
# 全场效果 (kind=5)
# ─────────────────────────────────────────────────────────────────────────────
FIELD_SEEDS: list[FieldEffectSeed] = [
    FieldEffectSeed(KIND_FIELD, "trick-room", "戏法空间", "Trick Room", "トリックルーム",
                    "戏法空间（状态）", 4, max_turns=5),
    FieldEffectSeed(KIND_FIELD, "gravity", "重力", "Gravity", "じゅうりょく",
                    "重力（状态）", 4, max_turns=5),
    FieldEffectSeed(KIND_FIELD, "magic-room", "魔法空间", "Magic Room", "マジックルーム",
                    "魔法空间（状态）", 5, max_turns=5),
    FieldEffectSeed(KIND_FIELD, "wonder-room", "奇妙空间", "Wonder Room", "ワンダールーム",
                    "奇妙空间（状态）", 5, max_turns=5),
]

# 合并所有 Seed
ALL_FIELD_EFFECT_SEEDS: list[FieldEffectSeed] = (
    WEATHER_SEEDS + TERRAIN_SEEDS + STATUS_SEEDS + SIDE_SEEDS + FIELD_SEEDS
)


# ══════════════════════════════════════════════════════════════════════════════
# URL 构造
# ══════════════════════════════════════════════════════════════════════════════

_WIKI_BASE = "https://wiki.52poke.com/wiki/"


def build_field_effect_page_url(seed: FieldEffectSeed) -> str:
    """构造 Wiki 页面 URL。"""
    return _WIKI_BASE + quote(seed.wiki_page, safe="")


# ══════════════════════════════════════════════════════════════════════════════
# 详情页解析
# ══════════════════════════════════════════════════════════════════════════════

def normalize_field_effect_detail_page(page: RawPage, seed: FieldEffectSeed) -> dict:
    """从 Wiki 详情页 + Seed 信息组合出数据库 payload。

    返回结构：
    {
        "kind": int,
        "key": str,
        "name_zh": str,
        "name_en": str | None,
        "name_ja": str | None,
        "description": str | None,
        "introduced_generation": int,
        "max_turns": int | None,
        "max_layers": int | None,
        "generations": list[dict],
        "source": RawPage,
    }
    """
    text = normalize_text(page.html)

    # 尝试从页面提取日英文名（覆盖 Seed 中的静态值）
    name_ja_page, name_en_page = extract_intro_names(text, seed.name_zh)

    # 提取"效果"章节作为 description
    effect_text = section_text_by_heading(page.html, "效果", level=2)
    description = to_simplified(clean_summary(effect_text, max_length=1000)) if effect_text else None

    # 提取世代变更记录
    generations: dict[str, dict] = {}
    for heading in ("效果变更", "效果變更", "变更", "變更"):
        changes = extract_generation_changes(page.html, heading)
        if changes:
            for change in changes:
                gen = int(change["generation"])
                gv_code = change.get("game_version_code")
                key = f"{gen}|{gv_code or ''}"
                generations[key] = {
                    "generation": gen,
                    "description": to_simplified(str(change["summary"])) or str(change["summary"]),
                    "game_version_code": gv_code,
                    "version_exclusive": bool(change.get("version_exclusive", False)),
                    "notes": None,
                }
            break

    return {
        "kind": seed.kind,
        "key": seed.key,
        "name_zh": seed.name_zh,
        "name_en": clean_name(seed.name_en) if seed.name_en else name_en_page,
        "name_ja": clean_name(seed.name_ja) if seed.name_ja else name_ja_page,
        "description": description,
        "introduced_generation": seed.introduced_generation,
        "max_turns": seed.max_turns,
        "max_layers": seed.max_layers,
        "generations": sorted(generations.values(), key=lambda item: item["generation"]),
        "source": page,
    }
