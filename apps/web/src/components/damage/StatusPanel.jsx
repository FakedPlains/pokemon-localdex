import SearchSelect from "../SearchSelect.jsx";

//  子组件：状态效果面板
// ══════════════════════════════════════════════════════════════

export default function StatusPanel({ label, side, status, setStatus, toxicCounter, setToxicCounter,
  stealthRock, setStealthRock, spikes, setSpikes, steelsurge, setSteelsurge,
  reflect, setReflect, lightScreen, setLightScreen, auroraVeil, setAuroraVeil,
  protect, setProtect, helpingHand, setHelpingHand, tailwind, setTailwind,
  friendGuard, setFriendGuard, switchingOut, setSwitchingOut,
  seeded, setSeeded, saltCured, setSaltCured, foresight, setForesight,
  flowerGift, setFlowerGift, powerTrick, setPowerTrick, steelySpirit, setSteelySpirit,
  battery, setBattery, powerSpot, setPowerSpot,
  isDynamaxed, setIsDynamaxed, alliesFainted, setAlliesFainted,
  generation }) {
  const STATUS_SELECT_OPTIONS = [
    { value: "none", label: "健康" },
    { value: "burn", label: "烧伤" },
    { value: "paralysis", label: "麻痹" },
    { value: "poison", label: "中毒" },
    { value: "tox", label: "剧毒" },
    { value: "sleep", label: "睡眠" },
    { value: "freeze", label: "冰冻" },
  ];
  return (
    <div className={"dc-status-panel" + (side === "atk" ? " dc-status-panel-atk" : side === "def" ? " dc-status-panel-def" : "")}>
      <div className="dc-sp-header">
        <span className="dc-sp-title">{label}</span>
        <div className="dc-sp-status-row">
          <div className="dc-status-select-wrap">
            <SearchSelect
              value={status || "none"}
              options={STATUS_SELECT_OPTIONS}
              onChange={(val) => setStatus(val)}
              placeholder="健康"
            />
          </div>
          {status === "tox" && (
            <span className="dc-toxic-counter">
              <span>回合</span>
              <input type="number" className="dc-toxic-input" min={0} max={15} value={toxicCounter || 0} onChange={(e) => setToxicCounter(Math.max(0, Math.min(15, Number(e.target.value) || 0)))} />
            </span>
          )}
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">场地</span>
        <div className="dc-sp-chips">
          <button className={"dc-chip" + (stealthRock ? " dc-chip-on" : "")} onClick={() => setStealthRock(!stealthRock)}>隐石</button>
          <button className={"dc-chip" + (spikes > 0 ? " dc-chip-on" : "")} onClick={() => setSpikes(spikes >= 3 ? 0 : spikes + 1)}>撒菱{spikes > 0 ? `×${spikes}` : ""}</button>
          <button className={"dc-chip" + (steelsurge ? " dc-chip-on" : "")} onClick={() => setSteelsurge(!steelsurge)}>钢刺</button>
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">屏障</span>
        <div className="dc-sp-chips">
          <button className={"dc-chip" + (reflect ? " dc-chip-on" : "")} onClick={() => setReflect(!reflect)}>反射壁</button>
          <button className={"dc-chip" + (lightScreen ? " dc-chip-on" : "")} onClick={() => setLightScreen(!lightScreen)}>光墙</button>
          <button className={"dc-chip" + (auroraVeil ? " dc-chip-on" : "")} onClick={() => setAuroraVeil(!auroraVeil)}>极光幕</button>
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">辅助</span>
        <div className="dc-sp-chips">
          <button className={"dc-chip" + (protect ? " dc-chip-on" : "")} onClick={() => setProtect(!protect)}>守住</button>
          <button className={"dc-chip" + (helpingHand ? " dc-chip-on" : "")} onClick={() => setHelpingHand(!helpingHand)}>帮助</button>
          <button className={"dc-chip" + (tailwind ? " dc-chip-on" : "")} onClick={() => setTailwind(!tailwind)}>顺风</button>
          <button className={"dc-chip" + (friendGuard ? " dc-chip-on" : "")} onClick={() => setFriendGuard(!friendGuard)}>友情防守</button>
          <button className={"dc-chip" + (switchingOut ? " dc-chip-on" : "")} onClick={() => setSwitchingOut(!switchingOut)}>换入中</button>
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">异常</span>
        <div className="dc-sp-chips">
          <button className={"dc-chip" + (seeded ? " dc-chip-on" : "")} onClick={() => setSeeded(!seeded)}>寄生种子</button>
          <button className={"dc-chip" + (saltCured ? " dc-chip-on" : "")} onClick={() => setSaltCured(!saltCured)}>盐腌</button>
          <button className={"dc-chip" + (foresight ? " dc-chip-on" : "")} onClick={() => setForesight(!foresight)}>识破</button>
        </div>
      </div>
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">队友</span>
        <div className="dc-sp-chips">
          <button className={"dc-chip" + (flowerGift ? " dc-chip-on" : "")} onClick={() => setFlowerGift(!flowerGift)}>花之礼</button>
          <button className={"dc-chip" + (steelySpirit ? " dc-chip-on" : "")} onClick={() => setSteelySpirit(!steelySpirit)}>钢之意志</button>
          <button className={"dc-chip" + (battery ? " dc-chip-on" : "")} onClick={() => setBattery(!battery)}>蓄电池</button>
          <button className={"dc-chip" + (powerSpot ? " dc-chip-on" : "")} onClick={() => setPowerSpot(!powerSpot)}>能量点</button>
          <button className={"dc-chip" + (powerTrick ? " dc-chip-on" : "")} onClick={() => setPowerTrick(!powerTrick)}>力量戏法</button>
        </div>
      </div>
      {/* 极巨化/倒下队友 */}
      <div className="dc-sp-group">
        <span className="dc-sp-group-label">特殊</span>
        <div className="dc-sp-chips">
          {Number(generation) === 8 && (
            <button className={"dc-chip" + (isDynamaxed ? " dc-chip-on" : "")} onClick={() => setIsDynamaxed(!isDynamaxed)}>极巨化</button>
          )}
          <div className="dc-sp-inline-field">
            <span className="dc-sp-inline-label">倒下队友</span>
            <input type="number" className="dc-sp-mini-input" min={0} max={5} value={alliesFainted || 0} onChange={(e) => setAlliesFainted(Math.max(0, Math.min(5, Number(e.target.value) || 0)))} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════
