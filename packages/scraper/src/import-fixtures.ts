import { importFromFixtures } from "./index.ts";

const result = await importFromFixtures();
console.log("fixture import:", result);
