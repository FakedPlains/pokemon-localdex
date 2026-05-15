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

export default function FieldControlPanel({ field, setField, toggleField }) {
  return (
    <div className="dc-field-section">
      <span className="dc-section-title">场地环境</span>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">天气</span>
        <div className="dc-sp-chips">
          {WEATHER_OPTIONS.map((w) => (
            <button key={w.v} className={"dc-chip" + (field.weather === w.v ? " dc-chip-on" : "")} onClick={() => setField("weather", field.weather === w.v ? "none" : w.v)}>{w.l}</button>
          ))}
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">场地</span>
        <div className="dc-sp-chips">
          {TERRAIN_OPTIONS.map((t) => (
            <button key={t.v} className={"dc-chip" + (field.terrain === t.v ? " dc-chip-on" : "")} onClick={() => setField("terrain", field.terrain === t.v ? "none" : t.v)}>{t.l}</button>
          ))}
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">效果</span>
        <div className="dc-sp-chips">
          <button className={"dc-chip" + (field.gravity ? " dc-chip-on" : "")} onClick={() => toggleField("gravity")}>重力</button>
          <button className={"dc-chip" + (field.magicRoom ? " dc-chip-on" : "")} onClick={() => toggleField("magicRoom")}>魔法空间</button>
          <button className={"dc-chip" + (field.wonderRoom ? " dc-chip-on" : "")} onClick={() => toggleField("wonderRoom")}>奇妙空间</button>
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">灾厄特性</span>
        <div className="dc-sp-chips">
          <button className={"dc-chip" + (field.beadsOfRuin ? " dc-chip-on" : "")} onClick={() => toggleField("beadsOfRuin")}>灾祸之珠</button>
          <button className={"dc-chip" + (field.tabletsOfRuin ? " dc-chip-on" : "")} onClick={() => toggleField("tabletsOfRuin")}>灾祸之碑</button>
          <button className={"dc-chip" + (field.swordOfRuin ? " dc-chip-on" : "")} onClick={() => toggleField("swordOfRuin")}>灾祸之剑</button>
          <button className={"dc-chip" + (field.vesselOfRuin ? " dc-chip-on" : "")} onClick={() => toggleField("vesselOfRuin")}>灾祸之鼎</button>
        </div>
      </div>
    </div>
  );
}
