from __future__ import annotations

# 列表页 URL
POKEMON_LIST_URL = "https://wiki.52poke.com/wiki/%E5%AE%9D%E5%8F%AF%E6%A2%A6%E5%88%97%E8%A1%A8%EF%BC%88%E6%8C%89%E5%85%A8%E5%9B%BD%E5%9B%BE%E9%89%B4%E7%BC%96%E5%8F%B7%EF%BC%89/%E7%AE%80%E5%8D%95%E7%89%88"
ITEM_LIST_URL = "https://wiki.52poke.com/wiki/%E9%81%93%E5%85%B7%E5%88%97%E8%A1%A8"
MOVE_LIST_URL = "https://wiki.52poke.com/wiki/%E6%8B%9B%E5%BC%8F%E5%88%97%E8%A1%A8"
ABILITY_LIST_URL = "https://wiki.52poke.com/wiki/%E7%89%B9%E6%80%A7%E5%88%97%E8%A1%A8"

POKEMON_TYPES = {
    "一般", "火", "水", "电", "草", "冰", "格斗", "毒", "地面",
    "飞行", "超能力", "虫", "岩石", "幽灵", "龙", "恶", "钢", "妖精",
}
MOVE_CATEGORIES = {"物理", "特殊", "变化"}

# 游戏版本名 → (世代, game_version_code) 映射
# 用于解析"特性变更"/"招式变更"章节中的游戏版本子标题
GAME_VERSION_INFO: dict[str, tuple[int, str]] = {
    "红绿蓝": (1, "RG"), "紅綠藍": (1, "RG"), "红绿": (1, "RG"), "紅綠": (1, "RG"),
    "皮卡丘": (1, "Y"), "黄": (1, "Y"),
    "金银": (2, "GS"), "金銀": (2, "GS"), "水晶": (2, "C"),
    "红宝石": (3, "RS"), "紅寶石": (3, "RS"), "蓝宝石": (3, "RS"), "藍寶石": (3, "RS"),
    "绿宝石": (3, "E"), "綠寶石": (3, "E"),
    "火红": (3, "FRLG"), "火紅": (3, "FRLG"), "叶绿": (3, "FRLG"), "葉綠": (3, "FRLG"),
    "钻石": (4, "DP"), "鑽石": (4, "DP"), "珍珠": (4, "DP"),
    "白金": (4, "Pt"),
    "心金": (4, "HGSS"), "魂银": (4, "HGSS"), "魂銀": (4, "HGSS"),
    "黑": (5, "BW"), "白": (5, "BW"), "黑2": (5, "B2W2"), "白2": (5, "B2W2"),
    "X": (6, "XY"), "Y": (6, "XY"),
    "欧米伽红宝石": (6, "ORAS"), "歐米伽紅寶石": (6, "ORAS"),
    "阿尔法蓝宝石": (6, "ORAS"), "阿爾法藍寶石": (6, "ORAS"),
    "太阳": (7, "SM"), "太陽": (7, "SM"), "月亮": (7, "SM"),
    "究极之日": (7, "USUM"), "究極之日": (7, "USUM"),
    "究极之月": (7, "USUM"), "究極之月": (7, "USUM"),
    "Let's Go! 皮卡丘": (7, "LPLE"), "Let's Go! 伊布": (7, "LPLE"),
    "Let's Go!皮卡丘": (7, "LPLE"), "Let's Go!伊布": (7, "LPLE"),
    "剑": (8, "SWSH"), "劍": (8, "SWSH"), "盾": (8, "SWSH"),
    "劍／盾": (8, "SWSH"), "剑／盾": (8, "SWSH"),
    "晶灿钻石": (8, "BDSP"), "晶燦鑽石": (8, "BDSP"), "明亮珍珠": (8, "BDSP"),
    "晶灿钻石／明亮珍珠": (8, "BDSP"),
    "传说 阿尔宙斯": (8, "LA"), "傳說 阿爾宙斯": (8, "LA"),
    "传说阿尔宙斯": (8, "LA"), "傳說阿爾宙斯": (8, "LA"),
    "朱": (9, "SV"), "紫": (9, "SV"), "朱／紫": (9, "SV"),
    "零之秘宝": (9, "SVT"),
    "传说 Z-A": (9, "ZA"), "傳說 Z-A": (9, "ZA"),
    "传说Z-A": (9, "ZA"), "傳說Z-A": (9, "ZA"),
    "宝可梦ZA": (9, "ZA"), "寶可夢ZA": (9, "ZA"),
    "Champions": (99, "CHAMP"),
}
# 向后兼容：仅世代映射
GAME_VERSION_GENERATION: dict[str, int] = {k: v[0] for k, v in GAME_VERSION_INFO.items()}

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
GENERATION_NAMES = {value: key for key, value in CHINESE_GENERATIONS.items()}
