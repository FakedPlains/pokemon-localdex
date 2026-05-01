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
      <nav className="top-nav">
        <a className="top-nav-brand" href="#/pokedex">
          <span className="top-nav-logo">🔴</span>
          <span className="top-nav-title">Pokemon LocalDex</span>
        </a>
        <div className="top-nav-links">
          {NAV_ITEMS.map((item) => (
            <a
              key={item.key}
              href={item.hash}
              className={`top-nav-link${route === item.key ? " top-nav-link-active" : ""}`}
            >
              {item.label}
            </a>
          ))}
        </div>
      </nav>
      <main className="main-panel">
        {pageElement}
      </main>
    </div>
  );
}
