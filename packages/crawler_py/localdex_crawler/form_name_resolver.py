from __future__ import annotations

import json
import re
import unicodedata
from functools import lru_cache
from pathlib import Path
from typing import Any


RULES_PATH = Path(__file__).with_name("form_name_rules.json")


@lru_cache(maxsize=1)
def _rules() -> dict[str, Any]:
    with RULES_PATH.open("r", encoding="utf-8") as f:
        return json.load(f)


def _normalize_key(value: str | None) -> str:
    return unicodedata.normalize("NFKC", value or "").replace("’", "'").replace("‘", "'").replace("`", "'").strip()


def _lookup_mapping(mapping: dict[str, str], key: str | None) -> str | None:
    normalized = _normalize_key(key)
    for candidate_key, value in mapping.items():
        if _normalize_key(candidate_key) == normalized:
            return value
    return None


def canonical_base_name(base_name_en: str | None) -> str:
    base = _normalize_key(base_name_en)
    if not base:
        return ""
    override = _lookup_mapping(_rules().get("baseNameOverrides", {}), base)
    return override if override is not None else base


def default_species_name(base_name_en: str | None) -> str:
    base = _normalize_key(base_name_en)
    if not base:
        return ""
    override = _lookup_mapping(_rules().get("defaultSpeciesNameOverrides", {}), base)
    if override is not None:
        return override
    return canonical_base_name(base)


def _name_with_suffix(base_name_en: str | None, suffix: str) -> str:
    if suffix == "":
        return default_species_name(base_name_en)
    return f"{canonical_base_name(base_name_en)}-{suffix}"


def _species_suffix(base_name_en: str | None, form_name_zh: str | None) -> str | None:
    base = _normalize_key(base_name_en)
    if not base:
        return None
    species_rules = _rules().get("speciesFormSuffixOverrides", {})
    for species_name, by_form in species_rules.items():
        if _normalize_key(species_name) != base:
            continue
        suffix = _lookup_mapping(by_form, form_name_zh)
        if suffix is None:
            return None
        return _name_with_suffix(base, suffix)
    return None


def _manual_mapping(base_name_en: str | None, form_name_zh: str | None) -> str | None:
    base = _normalize_key(base_name_en)
    form_name = _normalize_key(form_name_zh)
    keys = [f"{form_name}{base.lower()}", form_name]
    for entry in _rules().get("manualFormMappings", []):
        key = entry.get("key")
        if not any(_normalize_key(key) == candidate for candidate in keys):
            continue
        mapping_base = entry.get("base") or base
        return _name_with_suffix(mapping_base, entry.get("suffix", ""))
    return None


def _rule_mapping(base_name_en: str | None, form_name_zh: str | None) -> str | None:
    form_name = _normalize_key(form_name_zh)
    if not form_name:
        return None
    for rule in _rules().get("formSuffixRules", []):
        if re.search(rule.get("pattern", ""), form_name):
            return _name_with_suffix(base_name_en, rule.get("suffix", ""))
    return None


def resolve_form_name_en(
    base_name_en: str | None,
    form_name_zh: str | None,
    *,
    is_default: bool = False,
    existing_name_en: str | None = None,
    form_type: str | None = None,
    form_category: str | None = None,
) -> str | None:
    """Resolve the battle-library canonical English name for a pokemon form."""
    base = _normalize_key(base_name_en)
    if not base:
        return _normalize_key(existing_name_en) or None

    if is_default:
        return default_species_name(base)

    existing = _normalize_key(existing_name_en)
    if existing:
        return existing

    for resolver in (_species_suffix, _manual_mapping, _rule_mapping):
        resolved = resolver(base, form_name_zh)
        if resolved:
            return resolved

    label = _normalize_key(form_name_zh)
    if (
        _normalize_key(form_type) == "gmax"
        or _normalize_key(form_category) == "gigantamax"
        or label.startswith("超极巨化")
    ):
        return _name_with_suffix(base, "Gmax")

    return default_species_name(base)
