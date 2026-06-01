from __future__ import annotations

import re
from typing import TYPE_CHECKING

from ..images import ImageAsset, extract_image_candidates, extract_file_name
from ..urls import normalize_media_url

if TYPE_CHECKING:
    from .pokemon_detail import PokemonSeed


def resolve_pokemon_image_assets(html: str, seed: "PokemonSeed", forms: list[dict]) -> dict[str, object]:
    urls = extract_image_candidates(html)
    shiny_urls = [url for url in urls if _has_shiny_marker(extract_file_name(url))]
    shiny_official_urls = [url for url in shiny_urls if not _has_sprite_marker(extract_file_name(url))]
    base = {
        "official": _asset(_pick_best(urls, lambda name: _score_base_image(name, seed, "official")), f"{seed.name_zh}官方图"),
        "shinyOfficial": _asset(_pick_best(shiny_official_urls, lambda name: _score_base_image(name, seed, "shinyOfficial")), f"{seed.name_zh}闪光官方图"),
        "sprite": _asset(_pick_best(urls, lambda name: _score_base_image(name, seed, "sprite")), f"{seed.name_zh}图像"),
        "shinySprite": _asset(_pick_best(shiny_urls, lambda name: _score_base_image(name, seed, "shinySprite")), f"{seed.name_zh}闪光图像"),
    }
    forms_map = {}
    for form in forms:
        official = _pick_best(urls, lambda name: _score_form_image(name, seed, form, "official"))
        shiny = _pick_best(shiny_urls, lambda name: _score_form_image(name, seed, form, "shinyOfficial"))
        forms_map[form["name_zh"]] = {
            "official": _asset(official, f"{form['name_zh']}官方图"),
            "shinyOfficial": _asset(shiny, f"{form['name_zh']}闪光官方图"),
        }
    return {
        "base": {key: value for key, value in base.items() if value},
        "forms": {
            key: {kind: asset for kind, asset in value.items() if asset}
            for key, value in forms_map.items()
            if any(value.values())
        },
    }


def _asset(url: str | None, alt: str) -> ImageAsset | None:
    if not url:
        return None
    normalized = normalize_media_url(url)
    return ImageAsset(normalized, alt, normalized)


def _pick_best(urls: list[str], scorer) -> str | None:
    ranked = [(scorer(extract_file_name(url)), len(extract_file_name(url)), url) for url in urls]
    ranked = [item for item in ranked if item[0] > 0]
    ranked.sort(key=lambda item: (-item[0], item[1]))
    return ranked[0][2] if ranked else None


def _pokemon_image_tokens(seed: "PokemonSeed") -> tuple[str, str, str]:
    dex3 = f"{seed.dex_number:03d}".lower()
    dex4 = f"{seed.dex_number:04d}".lower()
    english = re.sub(r"[^A-Za-z0-9]+", "", seed.name_en or "").lower()
    return dex3, dex4, english


def _has_shiny_marker(file_name: str) -> bool:
    return bool(re.search(r"(?:^|[_\-\s])s(?:[_\-.]|$)|spr_[0-9]+s_|shiny|色违|異色|异色", file_name, re.I))


def _has_sprite_marker(file_name: str) -> bool:
    return bool(re.search(r"^(spr|mspr)|sprite|icon", file_name, re.I))


def _has_official_marker(file_name: str) -> bool:
    return bool(re.search(r"artwork|official|home|poke_capture|cap\d+", file_name, re.I))


def _score_base_image(file_name: str, seed: "PokemonSeed", kind: str) -> int:
    normalized = file_name.lower()
    dex3, dex4, english = _pokemon_image_tokens(seed)
    score = 0
    if dex3 in normalized:
        score += 5
    if dex4 in normalized:
        score += 5
    if english and english in normalized:
        score += 6
    if _has_sprite_marker(file_name):
        score += 7 if "sprite" in kind else -4
    if _has_official_marker(file_name):
        score += 7 if "official" in kind.lower() else -2
    if "dream" in normalized:
        score -= 3
    if "home" in normalized:
        score += 1
    if re.search(r"mega|alola|galar|hisui|paldea", normalized):
        score -= 4
    if _has_shiny_marker(file_name):
        score += 8 if kind.startswith("shiny") else -6
    if kind == "official" and not _has_sprite_marker(file_name) and not _has_shiny_marker(file_name):
        score += 4
    return score


def _score_form_image(file_name: str, seed: "PokemonSeed", form: dict, kind: str) -> int:
    normalized = file_name.lower()
    dex3, dex4, english = _pokemon_image_tokens(seed)
    hints, anti_hints = _form_hints(form["name_zh"])
    score = 0
    if dex3 in normalized:
        score += 5
    if dex4 in normalized:
        score += 5
    if english and english in normalized:
        score += 6
    # 提取文件名中编号后紧跟的后缀（如 HOME_003M_s.png → "m", HOME_019A_s → "a"）
    dex_suffix = _extract_dex_suffix(normalized, dex3, dex4)
    hint_matched = False
    for hint in hints:
        # 纯字母短 hint（≤2字符且全字母）使用编号后缀精确匹配，
        # 其他 hint（含下划线如 "_f"，或长 hint）使用子串匹配
        if len(hint) <= 2 and hint.isalpha():
            if dex_suffix and dex_suffix == hint:
                score += 10
                hint_matched = True
        else:
            if hint in normalized:
                score += 8
                hint_matched = True
    # 如果没有匹配到任何形态标记，大幅降分（避免基础图片被选为形态图）
    if hints and not hint_matched:
        score -= 10
    # 如果匹配到了其他形态的标记（如 X 形态的图被匹配给 Y），降分
    for anti in anti_hints:
        if len(anti) <= 2 and anti.isalpha():
            if dex_suffix and dex_suffix == anti:
                score -= 15
        else:
            if anti in normalized:
                score -= 15
    if _has_official_marker(file_name):
        score += 7
    if "home" in normalized:
        score += 5
    if "dream" in normalized:
        score -= 5
    if _has_sprite_marker(file_name):
        score -= 3 if kind == "shinyOfficial" else 12
    if _has_shiny_marker(file_name):
        score += 7 if kind == "shinyOfficial" else -6
    elif kind == "shinyOfficial":
        score -= 5
    return score


def _extract_dex_suffix(normalized_name: str, dex3: str, dex4: str) -> str | None:
    """从文件名中提取编号后紧跟的后缀字母。

    例如：
      HOME_003M_s.png  → "m"
      HOME_019A_s.png  → "a"
      HOME_006MX_s.png → "mx"
      HOME_003GM_s.png → "gm"
      HOME_003_s.png   → None (无后缀)
      HOME_003_f_s.png → None (_f 带下划线分隔，不是编号后缀)
      HOME_479F.png    → "f" (结冰洛托姆等形态后缀)

    注意：_f 格式（下划线+f）不会被提取，因为下划线不是字母，
    正则只匹配编号后紧跟的字母。所以雌性标记 _f 不受影响。
    """
    # 尝试匹配 dex4 或 dex3 后紧跟的字母
    for dex in (dex4, dex3):
        pattern = re.compile(rf"{re.escape(dex)}([a-z]{{1,2}})(?:[_.]|$)")
        m = pattern.search(normalized_name)
        if m:
            suffix = m.group(1)
            # 排除 px (缩略图尺寸标记)
            if suffix == "px":
                continue
            return suffix
    return None


def _form_hints(name_zh: str) -> tuple[list[str], list[str]]:
    """返回 (hints, anti_hints)，hints 是当前形态的文件名标记，anti_hints 是其他形态的标记。

    短 hint（≤2字符）会与编号后缀精确匹配（通过 _extract_dex_suffix），
    长 hint（>2字符）使用子串匹配。

    Wiki HOME 图片文件名后缀约定（按类别）：
      --- 超级进化 / 极巨化 ---
      M = Mega, MX/MY = Mega X/Y, MZ = Mega (Z-A), GM = Gigantamax
      --- 地区形态 ---
      A = Alola, G = Galar, H = Hisui, P = Paldea
      PA/PB/PC = Paldea Combat/Blaze/Aqua (肯泰罗帕底亚种)
      --- 传说 / 特殊形态 ---
      C = Crowned (剑之王/盾之王), O = Origin (起源形态),
      P = Primal (原始回归), U = Unbound/Ultra (解放/究极)
      T = Therian (灵兽形态), R = Rapid-Strike/Rider (连击流/骑乘)
      I = Ice Rider (骑白马), S = Shadow Rider (骑黑马)
      --- 外观 / 性别差异 ---
      _f = Female (雌性的样子)
      E = East (东海), B/W = Black/White or Blue/White
      S/Su/A/W = Summer/Autumn/Winter (季节)
      --- 战斗形态 ---
      Z = Zen (达摩模式), B = Blade (刀剑形态)
      DM/DW = Dusk Mane/Dawn Wings (黄昏之鬃/拂晓之翼)
      --- 其他 ---
      N = Neutral (放松模式), D = Dusk (黄昏), Mn = Midnight (黑夜)
      Sm/La/Su = Small/Large/Super (南瓜精尺寸)
      Go/Gu = Gorging/Gulping (古月鸟吞食)
      L = Low Key (低调), NF = No-ice Face (解冻头)
      HM = Hangry Mode (空腹花纹), Sc = School (鱼群)
      Po/Pa/Se = Pom-Pom/Pa'u/Sensu (花舞鸟风格)
      F = Family of Four (四只家庭), Th = Three-Segment (三节形态)
      R = Roaming (徒步形态), H = Hero (全能形态)
    """
    hints: list[str] = []
    anti_hints: list[str] = []

    # ── 超极巨化：GM 后缀（必须在超级之前检查，因为超极巨也包含"超"）──
    if "超极巨" in name_zh:
        hints.extend(["gm", "gigantamax"])
    elif "超级" in name_zh:
        # 超级进化：M 后缀
        if "Ｚ" in name_zh or "Z" in name_zh:
            # 超级进化 Z-A 版本：MZ 后缀（如超级阿勃梭鲁Ｚ）
            hints.extend(["mz"])
            anti_hints.extend(["m"])
        else:
            hints.extend(["m", "mega"])

    # ── 地区形态 ──
    if "阿罗拉" in name_zh:
        hints.extend(["a", "alola"])
    if "伽勒尔" in name_zh:
        hints.extend(["g", "galar"])
    if "洗翠" in name_zh:
        hints.extend(["h", "hisui"])
    if "帕底亚" in name_zh:
        hints.extend(["p", "paldea"])
        # 肯泰罗帕底亚种：PA = 斗战种, PB = 火炽种, PC = 水澜种
        if "斗战种" in name_zh:
            hints.clear()
            hints.extend(["pa"])
            anti_hints.extend(["pb", "pc"])
        elif "火炽种" in name_zh:
            hints.clear()
            hints.extend(["pb"])
            anti_hints.extend(["pa", "pc"])
        elif "水澜种" in name_zh:
            hints.clear()
            hints.extend(["pc"])
            anti_hints.extend(["pa", "pb"])

    # ── 超级进化 X/Y 形态：文件名中用 MX/MY 缩写 ──
    if "X" in name_zh or "Ｘ" in name_zh:
        hints.extend(["mx", "mega_x", "mega x"])
        anti_hints.extend(["my", "mega_y", "mega y"])
    elif "Y" in name_zh or "Ｙ" in name_zh:
        hints.extend(["my", "mega_y", "mega y"])
        anti_hints.extend(["mx", "mega_x", "mega x"])

    # ── 传说 / 特殊形态 ──
    # Crowned 形态（苍响-剑之王 / 藏玛然特-盾之王）：C 后缀
    if "剑之王" in name_zh or "盾之王" in name_zh:
        hints.extend(["c", "crowned"])
    # Origin 形态（骑拉帝纳/帕路奇亚/帝牙卢卡-起源形态）：O 后缀
    if "起源" in name_zh:
        hints.extend(["o", "origin"])
    # Primal 原始回归（盖欧卡/固拉多）：P 后缀
    if "原始" in name_zh:
        hints.extend(["p", "primal"])
    # Therian 灵兽形态（龙卷云/雷电云/土地云/眷恋云）：T 后缀
    if "灵兽" in name_zh:
        hints.extend(["t", "therian"])
    # Unbound/Ultra 解放形态（胡帕/究极奈克洛兹玛）：U 后缀
    if "解放" in name_zh or "究极" in name_zh:
        hints.extend(["u", "unbound"])

    # ── 蕾冠王骑乘形态 ──
    if "骑白马" in name_zh:
        hints.extend(["i", "ice_rider", "ice rider"])
        anti_hints.extend(["s", "shadow_rider", "shadow rider"])
    elif "骑黑马" in name_zh:
        hints.extend(["s", "shadow_rider", "shadow rider"])
        anti_hints.extend(["i", "ice_rider", "ice rider"])

    # ── 武道熊师：R = Rapid-Strike (连击流) ──
    if "连击流" in name_zh and "超极巨" not in name_zh:
        hints.extend(["r", "rapid_strike"])
    # 超极巨化武道熊师连击流：RGM 后缀
    if "连击流" in name_zh and "超极巨" in name_zh:
        hints.clear()
        hints.extend(["rgm"])
        anti_hints.extend(["gm"])

    # ── 奈克洛兹玛形态 ──
    if "黄昏之鬃" in name_zh:
        hints.extend(["dm", "dusk_mane"])
        anti_hints.extend(["dw"])
    elif "拂晓之翼" in name_zh:
        hints.extend(["dw", "dawn_wings"])
        anti_hints.extend(["dm"])

    # ── 酋雷姆形态：B = Black (暗黑), W = White (焰白) ──
    if "暗黑" in name_zh:
        hints.extend(["b", "black"])
        anti_hints.extend(["w"])
    elif "焰白" in name_zh:
        hints.extend(["w", "white"])
        anti_hints.extend(["b"])

    # ── 性别差异：_f 后缀 ──
    if "雌性" in name_zh:
        hints.extend(["_f", "female"])

    # ── 飘浮泡泡形态：S = Sunny (太阳), R = Rainy (雨水), H = Snowy (雪云) ──
    if "太阳的样子" in name_zh:
        hints.extend(["s", "sunny"])
        anti_hints.extend(["r", "h"])
    elif "雨水的样子" in name_zh:
        hints.extend(["r", "rainy"])
        anti_hints.extend(["s", "h"])
    elif "雪云的样子" in name_zh:
        hints.extend(["h", "snowy"])
        anti_hints.extend(["s", "r"])

    # ── 代欧奇希斯形态：A = Attack, D = Defense, S = Speed ──
    if "攻击形态" in name_zh:
        hints.extend(["a", "attack"])
        anti_hints.extend(["d", "s"])
    elif "防御形态" in name_zh:
        hints.extend(["d", "defense"])
        anti_hints.extend(["a", "s"])
    elif "速度形态" in name_zh:
        hints.extend(["s", "speed"])
        anti_hints.extend(["a", "d"])

    # ── 结草儿/结草贵妇蓑衣：S = Sandy (砂土), G = Trash (垃圾) ──
    if "砂土蓑衣" in name_zh:
        hints.extend(["s", "sandy"])
        anti_hints.extend(["g"])
    elif "垃圾蓑衣" in name_zh:
        hints.extend(["g", "trash"])
        anti_hints.extend(["s"])

    # ── 樱花儿晴天形态：S 后缀 ──
    if "晴天形态" in name_zh:
        hints.extend(["s", "sunshine"])

    # ── 无壳海兔/海兔兽东海：E = East ──
    if "东海" in name_zh:
        hints.extend(["e", "east"])

    # ── 洛托姆形态 ──
    if "加热" in name_zh:
        hints.extend(["h", "heat"])
        anti_hints.extend(["w", "fa", "f", "m"])
    elif "清洗" in name_zh:
        hints.extend(["w", "wash"])
        anti_hints.extend(["h", "fa", "f", "m"])
    elif "结冰" in name_zh:
        hints.extend(["f", "frost"])
        anti_hints.extend(["h", "w", "fa", "m"])
    elif "旋转" in name_zh:
        hints.extend(["fa", "fan"])
        anti_hints.extend(["h", "w", "f", "m"])
    elif "切割" in name_zh:
        hints.extend(["m", "mow"])
        anti_hints.extend(["h", "w", "f", "fa"])

    # ── 谢米天空形态：S 后缀 ──
    if "天空形态" in name_zh:
        hints.extend(["s", "sky"])

    # ── 野蛮鲈鱼：B = Blue (蓝条纹), W = White (白条纹) ──
    if "蓝条纹" in name_zh:
        hints.extend(["b", "blue"])
        anti_hints.extend(["w"])
    elif "白条纹" in name_zh:
        hints.extend(["w", "white_stripe"])
        anti_hints.extend(["b"])

    # ── 达摩狒狒达摩模式：Z = Zen ──
    if "达摩模式" in name_zh and "伽勒尔" not in name_zh:
        hints.extend(["z", "zen"])
        anti_hints.extend(["gz"])
    elif "达摩模式" in name_zh and "伽勒尔" in name_zh:
        hints.extend(["gz"])
        anti_hints.extend(["z", "g"])

    # ── 四季鹿/萌芽鹿季节：S = Summer, A = Autumn, W = Winter ──
    if "夏天的样子" in name_zh:
        hints.extend(["s", "summer"])
        anti_hints.extend(["a", "w"])
    elif "秋天的样子" in name_zh:
        hints.extend(["a", "autumn"])
        anti_hints.extend(["s", "w"])
    elif "冬天的样子" in name_zh:
        hints.extend(["w", "winter"])
        anti_hints.extend(["s", "a"])

    # ── 凯路迪欧觉悟形态：R = Resolute ──
    if "觉悟" in name_zh:
        hints.extend(["r", "resolute"])

    # ── 美洛耶塔舞步形态：P = Pirouette ──
    if "舞步" in name_zh:
        hints.extend(["p", "pirouette"])

    # ── 甲贺忍蛙牵绊变身：A = Ash (小智版) ──
    if "牵绊变身" in name_zh:
        hints.extend(["a", "ash"])

    # ── 花叶蒂永恒之花：E = Eternal ──
    if "永恒之花" in name_zh:
        hints.extend(["e", "eternal"])

    # ── 坚盾剑怪刀剑形态：B = Blade ──
    if "刀剑形态" in name_zh:
        hints.extend(["b", "blade"])

    # ── 南瓜精/南瓜怪人尺寸：Sm = Small, La = Large, Su = Super ──
    if "小颗种" in name_zh:
        hints.extend(["sm", "small"])
        anti_hints.extend(["la", "su"])
    elif "大颗种" in name_zh:
        hints.extend(["la", "large"])
        anti_hints.extend(["sm", "su"])
    elif "巨颗种" in name_zh:
        hints.extend(["su", "super"])
        anti_hints.extend(["sm", "la"])

    # ── 哲尔尼亚斯放松模式：N = Neutral ──
    if "放松模式" in name_zh:
        hints.extend(["n", "neutral"])

    # ── 基格尔德形态：T = 10%, C = Complete ──
    if "１０％" in name_zh or "10%" in name_zh:
        hints.extend(["t", "ten"])
        anti_hints.extend(["c"])
    elif "完全体" in name_zh:
        hints.extend(["c", "complete"])
        anti_hints.extend(["t"])

    # ── 花舞鸟风格：Po = Pom-Pom (啪滋啪滋), Pa = Pa'u (呼拉呼拉), Se = Sensu (轻盈轻盈) ──
    if "啪滋啪滋" in name_zh:
        hints.extend(["po"])
        anti_hints.extend(["pa", "se"])
    elif "呼拉呼拉" in name_zh:
        hints.extend(["pa"])
        anti_hints.extend(["po", "se"])
    elif "轻盈轻盈" in name_zh:
        hints.extend(["se"])
        anti_hints.extend(["pa", "po"])

    # ── 鬃岩狼人形态：Mn = Midnight (黑夜), D = Dusk (黄昏) ──
    if "黑夜的样子" in name_zh:
        hints.extend(["mn", "midnight"])
        anti_hints.extend(["d"])
    elif "黄昏的样子" in name_zh:
        hints.extend(["d", "dusk"])
        anti_hints.extend(["mn"])

    # ── 弱丁鱼鱼群形态：Sc = School ──
    if "鱼群" in name_zh:
        hints.extend(["sc", "school"])

    # ── 小陨星核心：R = Core (实际文件名用 R，但也有多色版本) ──
    if "核心" in name_zh:
        hints.extend(["r", "core"])

    # ── 谜拟Q现形：B = Busted ──
    if "现形" in name_zh:
        hints.extend(["b", "busted"])

    # ── 玛机雅娜500年前颜色：O = Original ──
    if "５００年前" in name_zh or "500年前" in name_zh:
        if "超级" in name_zh:
            hints.extend(["om"])
            anti_hints.extend(["m", "o"])
        else:
            hints.extend(["o", "original"])
            anti_hints.extend(["om"])

    # ── 古月鸟吞食形态：Go = Gorging (一口吞), Gu = Gulping (大口吞) ──
    if "一口吞" in name_zh:
        hints.extend(["go", "gorging"])
        anti_hints.extend(["gu"])
    elif "大口吞" in name_zh:
        hints.extend(["gu", "gulping"])
        anti_hints.extend(["go"])

    # ── 颤弦蝾螈低调：L = Low Key ──
    if "低调" in name_zh:
        hints.extend(["l", "low_key"])

    # ── 冰砌鹅解冻头：NF = No-ice Face ──
    if "解冻头" in name_zh:
        hints.extend(["nf", "noice"])

    # ── 莫鲁贝可空腹花纹：HM = Hangry Mode ──
    if "空腹花纹" in name_zh:
        hints.extend(["hm", "hangry"])

    # ── 无极汰那无极巨化：E = Eternamax ──
    if "无极巨化" in name_zh:
        hints.extend(["e", "eternamax"])

    # ── 萨戮德阿爸：D = Dada ──
    if "阿爸" in name_zh:
        hints.extend(["d", "dada"])

    # ── 月月熊赫月：B = Bloodmoon ──
    if "赫月" in name_zh:
        hints.extend(["b", "bloodmoon"])

    # ── 一家鼠四只家庭：F = Family of Four ──
    if "四只家庭" in name_zh:
        hints.extend(["f", "family"])

    # ── 怒鹦哥羽毛颜色：B = Blue, Y = Yellow, W = White ──
    if "蓝羽毛" in name_zh:
        hints.extend(["b", "blue"])
        anti_hints.extend(["y", "w"])
    elif "黄羽毛" in name_zh:
        hints.extend(["y", "yellow"])
        anti_hints.extend(["b", "w"])
    elif "白羽毛" in name_zh:
        hints.extend(["w", "white"])
        anti_hints.extend(["b", "y"])

    # ── 海豚侠全能形态：H = Hero ──
    if "全能形态" in name_zh:
        hints.extend(["h", "hero"])

    # ── 米立龙姿势：D = Droopy (下垂), S = Stretchy (平挺) ──
    if "下垂姿势" in name_zh:
        if "超级" in name_zh:
            hints.extend(["dm"])
            anti_hints.extend(["sm", "m", "d", "s"])
        else:
            hints.extend(["d", "droopy"])
            anti_hints.extend(["s"])
    elif "平挺姿势" in name_zh:
        if "超级" in name_zh:
            hints.extend(["sm"])
            anti_hints.extend(["dm", "m", "d", "s"])
        else:
            hints.extend(["s", "stretchy"])
            anti_hints.extend(["d"])

    # ── 土龙节节三节形态：Th = Three-Segment ──
    if "三节形态" in name_zh:
        hints.extend(["th", "three"])

    # ── 索财灵徒步形态：R = Roaming ──
    if "徒步形态" in name_zh:
        hints.extend(["r", "roaming"])

    # ── 厄诡椪面具形态：W = Wellspring (水井), H = Hearthflame (火灶), C = Cornerstone (础石) ──
    if "水井面具" in name_zh:
        hints.extend(["w", "wellspring"])
        anti_hints.extend(["h", "hearthflame", "c", "cornerstone"])
    elif "火灶面具" in name_zh:
        hints.extend(["h", "hearthflame"])
        anti_hints.extend(["w", "wellspring", "c", "cornerstone"])
    elif "础石面具" in name_zh:
        hints.extend(["c", "cornerstone"])
        anti_hints.extend(["w", "wellspring", "h", "hearthflame"])

    # ── 太乐巴戈斯形态：T = Terastal (太晶), S = Stellar (星晶) ──
    if "太晶形态" in name_zh:
        hints.extend(["t", "terastal"])
        anti_hints.extend(["s", "stellar"])
    elif "星晶形态" in name_zh:
        hints.extend(["s", "stellar"])
        anti_hints.extend(["t", "terastal"])

    return hints, anti_hints
