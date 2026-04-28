import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  listAbilities,
  listItems,
  listMoves,
  listPokemonEntries,
  listPokemonSummaries,
  readTeams,
  searchAbilities,
  searchMoves,
  searchPokemonEntries,
  saveTeam
} from "../../../packages/data-model/src/index.ts";
import { calculateDamage } from "../../../packages/battle-core/src/index.ts";
import {
  getAbilityFromSqlite,
  getItemFromSqlite,
  getMoveFromSqlite,
  getPokemonFromSqlite,
  hasSqliteData,
  listAbilitiesFromSqlite,
  listItemsFromSqlite,
  listMovesFromSqlite,
  listPokemonFromSqlite
} from "../../../packages/sqlite-store/src/index.ts";
import { staticResponse } from "./static.ts";

export const app = new Hono();

app.use("*", cors({
  origin: "*",
  allowMethods: ["GET", "POST", "OPTIONS"],
  allowHeaders: ["Content-Type"]
}));

app.get("/", (c) => staticResponse("/") ?? c.notFound());
app.get("/assets/*", (c) => staticResponse(c.req.path) ?? c.notFound());

app.get("/health", (c) => c.json({ ok: true, service: "pokemon-localdex-api" }));

app.get("/pokemon", (c) => {
  const query = c.req.query("q") || undefined;
  const type = c.req.query("type") || undefined;
  const generation = numberQuery(c, "generation");
  const data = hasSqliteData()
    ? listPokemonFromSqlite({ query, type, generation })
    : query || type || generation
      ? searchPokemonEntries({ query, type, generation })
      : listPokemonSummaries();

  return c.json({ data });
});

app.get("/pokemon/:id", (c) => {
  const id = c.req.param("id");
  const entry = hasSqliteData()
    ? getPokemonFromSqlite(id)
    : listPokemonEntries().find((item) => item.id === id || item.slug === id);
  return entry ? c.json({ data: entry }) : c.json({ error: "Pokemon not found" }, 404);
});

app.get("/items", (c) => c.json({ data: hasSqliteData() ? listItemsFromSqlite() : listItems() }));

app.get("/items/:id", (c) => {
  const id = c.req.param("id");
  const entry = hasSqliteData()
    ? getItemFromSqlite(id)
    : listItems().find((item) => item.id === id || item.slug === id);
  return entry ? c.json({ data: entry }) : c.json({ error: "Item not found" }, 404);
});

app.get("/moves", (c) => {
  const query = c.req.query("q") || undefined;
  const type = c.req.query("type") || undefined;
  const generation = numberQuery(c, "generation");
  const data = hasSqliteData()
    ? listMovesFromSqlite({ query, type, generation })
    : query || type || generation
      ? searchMoves({ query, type, generation })
      : listMoves();
  return c.json({ data });
});

app.get("/moves/:id", (c) => {
  const id = c.req.param("id");
  const entry = hasSqliteData()
    ? getMoveFromSqlite(id)
    : listMoves().find((item) => item.id === id || item.slug === id);
  return entry ? c.json({ data: entry }) : c.json({ error: "Move not found" }, 404);
});

app.get("/abilities", (c) => {
  const query = c.req.query("q") || undefined;
  const generation = numberQuery(c, "generation");
  const data = hasSqliteData()
    ? listAbilitiesFromSqlite({ query, generation })
    : query || generation
      ? searchAbilities({ query, generation })
      : listAbilities();
  return c.json({ data });
});

app.get("/abilities/:id", (c) => {
  const id = c.req.param("id");
  const entry = hasSqliteData()
    ? getAbilityFromSqlite(id)
    : listAbilities().find((item) => item.id === id || item.slug === id);
  return entry ? c.json({ data: entry }) : c.json({ error: "Ability not found" }, 404);
});

app.get("/teams", (c) => c.json({ data: readTeams() }));

app.post("/teams", async (c) => {
  const saved = saveTeam(await c.req.json());
  return c.json({ data: saved }, 201);
});

app.post("/battle/damage", async (c) => {
  const result = calculateDamage(await c.req.json());
  return c.json({ data: result });
});

app.get("*", (c) => staticResponse("/index.html") ?? c.text("Not Found", 404));

function numberQuery(c, key) {
  const value = c.req.query(key);
  return value ? Number(value) : undefined;
}
