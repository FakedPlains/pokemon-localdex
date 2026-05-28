#!/usr/bin/env python3
"""
Generate seed-battle-effects.sql with verified DB IDs.
Run: python3 scripts/gen-seed-sql.py
Output: scripts/seed-battle-effects.sql
"""
import json, os, sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "seed-battle-effects.sql")

def val(v):
    if v is None: return "NULL"
    if isinstance(v, str): return f"'{v}'"
    return str(v)

def insert_block(table, cols, rows):
    lines = [f"INSERT INTO {table}\n  ({', '.join(cols)})\nVALUES"]
    for i, r in enumerate(rows):
        comma = "," if i < len(rows)-1 else ";"
        lines.append(f"  ({', '.join(val(v) for v in r)}){comma}")
    return "\n".join(lines) + "\n"

# Column definitions
ABE_COLS = ["ability_id","effect_type","trigger","target","modifier_type","modifier_value",
            "affected_stat","affected_type","affected_move_flag","affected_move_category",
            "params","generation_start","generation_end","priority","note"]
IBE_COLS = ["item_id","effect_type","trigger","target","modifier_type","modifier_value",
            "affected_stat","affected_type","affected_move_flag","affected_move_category",
            "params","consumable","species_restriction","generation_start","generation_end","priority","note"]
MBE_COLS = ["move_id","effect_type","trigger","target","modifier_type","modifier_value",
            "affected_stat","affected_type","affected_move_flag","affected_move_category",
            "params","generation_start","generation_end","priority","note"]

# ============================================================================
# ABILITY DATA
# ============================================================================
abilities = [
    # A. Weather setters
    (2,401,2,7,4,2,None,None,None,None,'{"turns":5}',3,None,0,'Drizzle: rain 5t'),
    (70,401,2,7,4,1,None,None,None,None,'{"turns":5}',3,None,0,'Drought: sun 5t'),
    (45,401,2,7,4,3,None,None,None,None,'{"turns":5}',3,None,0,'Sand Stream: sand 5t'),
    (117,401,2,7,4,4,None,None,None,None,'{"turns":5}',4,None,0,'Snow Warning: snow 5t'),
    (189,401,2,7,4,6,None,None,None,None,'{"permanent":true}',6,None,0,'Primordial Sea: heavy rain'),
    (190,401,2,7,4,5,None,None,None,None,'{"permanent":true}',6,None,0,'Desolate Land: harsh sun'),
    (191,401,2,7,4,7,None,None,None,None,'{"permanent":true}',6,None,0,'Delta Stream: strong winds'),
    # B. Terrain setters
    (226,402,2,7,5,1,None,None,None,None,'{"turns":5}',7,None,0,'Electric Surge'),
    (229,402,2,7,5,2,None,None,None,None,'{"turns":5}',7,None,0,'Grassy Surge'),
    (228,402,2,7,5,3,None,None,None,None,'{"turns":5}',7,None,0,'Misty Surge'),
    (227,402,2,7,5,4,None,None,None,None,'{"turns":5}',7,None,0,'Psychic Surge'),
    # C. Weather/Terrain + stat
    (288,401,2,7,4,1,None,None,None,None,'{"turns":5}',9,None,0,'Orichalcum Pulse: set sun'),
    (288,101,5,1,1,1.3333,2,None,None,None,'{"weather":1}',9,None,1,'Orichalcum Pulse: sun Atk x1.3333'),
    (289,402,2,7,5,1,None,None,None,None,'{"turns":5}',9,None,0,'Hadron Engine: set elec terrain'),
    (289,101,6,1,1,1.3333,4,None,None,None,'{"terrain":1}',9,None,1,'Hadron Engine: elec SpA x1.3333'),
    # D. Type immunities
    (26,301,1,1,3,None,None,9,None,None,None,3,None,0,'Levitate: immune Ground'),
    (25,301,1,1,6,None,None,None,None,None,'{"condition":"only_super_effective_hits"}',3,None,0,'Wonder Guard: only SE hits'),
    # E. Type absorb
    (10,302,12,1,9,0.25,None,4,None,None,None,3,None,0,'Volt Absorb: immune Electric heal 25%'),
    (11,302,12,1,9,0.25,None,3,None,None,None,3,None,0,'Water Absorb: immune Water heal 25%'),
    (18,302,12,1,1,1.5,None,2,None,None,'{"boost_type":2}',3,None,0,'Flash Fire: immune Fire boost x1.5'),
    (31,302,12,1,2,1,4,4,None,None,None,5,None,0,'Lightning Rod: immune Electric SpA+1'),
    (114,302,12,1,2,1,4,3,None,None,None,5,None,0,'Storm Drain: immune Water SpA+1'),
    (78,302,12,1,2,1,6,4,None,None,None,4,None,0,'Motor Drive: immune Electric Spe+1'),
    (157,302,12,1,2,1,2,5,None,None,None,5,None,0,'Sap Sipper: immune Grass Atk+1'),
    (297,302,12,1,9,0.25,None,9,None,None,None,9,None,0,'Earth Eater: immune Ground heal 25%'),
    (273,302,12,1,2,2,3,2,None,None,None,9,None,0,'Well-Baked Body: immune Fire Def+2'),
    (274,302,12,1,2,1,2,None,8,None,None,9,None,0,'Wind Rider: immune Wind Atk+1'),
    (87,302,12,1,9,0.25,None,3,None,None,None,4,None,0,'Dry Skin: immune Water heal 25%'),
    (87,202,12,1,1,1.25,None,2,None,None,None,4,None,1,'Dry Skin: Fire damage x1.25'),
    # F. Constant stat multipliers
    (37,101,1,1,1,2.0,2,None,None,None,None,3,None,0,'Huge Power: Atk x2'),
    (74,101,1,1,1,2.0,2,None,None,None,None,3,None,0,'Pure Power: Atk x2'),
    (255,101,1,1,1,1.5,2,None,None,None,'{"lock_move":true}',8,None,0,'Gorilla Tactics: Atk x1.5 lock'),
    (169,101,1,1,1,2.0,3,None,None,None,None,6,None,0,'Fur Coat: Def x2'),
    # G. Conditional stat multipliers
    (55,101,7,1,1,1.5,2,None,None,1,'{"accuracy_penalty":0.8}',3,None,0,'Hustle: phys Atk x1.5'),
    (62,101,11,1,1,1.5,2,None,None,None,None,3,None,0,'Guts: status Atk x1.5'),
    (63,101,11,1,1,1.5,3,None,None,None,None,3,None,0,'Marvel Scale: status Def x1.5'),
    (95,101,11,1,1,1.5,6,None,None,None,None,4,None,0,'Quick Feet: status Spe x1.5'),
    (33,101,5,1,1,2.0,6,None,None,None,'{"weather":2}',3,None,0,'Swift Swim: rain Spe x2'),
    (34,101,5,1,1,2.0,6,None,None,None,'{"weather":1}',3,None,0,'Chlorophyll: sun Spe x2'),
    (146,101,5,1,1,2.0,6,None,None,None,'{"weather":3}',5,None,0,'Sand Rush: sand Spe x2'),
    (202,101,5,1,1,2.0,6,None,None,None,'{"weather":4}',7,None,0,'Slush Rush: snow Spe x2'),
    (207,101,6,1,1,2.0,6,None,None,None,'{"terrain":1}',7,None,0,'Surge Surfer: elec Spe x2'),
    (84,101,1,1,1,2.0,6,None,None,None,'{"condition":"item_consumed"}',4,None,0,'Unburden: Spe x2 after item'),
    (94,101,5,1,1,1.5,4,None,None,None,'{"weather":1,"hp_cost":0.125}',4,None,0,'Solar Power: sun SpA x1.5'),
    (112,101,2,1,1,0.5,2,None,None,None,'{"duration":5}',4,None,0,'Slow Start: 5t Atk x0.5'),
    (112,101,2,1,1,0.5,6,None,None,None,'{"duration":5}',4,None,1,'Slow Start: 5t Spe x0.5'),
    (129,101,3,1,1,0.5,2,None,None,None,'{"threshold":0.5}',5,None,0,'Defeatist: HP<=50% Atk x0.5'),
    (129,101,3,1,1,0.5,4,None,None,None,'{"threshold":0.5}',5,None,1,'Defeatist: HP<=50% SpA x0.5'),
    # H. Move power by flag
    (181,201,7,1,1,1.3,None,None,1,None,None,6,None,0,'Tough Claws: contact x1.3'),
    (89,201,7,1,1,1.2,None,None,3,None,None,4,None,0,'Iron Fist: punch x1.2'),
    (178,201,7,1,1,1.5,None,None,5,None,None,6,None,0,'Mega Launcher: pulse x1.5'),
    (173,201,7,1,1,1.5,None,None,4,None,None,6,None,0,'Strong Jaw: bite x1.5'),
    (120,201,7,1,1,1.2,None,None,10,None,None,4,None,0,'Reckless: recoil x1.2'),
    (292,201,7,1,1,1.5,None,None,9,None,None,9,None,0,'Sharpness: slicing x1.5'),
    (244,201,7,1,1,1.3,None,None,2,None,None,8,None,0,'Punk Rock: sound x1.3 offensive'),
    (244,202,8,1,1,0.5,None,None,2,None,None,8,None,1,'Punk Rock: sound x0.5 defensive'),
    # I. Move power by type
    (276,201,13,1,1,1.5,None,13,None,None,None,9,None,0,'Rocky Payload: Rock x1.5'),
    (200,201,13,1,1,1.5,None,17,None,None,None,7,None,0,'Steelworker: Steel x1.5'),
    (263,201,13,1,1,1.5,None,15,None,None,None,8,None,0,'Dragons Maw: Dragon x1.5'),
    (262,201,13,1,1,1.5,None,4,None,None,None,8,8,0,'Transistor: Electric x1.5 Gen8'),
    (262,201,13,1,1,1.3,None,4,None,None,None,9,None,0,'Transistor: Electric x1.3 Gen9+'),
    # J. Conditional power boosts
    (101,201,15,1,1,1.5,None,None,None,None,'{"max_bp":60}',4,None,0,'Technician: bp<=60 x1.5'),
    (148,201,16,1,1,1.3,None,None,None,None,None,5,None,0,'Analytic: last x1.3'),
    (198,201,7,1,1,2.0,None,None,None,None,'{"condition":"target_switched_in"}',7,None,0,'Stakeout: vs switch x2'),
    (125,201,7,1,1,1.3,None,None,None,None,'{"condition":"has_secondary_effect"}',5,None,0,'Sheer Force: secondary x1.3'),
    (137,201,11,1,1,1.5,None,None,None,1,'{"status":"poison"}',5,None,0,'Toxic Boost: poison phys x1.5'),
    (138,201,11,1,1,1.5,None,None,None,2,'{"status":"burn"}',5,None,0,'Flare Boost: burn spec x1.5'),
    (65,201,3,1,1,1.5,None,5,None,None,'{"hp_threshold":0.333}',3,None,0,'Overgrow: HP<=1/3 Grass x1.5'),
    (66,201,3,1,1,1.5,None,2,None,None,'{"hp_threshold":0.333}',3,None,0,'Blaze: HP<=1/3 Fire x1.5'),
    (67,201,3,1,1,1.5,None,3,None,None,'{"hp_threshold":0.333}',3,None,0,'Torrent: HP<=1/3 Water x1.5'),
    (68,201,3,1,1,1.5,None,12,None,None,'{"hp_threshold":0.333}',3,None,0,'Swarm: HP<=1/3 Bug x1.5'),
    (159,205,5,1,1,1.3,None,None,None,None,'{"weather":3,"boosted_types":[13,9,17]}',5,None,0,'Sand Force: sand Rock/Ground/Steel x1.3'),
    (199,201,13,1,1,2.0,None,3,None,None,None,7,None,0,'Water Bubble: Water x2'),
    (199,202,8,1,1,0.5,None,2,None,None,None,7,None,1,'Water Bubble: Fire received x0.5'),
    # K. Damage reduction
    (47,202,8,1,1,0.5,None,2,None,None,None,3,None,0,'Thick Fat: Fire x0.5'),
    (47,202,8,1,1,0.5,None,6,None,None,None,3,None,1,'Thick Fat: Ice x0.5'),
    (85,202,8,1,1,0.5,None,2,None,None,None,4,None,0,'Heatproof: Fire x0.5'),
    (272,202,8,1,1,0.5,None,14,None,None,None,9,None,0,'Purifying Salt: Ghost x0.5'),
    (246,202,8,1,1,0.5,None,None,None,2,None,8,None,0,'Ice Scales: special x0.5'),
    (136,202,4,1,1,0.5,None,None,None,None,None,5,None,0,'Multiscale: full HP x0.5'),
    (231,202,4,1,1,0.5,None,None,None,None,None,7,None,0,'Shadow Shield: full HP x0.5'),
    (218,202,9,1,1,0.5,None,None,1,None,None,7,None,0,'Fluffy: contact x0.5'),
    (218,202,12,1,1,2.0,None,2,None,None,None,7,None,1,'Fluffy: Fire x2'),
    # L. SE / resistance
    (111,203,10,1,1,0.75,None,None,None,None,None,4,None,0,'Filter: SE x0.75'),
    (116,203,10,1,1,0.75,None,None,None,None,None,4,None,0,'Solid Rock: SE x0.75'),
    (232,203,10,1,1,0.75,None,None,None,None,None,7,None,0,'Prism Armor: SE x0.75'),
    (233,203,7,1,1,1.25,None,None,None,None,None,7,None,0,'Neuroforce: SE x1.25'),
    (110,204,7,1,1,2.0,None,None,None,None,None,4,None,0,'Tinted Lens: NVE x2'),
    # M. STAB
    (91,305,1,1,1,2.0,None,None,None,None,None,4,None,0,'Adaptability: STAB=2.0'),
    # N. Skins
    (182,303,13,1,1,1.2,None,18,None,None,'{"from_type":1,"to_type":18}',6,None,0,'Pixilate: Normal->Fairy x1.2'),
    (184,303,13,1,1,1.2,None,10,None,None,'{"from_type":1,"to_type":10}',6,None,0,'Aerilate: Normal->Flying x1.2'),
    (174,303,13,1,1,1.2,None,6,None,None,'{"from_type":1,"to_type":6}',6,None,0,'Refrigerate: Normal->Ice x1.2'),
    (206,303,13,1,1,1.2,None,4,None,None,'{"from_type":1,"to_type":4}',7,None,0,'Galvanize: Normal->Electric x1.2'),
    (312,303,13,1,1,1.2,None,15,None,None,'{"from_type":1,"to_type":15}',9,None,0,'Draconize: Normal->Dragon x1.2'),
    (96,303,1,1,1,1.0,None,1,None,None,'{"from_type":"all","to_type":1}',4,6,0,'Normalize: all->Normal Gen4-6'),
    (96,303,1,1,1,1.2,None,1,None,None,'{"from_type":"all","to_type":1}',7,None,0,'Normalize: all->Normal x1.2 Gen7+'),
    (204,303,7,1,1,1.0,None,3,2,None,'{"to_type":3}',7,None,0,'Liquid Voice: sound->Water'),
    # O. Auras
    (186,201,1,7,1,1.33,None,16,None,None,None,6,None,0,'Dark Aura: field Dark x1.33'),
    (187,201,1,7,1,1.33,None,18,None,None,None,6,None,0,'Fairy Aura: field Fairy x1.33'),
    (188,201,1,7,1,0.75,None,None,None,None,'{"condition":"reverses_aura"}',6,None,0,'Aura Break: x0.75'),
    # P. Ruin
    (284,101,1,3,1,0.75,4,None,None,None,None,9,None,0,'Vessel of Ruin: foe SpA x0.75'),
    (285,101,1,3,1,0.75,3,None,None,None,None,9,None,0,'Sword of Ruin: foe Def x0.75'),
    (286,101,1,3,1,0.75,2,None,None,None,None,9,None,0,'Tablets of Ruin: foe Atk x0.75'),
    (287,101,1,3,1,0.75,5,None,None,None,None,9,None,0,'Beads of Ruin: foe SpD x0.75'),
    # Q. Stat stage on entry
    (22,102,2,3,2,-1,2,None,None,None,None,3,None,0,'Intimidate: foe Atk -1'),
    (88,102,2,1,2,1,None,None,None,None,'{"condition":"compare_def_spd"}',4,None,0,'Download: +1 Atk or SpA'),
    (234,102,2,1,2,1,2,None,None,None,None,8,None,0,'Intrepid Sword: Atk +1'),
    (235,102,2,1,2,1,3,None,None,None,None,8,None,0,'Dauntless Shield: Def +1'),
    (306,102,2,3,2,-1,8,None,None,None,None,9,None,0,'Supersweet Syrup: foe Evasion -1'),
    # R. Crit
    (97,502,1,1,1,1.5,None,None,None,None,None,4,None,0,'Sniper: crit x1.5 extra'),
    (105,501,1,1,2,1,None,None,None,None,None,4,None,0,'Super Luck: crit +1'),
    (4,503,1,1,6,None,None,None,None,None,None,3,None,0,'Battle Armor: no crit'),
    (75,503,1,1,6,None,None,None,None,None,None,3,None,0,'Shell Armor: no crit'),
    # S. Ally
    (252,201,1,5,1,1.5,None,17,None,None,None,8,None,0,'Steely Spirit: team Steel x1.5'),
    (249,201,1,4,1,1.3,None,None,None,None,None,8,None,0,'Power Spot: ally x1.3'),
    (217,201,1,4,1,1.3,None,None,None,2,None,7,None,0,'Battery: ally special x1.3'),
    (132,202,1,4,1,0.75,None,None,None,None,None,5,None,0,'Friend Guard: ally dmg x0.75'),
    (162,101,1,5,1,1.1,7,None,None,None,None,5,None,0,'Victory Star: team acc x1.1'),
    # T. Special mechanics
    (185,901,7,2,8,2,None,None,None,None,'{"second_hit_multiplier":0.25}',7,None,0,'Parental Bond: 2 hits 2nd x0.25'),
    (293,201,17,1,1,1.1,None,None,None,None,'{"per_fainted_ally":0.1,"max":1.5}',9,None,0,'Supreme Overlord: +10% per fainted'),
    (153,201,7,1,1,1.25,None,None,None,None,'{"condition":"same_gender"}',4,None,0,'Rivalry: same gender x1.25'),
    (153,201,7,1,1,0.75,None,None,None,None,'{"condition":"opposite_gender"}',4,None,1,'Rivalry: opp gender x0.75'),
    # U. Mold Breaker
    (104,1002,7,2,6,None,None,None,None,None,None,4,None,0,'Mold Breaker: ignore ability'),
    (163,1002,7,2,6,None,None,None,None,None,None,5,None,0,'Turboblaze: ignore ability'),
    (164,1002,7,2,6,None,None,None,None,None,None,5,None,0,'Teravolt: ignore ability'),
]

# ============================================================================
# ITEM DATA
# ============================================================================
items = [
    # A. Choice
    (54,101,1,1,1,1.5,2,None,None,None,'{"lock_move":true}',0,None,3,None,0,'Choice Band: Atk x1.5'),
    (55,101,1,1,1,1.5,4,None,None,None,'{"lock_move":true}',0,None,4,None,0,'Choice Specs: SpA x1.5'),
    (56,101,1,1,1,1.5,6,None,None,None,'{"lock_move":true}',0,None,4,None,0,'Choice Scarf: Spe x1.5'),
    # B. Stat boost
    (106,201,7,1,1,1.1,None,None,None,1,None,0,None,4,None,0,'Muscle Band: phys x1.1'),
    (107,201,7,1,1,1.1,None,None,None,2,None,0,None,4,None,0,'Wise Glasses: spec x1.1'),
    (169,101,1,1,1,1.5,5,None,None,None,'{"block_category":3}',0,None,6,None,0,'Assault Vest: SpD x1.5'),
    (139,101,1,1,1,1.5,3,None,None,None,'{"condition":"not_fully_evolved"}',0,None,5,None,0,'Eviolite: Def x1.5 NFE'),
    (139,101,1,1,1,1.5,5,None,None,None,'{"condition":"not_fully_evolved"}',0,None,5,None,1,'Eviolite: SpD x1.5 NFE'),
    # C. Power boost
    (110,201,7,1,1,1.3,None,None,None,None,'{"recoil_fraction":0.1}',0,None,4,None,0,'Life Orb: x1.3 -10%'),
    (108,203,7,1,1,1.2,None,None,None,None,None,0,None,4,None,0,'Expert Belt: SE x1.2'),
    (220,201,7,1,1,1.1,None,None,3,None,'{"removes_contact":true}',0,None,9,None,0,'Punching Glove: punch x1.1'),
    # D. Type-boost items x1.2
    (31,201,13,1,1,1.2,None,1,None,None,None,0,None,2,None,0,'Silk Scarf: Normal x1.2'),
    (28,201,13,1,1,1.2,None,2,None,None,None,0,None,2,None,0,'Charcoal: Fire x1.2'),
    (22,201,13,1,1,1.2,None,3,None,None,None,0,None,2,None,0,'Mystic Water: Water x1.2'),
    (21,201,13,1,1,1.2,None,4,None,None,None,0,None,2,None,0,'Magnet: Electric x1.2'),
    (18,201,13,1,1,1.2,None,5,None,None,None,0,None,2,None,0,'Miracle Seed: Grass x1.2'),
    (25,201,13,1,1,1.2,None,6,None,None,None,0,None,2,None,0,'Never-Melt Ice: Ice x1.2'),
    (20,201,13,1,1,1.2,None,7,None,None,None,0,None,2,None,0,'Black Belt: Fighting x1.2'),
    (24,201,13,1,1,1.2,None,8,None,None,None,0,None,2,None,0,'Poison Barb: Poison x1.2'),
    (16,201,13,1,1,1.2,None,9,None,None,None,0,None,2,None,0,'Soft Sand: Ground x1.2'),
    (23,201,13,1,1,1.2,None,10,None,None,None,0,None,2,None,0,'Sharp Beak: Flying x1.2'),
    (27,201,13,1,1,1.2,None,11,None,None,None,0,None,2,None,0,'Twisted Spoon: Psychic x1.2'),
    (4,201,13,1,1,1.2,None,12,None,None,None,0,None,2,None,0,'Silver Powder: Bug x1.2'),
    (17,201,13,1,1,1.2,None,13,None,None,None,0,None,2,None,0,'Hard Stone: Rock x1.2'),
    (26,201,13,1,1,1.2,None,14,None,None,None,0,None,2,None,0,'Spell Tag: Ghost x1.2'),
    (29,201,13,1,1,1.2,None,15,None,None,None,0,None,2,None,0,'Dragon Fang: Dragon x1.2'),
    (19,201,13,1,1,1.2,None,16,None,None,None,0,None,2,None,0,'Black Glasses: Dark x1.2'),
    (12,201,13,1,1,1.2,None,17,None,None,None,0,None,2,None,0,'Metal Coat: Steel x1.2'),
    # E. Plates x1.2
    (77,201,13,1,1,1.2,None,2,None,None,None,0,None,4,None,0,'Flame Plate: Fire x1.2'),
    (78,201,13,1,1,1.2,None,3,None,None,None,0,None,4,None,0,'Splash Plate: Water x1.2'),
    (79,201,13,1,1,1.2,None,4,None,None,None,0,None,4,None,0,'Zap Plate: Electric x1.2'),
    (80,201,13,1,1,1.2,None,5,None,None,None,0,None,4,None,0,'Meadow Plate: Grass x1.2'),
    (81,201,13,1,1,1.2,None,6,None,None,None,0,None,4,None,0,'Icicle Plate: Ice x1.2'),
    (82,201,13,1,1,1.2,None,7,None,None,None,0,None,4,None,0,'Fist Plate: Fighting x1.2'),
    (83,201,13,1,1,1.2,None,8,None,None,None,0,None,4,None,0,'Toxic Plate: Poison x1.2'),
    (84,201,13,1,1,1.2,None,9,None,None,None,0,None,4,None,0,'Earth Plate: Ground x1.2'),
    (85,201,13,1,1,1.2,None,10,None,None,None,0,None,4,None,0,'Sky Plate: Flying x1.2'),
    (86,201,13,1,1,1.2,None,11,None,None,None,0,None,4,None,0,'Mind Plate: Psychic x1.2'),
    (87,201,13,1,1,1.2,None,12,None,None,None,0,None,4,None,0,'Insect Plate: Bug x1.2'),
    (88,201,13,1,1,1.2,None,13,None,None,None,0,None,4,None,0,'Stone Plate: Rock x1.2'),
    (89,201,13,1,1,1.2,None,14,None,None,None,0,None,4,None,0,'Spooky Plate: Ghost x1.2'),
    (90,201,13,1,1,1.2,None,15,None,None,None,0,None,4,None,0,'Draco Plate: Dragon x1.2'),
    (91,201,13,1,1,1.2,None,16,None,None,None,0,None,4,None,0,'Dread Plate: Dark x1.2'),
    (92,201,13,1,1,1.2,None,17,None,None,None,0,None,4,None,0,'Iron Plate: Steel x1.2'),
    (93,201,13,1,1,1.2,None,18,None,None,None,0,None,6,None,0,'Pixie Plate: Fairy x1.2'),
    # F. Species-restricted
    (37,101,1,1,1,2.0,2,None,None,None,None,0,'[104,105]',1,None,0,'Thick Club: Cubone/Marowak Atk x2'),
    (15,101,1,1,1,2.0,2,None,None,None,None,0,'[25]',4,None,0,'Light Ball: Pikachu Atk x2'),
    (15,101,1,1,1,2.0,4,None,None,None,None,0,'[25]',4,None,1,'Light Ball: Pikachu SpA x2'),
    (38,501,1,1,2,2,None,None,None,None,None,0,'[83,865]',2,None,0,'Leek: Farfetchd crit+2'),
    (34,501,1,1,2,2,None,None,None,None,None,0,'[113]',2,None,0,'Lucky Punch: Chansey crit+2'),
    (35,101,1,1,1,2.0,3,None,None,None,'{"condition":"not_transformed"}',0,'[132]',2,None,0,'Metal Powder: Ditto Def x2'),
    (36,101,1,1,1,2.0,6,None,None,None,'{"condition":"not_transformed"}',0,'[132]',4,None,0,'Quick Powder: Ditto Spe x2'),
    (59,101,1,1,1,2.0,5,None,None,None,None,0,'[366]',3,None,0,'Deep Sea Scale: Clamperl SpD x2'),
    (58,101,1,1,1,2.0,4,None,None,None,None,0,'[366]',3,None,0,'Deep Sea Tooth: Clamperl SpA x2'),
    # G. Gems
    (165,201,13,1,1,1.3,None,1,None,None,None,1,None,5,None,0,'Normal Gem: Normal x1.3'),
    (149,201,13,1,1,1.3,None,2,None,None,None,1,None,5,None,0,'Fire Gem: Fire x1.3'),
    (150,201,13,1,1,1.3,None,3,None,None,None,1,None,5,None,0,'Water Gem: Water x1.3'),
    (151,201,13,1,1,1.3,None,4,None,None,None,1,None,5,None,0,'Electric Gem: Electric x1.3'),
    # H. Resist berries
    (369,1003,10,1,1,0.5,None,2,None,None,None,1,None,3,None,0,'Occa Berry: SE Fire x0.5'),
    (365,1003,10,1,1,0.5,None,3,None,None,None,1,None,3,None,0,'Passho Berry: SE Water x0.5'),
    (399,1003,10,1,1,0.5,None,4,None,None,None,1,None,3,None,0,'Wacan Berry: SE Electric x0.5'),
    (397,1003,10,1,1,0.5,None,6,None,None,None,1,None,3,None,0,'Yache Berry: SE Ice x0.5'),
    (413,1003,10,1,1,0.5,None,7,None,None,None,1,None,3,None,0,'Chople Berry: SE Fighting x0.5'),
    (401,1003,10,1,1,0.5,None,8,None,None,None,1,None,3,None,0,'Kebia Berry: SE Poison x0.5'),
    (403,1003,10,1,1,0.5,None,9,None,None,None,1,None,3,None,0,'Shuca Berry: SE Ground x0.5'),
    (404,1003,10,1,1,0.5,None,10,None,None,None,1,None,3,None,0,'Coba Berry: SE Flying x0.5'),
    (405,1003,10,1,1,0.5,None,11,None,None,None,1,None,3,None,0,'Payapa Berry: SE Psychic x0.5'),
    (410,1003,10,1,1,0.5,None,12,None,None,None,1,None,3,None,0,'Tanga Berry: SE Bug x0.5'),
    (415,1003,10,1,1,0.5,None,13,None,None,None,1,None,3,None,0,'Charti Berry: SE Rock x0.5'),
    (411,1003,10,1,1,0.5,None,14,None,None,None,1,None,3,None,0,'Kasib Berry: SE Ghost x0.5'),
    (407,1003,10,1,1,0.5,None,17,None,None,None,1,None,3,None,0,'Babiri Berry: SE Steel x0.5'),
    (386,1003,8,1,1,0.5,None,1,None,None,None,1,None,3,None,0,'Chilan Berry: Normal x0.5'),
    # I. Focus Sash
    (113,703,4,1,8,1,None,None,None,None,None,1,None,4,None,0,'Focus Sash: survive 1HP'),
    # J. Weakness Policy
    (167,102,10,1,2,2,2,None,None,None,None,1,None,6,None,0,'Weakness Policy: SE Atk+2'),
    (167,102,10,1,2,2,4,None,None,None,None,1,None,6,None,1,'Weakness Policy: SE SpA+2'),
    # K. Seeds
    (178,102,6,1,2,1,3,None,None,None,'{"terrain":1}',1,None,7,None,0,'Electric Seed: elec Def+1'),
    (181,102,6,1,2,1,3,None,None,None,'{"terrain":2}',1,None,7,None,0,'Grassy Seed: grass Def+1'),
    (180,102,6,1,2,1,5,None,None,None,'{"terrain":3}',1,None,7,None,0,'Misty Seed: misty SpD+1'),
    (179,102,6,1,2,1,5,None,None,None,'{"terrain":4}',1,None,7,None,0,'Psychic Seed: psychic SpD+1'),
    # L. Booster Energy
    (216,101,1,1,1,1.3,None,None,None,None,'{"condition":"protosynthesis_or_quark_drive","boost_highest_stat":true}',1,None,9,None,0,'Booster Energy: highest x1.3'),
    # M. Crit items
    (103,501,1,1,2,1,None,None,None,None,None,0,None,4,None,0,'Razor Claw: crit+1'),
    (11,501,1,1,2,1,None,None,None,None,None,0,None,2,None,0,'Scope Lens: crit+1'),
]

# ============================================================================
# MOVE FLAGS
# ============================================================================
# flag: 1=contact 2=sound 3=punch 4=bite 5=pulse 6=ball 7=powder 8=wind 9=slicing 10=recoil
move_flags_data = {
    1: [370,418,453,7,9,8,200,242,421,344,442,583,98,36,413,394,452,457,183,245,44,422,423,424,400,404,348,409,309,325,276,904,651,533,210,89,24,167,4],
    2: [49,405,496,46,768,886],
    3: [418,7,9,8,183,309,325,409,904,703],
    4: [44,242,305,422,423,424],
    5: [352,396,406,399,505,813],
    6: [247,412,486,360,188,439],
    7: [77,78,79,147],
    8: [16,18,196,239,257,366,542],
    9: [15,75,404,210,348,400,427,533,548,651],
    10: [36,457,394,452,344,413,276,907],
}

# ============================================================================
# MOVE BATTLE EFFECTS
# ============================================================================
moves = [
    # A. Self stat drops
    (370,102,7,1,2,-1,3,None,None,None,None,4,None,0,'Close Combat: self Def-1'),
    (370,102,7,1,2,-1,5,None,None,None,None,4,None,1,'Close Combat: self SpD-1'),
    (434,102,7,1,2,-2,4,None,None,None,None,4,None,0,'Draco Meteor: self SpA-2'),
    (315,102,7,1,2,-2,4,None,None,None,None,3,None,0,'Overheat: self SpA-2'),
    (276,102,7,1,2,-1,2,None,None,None,None,3,None,0,'Superpower: self Atk-1'),
    (276,102,7,1,2,-1,3,None,None,None,None,3,None,1,'Superpower: self Def-1'),
    # B. Priority
    (418,601,1,1,8,1,None,None,None,None,None,4,None,0,'Bullet Punch: +1'),
    (453,601,1,1,8,1,None,None,None,None,None,4,None,0,'Aqua Jet: +1'),
    (183,601,1,1,8,1,None,None,None,None,None,2,None,0,'Mach Punch: +1'),
    (98,601,1,1,8,1,None,None,None,None,None,1,None,0,'Quick Attack: +1'),
    (245,601,1,1,8,2,None,None,None,None,None,2,None,0,'Extreme Speed: +2'),
    (333,601,1,1,8,1,None,None,None,None,None,3,None,0,'Ice Shard: +1'),
    # C. Guaranteed crit
    (400,504,1,1,8,1,None,None,None,None,None,4,None,0,'Storm Throw: always crit'),
    (651,504,1,1,8,1,None,None,None,None,None,7,None,0,'Solar Blade: charge crit'),
    (658,504,1,1,8,1,None,None,None,None,None,6,None,0,'Pollen Puff: always crit'),
    # D. High crit
    (404,501,1,1,2,1,None,None,None,None,None,1,None,0,'Cross Poison: crit+1'),
    (348,501,1,1,2,1,None,None,None,None,None,4,None,0,'Leaf Blade: crit+1'),
    (427,501,1,1,2,1,None,None,None,None,None,4,None,0,'Psycho Cut: crit+1'),
    (163,501,1,1,2,1,None,None,None,None,None,1,None,0,'Slash: crit+1'),
    # E. Recoil
    (394,802,7,1,9,0.333,None,None,None,None,None,4,None,0,'Flare Blitz: 1/3 recoil'),
    (452,802,7,1,9,0.333,None,None,None,None,None,4,None,0,'Wood Hammer: 1/3 recoil'),
    (344,802,7,1,9,0.333,None,None,None,None,None,3,None,0,'Volt Tackle: 1/3 recoil'),
    (413,802,7,1,9,0.333,None,None,None,None,None,4,None,0,'Brave Bird: 1/3 recoil'),
    (457,802,7,1,9,0.5,None,None,None,None,None,4,None,0,'Head Smash: 1/2 recoil'),
    (36,802,7,1,9,0.25,None,None,None,None,None,1,None,0,'Take Down: 1/4 recoil'),
    # F. Drain
    (71,803,7,1,9,0.5,None,None,None,None,None,1,None,0,'Absorb: heal 50%'),
    (72,803,7,1,9,0.5,None,None,None,None,None,1,None,0,'Mega Drain: heal 50%'),
    (202,803,7,1,9,0.5,None,None,None,None,None,3,None,0,'Giga Drain: heal 50%'),
    (409,803,7,1,9,0.5,None,None,None,None,None,4,None,0,'Drain Punch: heal 50%'),
    # G. Special formula
    (69,902,1,2,8,None,None,None,None,None,'{"formula":"level_based"}',1,None,0,'Seismic Toss: dmg=level'),
    (101,902,1,2,8,None,None,None,None,None,'{"formula":"level_based"}',1,None,0,'Night Shade: dmg=level'),
    (447,902,1,2,8,None,None,None,None,None,'{"formula":"weight_based"}',4,None,0,'Grass Knot: by weight'),
    (67,902,1,2,8,None,None,None,None,None,'{"formula":"weight_based"}',3,None,0,'Low Kick: by weight'),
    (360,902,1,2,8,None,None,None,None,None,'{"formula":"speed_inverse"}',4,None,0,'Gyro Ball: by speed diff'),
    (486,902,1,2,8,None,None,None,None,None,'{"formula":"speed_ratio"}',4,None,0,'Electro Ball: by speed ratio'),
    # H. Multi-hit
    (167,901,1,2,8,3,None,None,None,None,'{"hits":3,"fixed":true}',3,None,0,'Triple Kick: 3 hits'),
    (4,901,1,2,8,5,None,None,None,None,'{"hits":[2,5]}',1,None,0,'Comet Punch: 2-5 hits'),
    (24,901,1,2,8,2,None,None,None,None,'{"hits":2,"fixed":true}',1,None,0,'Double Kick: 2 hits'),
]

# ============================================================================
# GENERATE SQL
# ============================================================================
with open(OUT, "w", encoding="utf-8") as f:
    f.write("-- ==========================================================================\n")
    f.write("-- Pokemon LocalDex Battle Effects Seed Data (Idempotent)\n")
    f.write("-- Generated by scripts/gen-seed-sql.py\n")
    f.write("-- Enum reference: packages/store/shared-types/src/battle-effects.ts\n")
    f.write("-- ==========================================================================\n\n")
    f.write("DELETE FROM move_battle_effects;\n")
    f.write("DELETE FROM item_battle_effects;\n")
    f.write("DELETE FROM ability_battle_effects;\n")
    f.write("DELETE FROM move_flags;\n\n")

    # Abilities
    f.write("-- ==========================================================================\n")
    f.write("-- PART 1: ability_battle_effects\n")
    f.write("-- ==========================================================================\n\n")
    f.write(insert_block("ability_battle_effects", ABE_COLS, abilities))
    f.write("\n")

    # Items
    f.write("-- ==========================================================================\n")
    f.write("-- PART 2: item_battle_effects\n")
    f.write("-- ==========================================================================\n\n")
    f.write(insert_block("item_battle_effects", IBE_COLS, items))
    f.write("\n")

    # Move flags
    f.write("-- ==========================================================================\n")
    f.write("-- PART 3: move_flags\n")
    f.write("-- ==========================================================================\n\n")
    for flag, move_ids in sorted(move_flags_data.items()):
        flag_names = {1:'contact',2:'sound',3:'punch',4:'bite',5:'pulse',6:'ball',7:'powder',8:'wind',9:'slicing',10:'recoil'}
        f.write(f"-- {flag_names.get(flag, str(flag))} ({flag})\n")
        vals = ", ".join(f"({mid}, {flag})" for mid in move_ids)
        f.write(f"INSERT OR IGNORE INTO move_flags (move_id, flag) VALUES\n")
        row_strs = [f"  ({mid}, {flag})" for mid in move_ids]
        f.write(",\n".join(row_strs) + ";\n\n")

    # Move effects
    f.write("-- ==========================================================================\n")
    f.write("-- PART 4: move_battle_effects\n")
    f.write("-- ==========================================================================\n\n")
    f.write(insert_block("move_battle_effects", MBE_COLS, moves))
    f.write("\n")

    f.write("-- DONE\n")

print(f"Generated {OUT}")
print(f"  Abilities: {len(abilities)} rows")
print(f"  Items: {len(items)} rows")
print(f"  Move flags: {sum(len(v) for v in move_flags_data.values())} rows")
print(f"  Move effects: {len(moves)} rows")
