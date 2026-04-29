import { useState, useEffect, useCallback, useMemo } from "react";
import { createDraftMember } from "./utils/helpers.js";
import PokedexPage from "./pages/PokedexPage.jsx";
import ItemsPage from "./pages/ItemsPage.jsx";
import MovesPage from "./pages/MovesPage.jsx";
import AbilitiesPage from "./pages/AbilitiesPage.jsx";
import TeamsPage from "./pages/TeamsPage.jsx";
import DamagePage from "./pages/DamagePage.jsx";

const NAV_ITEMS = [
  { key: "pokedex", label: "图鉴", hash: "#/pokedex" },
  { key: "items", label: "道具", hash: "#/items" },
  { key: "moves", label: "招式", hash: "#/moves" },
  { key: "abilities", label: "特性", hash: "#/abilities" },
  { key: "teams", label: "队伍", hash: "#/teams" },
  { key: "damage", label: "伤害", hash: "#/damage" }
];

function parseRoute() {
  const hash = window.location.hash || "#/pokedex";
  const key = hash.replace("#/", "").split("/")[0];
  return NAV_ITEMS.find((n) => n.key === key)?.key || "pokedex";
}

export default function App() {
  const [route, setRoute] = useState(parseRoute);

  // Shared team draft state (lifted from TeamsPage so DamagePage can import from it)
  const [teamDraft, setTeamDraft] = useState({
    id: "",
    name: "",
    format: "singles",
    members: Array.from({ length: 6 }, () => createDraftMember())
  });

  useEffect(() => {
    const onHashChange = () => setRoute(parseRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  const handleTeamDraftChange = useCallback((updater) => {
    setTeamDraft((prev) => (typeof updater === "function" ? updater(prev) : updater));
  }, []);

  const pageElement = useMemo(() => {
    switch (route) {
      case "pokedex":
        return <PokedexPage />;
      case "items":
        return <ItemsPage />;
      case "moves":
        return <MovesPage />;
      case "abilities":
        return <AbilitiesPage />;
      case "teams":
        return <TeamsPage teamDraft={teamDraft} onTeamDraftChange={handleTeamDraftChange} />;
      case "damage":
        return <DamagePage teamDraft={teamDraft} />;
      default:
        return <PokedexPage />;
    }
  }, [route, teamDraft, handleTeamDraftChange]);

  return (
    <div className="app-shell">
      <header className="hero">
        <div className="hero-copy">
          <p className="eyebrow">Local Pokedex Workspace</p>
          <h1>Pokemon LocalDex</h1>
          <p className="hero-text">
            本地图鉴、道具资料、队伍构筑与伤害计算的统一入口。当前数据来源于 52Poké，并优先读取本地 SQLite。
          </p>
        </div>
        <nav className="hero-nav">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.key}
              href={item.hash}
              className={route === item.key ? "active" : ""}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </header>
      <main className="main-panel">
        {pageElement}
      </main>
    </div>
  );
}
