"""form_type — 形态标识/分类推导与中文名规范化。

从 sqlite_upsert.py 中抽取，供 upsert/ 子模块和其它解析模块共用。
"""
from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path


_FORM_RULES_PATH = Path(__file__).with_name("form_name_rules.json")


@lru_cache(maxsize=1)
def _form_type_keywords() -> dict:
    with _FORM_RULES_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)["formTypeKeywords"]


def _normalize_identifier(value: str | None) -> str:
    text = unicodedata.normalize("NFKC", value or "").replace("’", "'").replace("‘", "'").replace("`", "'").strip().lower()
    text = re.sub(r"[（）()・·･\s　_]+", "-", text)
    text = re.sub(r"-+", "-", text).strip("-")
    return text


def _normalize_form_match(value: str | None, species_name: str | None = None) -> str:
    text = unicodedata.normalize("NFKC", value or "").lower()
    species = unicodedata.normalize("NFKC", species_name or "").lower()
    if species:
        text = text.replace(species, "")
    text = re.sub(r"[（）()・·･\s　\-_]", "", text)
    for suffix in ("的样子", "样子", "形态", "形態"):
        text = text.replace(suffix, "")
    return text


def _infer_form_type_from_label(value: str | None) -> str | None:
    """根据 formTypeKeywords 规则从中文标签推断 formType。"""
    text = unicodedata.normalize("NFKC", value or "").strip()
    if not text:
        return None

    kw = _form_type_keywords()
    mega_re = re.compile("|".join(re.escape(p) for p in kw["megaPatterns"]), re.IGNORECASE)
    gmax_re = re.compile("|".join(re.escape(p) for p in kw["gmaxPatterns"]), re.IGNORECASE)
    has_mega = bool(mega_re.search(text))
    has_gmax = bool(gmax_re.search(text))

    # Posture keywords
    for rule in kw["postures"]:
        if rule["keyword"] in text:
            return f"{rule['value']}-mega" if has_mega else rule["value"]

    # Simple keyword rules
    for rule in kw["simple"]:
        matched = any(k in text for k in rule["keywords"]) or (
            "exactMatch" in rule and text == rule["exactMatch"]
        )
        if matched:
            if rule.get("gmaxValue") and has_gmax:
                return rule["gmaxValue"]
            cond_kw = rule.get("conditionalKeyword")
            if cond_kw and cond_kw in text:
                return rule["conditionalValue"]
            if rule.get("megaValue") and has_mega:
                return rule["megaValue"]
            return rule["value"]

    # Region keywords
    for rule in kw["regions"]:
        if rule["keyword"] in text:
            return rule["value"]

    # Gmax fallback
    if has_gmax:
        return "gmax"

    # Mega fallback with X/Y suffix
    if has_mega:
        if re.search(r"[xXＸ]$", text):
            return "mega-x"
        if re.search(r"[yYＹ]$", text):
            return "mega-y"
        return "mega"

    return None


def _derive_form_type(
    species_name_en: str | None,
    form_name_en: str | None,
    fallback_label: str | None,
    is_default: bool = False,
) -> str:
    if is_default:
        return "default"

    species = unicodedata.normalize("NFKC", species_name_en or "").strip()
    form_name = unicodedata.normalize("NFKC", form_name_en or "").strip()
    species_compare = species.replace("’", "'").replace("‘", "'").replace("`", "'")
    form_name_compare = form_name.replace("’", "'").replace("‘", "'").replace("`", "'")
    if species_compare and form_name_compare and form_name_compare != species_compare:
        prefix = f"{species_compare}-"
        if form_name_compare.startswith(prefix):
            suffix = _normalize_identifier(form_name_compare[len(prefix):])
            if suffix:
                return suffix
        normalized = _normalize_identifier(form_name_compare)
        if normalized:
            return normalized

    inferred = _infer_form_type_from_label(fallback_label)
    if inferred:
        return inferred

    fallback = _normalize_identifier(fallback_label)
    return fallback or "alternate"


def _derive_form_category(form_type: str, fallback_category: str | None = None) -> str:
    normalized = _normalize_identifier(form_type)
    if normalized == "default":
        return "default"
    if normalized.startswith("mega") or normalized.endswith("-mega"):
        return "mega"
    if normalized in ("gmax", "gigantamax") or normalized.endswith("-gmax"):
        return "gigantamax"
    for region in ("alola", "galar", "hisui", "paldea"):
        if normalized.startswith(region):
            return f"regional-{region}"
    return _normalize_identifier(fallback_category) or "alternate"


REGION_ZH_BY_FORM_TYPE = {
    "alola": "阿罗拉",
    "galar": "伽勒尔",
    "hisui": "洗翠",
    "paldea": "帕底亚",
}


def _strip_wrapping_parens(value: str) -> str:
    text = value.strip()
    if len(text) >= 2 and text[0] in "(（" and text[-1] in ")）":
        return text[1:-1].strip()
    return text


def _canonical_form_name_zh(
    species_name_zh: str | None,
    display_name_zh: str | None,
    form_type: str | None,
    form_category: str | None,
    is_default: bool = False,
) -> str:
    species = unicodedata.normalize("NFKC", species_name_zh or "").strip()
    display = unicodedata.normalize("NFKC", display_name_zh or species).strip()
    if is_default or not species or not display or display == species:
        return species or display
    if display.startswith(f"{species}(") and display.endswith(")"):
        return display

    normalized_type = _normalize_identifier(form_type)
    normalized_category = _normalize_identifier(form_category)
    region_zh = None
    for prefix, label in REGION_ZH_BY_FORM_TYPE.items():
        if normalized_type.startswith(prefix) or normalized_category == f"regional-{prefix}":
            region_zh = label
            break

    if region_zh:
        if display.startswith(f"{region_zh}{species}"):
            rest = _strip_wrapping_parens(display[len(region_zh) + len(species):])
            suffix = f"{region_zh}的样子"
            if rest:
                suffix += f"・{rest.lstrip('・·･')}"
            return f"{species}({suffix})"
        if display.startswith(f"{region_zh}的样子"):
            rest = _strip_wrapping_parens(display[len(f"{region_zh}的样子"):]).lstrip("・·･")
            suffix = f"{region_zh}的样子"
            if rest:
                suffix += f"・{rest}"
            return f"{species}({suffix})"
        if display.startswith(region_zh):
            rest = _strip_wrapping_parens(display[len(region_zh):]).lstrip("・·･")
            suffix = f"{region_zh}的样子"
            if rest:
                suffix += f"・{rest}"
            return f"{species}({suffix})"

    if display.startswith(species):
        rest = _strip_wrapping_parens(display[len(species):])
        return f"{species}({rest})" if rest else species

    return f"{species}({display})"
