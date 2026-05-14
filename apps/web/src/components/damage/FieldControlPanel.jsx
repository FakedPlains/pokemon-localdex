const WEATHER_OPTIONS = [
  { v: "sun", l: "晴天" },
  { v: "harshSunlight", l: "大日照" },
  { v: "rain", l: "雨天" },
  { v: "heavyRain", l: "大雨" },
  { v: "sand", l: "沙暴" },
  { v: "hail", l: "雪" },
  { v: "strongWinds", l: "乱流" },
];

const TERRAIN_OPTIONS = [
  { v: "electric", l: "电气" },
  { v: "grassy", l: "青草" },
  { v: "misty", l: "薄雾" },
  { v: "psychic", l: "精神" },
];

export default function FieldControlPanel({
  weather,
  setWeather,
  terrain,
  setTerrain,
  gravity,
  setGravity,
  magicRoom,
  setMagicRoom,
  wonderRoom,
  setWonderRoom,
  beadsOfRuin,
  setBeadsOfRuin,
  tabletsOfRuin,
  setTabletsOfRuin,
  swordOfRuin,
  setSwordOfRuin,
  vesselOfRuin,
  setVesselOfRuin,
}) {
  return (
    <div className="dc-field-section">
      <span className="dc-section-title">场地环境</span>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">天气</span>
        <div className="dc-sp-chips">
          {WEATHER_OPTIONS.map((w) => (
            <button key={w.v} className={"dc-chip" + (weather === w.v ? " dc-chip-on" : "")} onClick={() => setWeather(weather === w.v ? "none" : w.v)}>{w.l}</button>
          ))}
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">场地</span>
        <div className="dc-sp-chips">
          {TERRAIN_OPTIONS.map((t) => (
            <button key={t.v} className={"dc-chip" + (terrain === t.v ? " dc-chip-on" : "")} onClick={() => setTerrain(terrain === t.v ? "none" : t.v)}>{t.l}</button>
          ))}
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">效果</span>
        <div className="dc-sp-chips">
          <button className={"dc-chip" + (gravity ? " dc-chip-on" : "")} onClick={() => setGravity(!gravity)}>重力</button>
          <button className={"dc-chip" + (magicRoom ? " dc-chip-on" : "")} onClick={() => setMagicRoom(!magicRoom)}>魔法空间</button>
          <button className={"dc-chip" + (wonderRoom ? " dc-chip-on" : "")} onClick={() => setWonderRoom(!wonderRoom)}>奇妙空间</button>
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">灾厄特性</span>
        <div className="dc-sp-chips">
          <button className={"dc-chip" + (beadsOfRuin ? " dc-chip-on" : "")} onClick={() => setBeadsOfRuin(!beadsOfRuin)}>灾祸之珠</button>
          <button className={"dc-chip" + (tabletsOfRuin ? " dc-chip-on" : "")} onClick={() => setTabletsOfRuin(!tabletsOfRuin)}>灾祸之碑</button>
          <button className={"dc-chip" + (swordOfRuin ? " dc-chip-on" : "")} onClick={() => setSwordOfRuin(!swordOfRuin)}>灾祸之剑</button>
          <button className={"dc-chip" + (vesselOfRuin ? " dc-chip-on" : "")} onClick={() => setVesselOfRuin(!vesselOfRuin)}>灾祸之鼎</button>
        </div>
      </div>
    </div>
  );
}
