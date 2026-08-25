import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getPlansForCity } from "../plans.js";

const regionalSources = [
  readFileSync(new URL("../../regional-plans.js", import.meta.url), "utf8"),
  readFileSync(new URL("../../normal-plans-catalog.js", import.meta.url), "utf8"),
  readFileSync(new URL("../plan-strategy.js", import.meta.url), "utf8"),
  readFileSync(new URL("../plans.js", import.meta.url), "utf8")
];

test("Itapetininga e Iperó recebem as ofertas regionais de 600 Mega", () => {
  for (const city of ["Itapetininga", "Iperó"]) {
    const plans = getPlansForCity(city);
    assert.ok(plans.some((plan) => plan.id === "FIBRA 600MB" && plan.price === 99.9));
    assert.ok(plans.some((plan) => plan.id === "FIBRA 600MB + 1 PONTO EXTRA DE WI-FI" && plan.price === 119.9));
    assert.ok(plans.every((plan) => plan.id !== "FIBRA 500MB"));
    assert.ok(plans.every((plan) => plan.id !== "FIBRA 500MB + 1 PONTO EXTRA DE WI-FI"));
  }
});

test("cidade fora da regra mantém as ofertas de 500 Mega", () => {
  const plans = getPlansForCity("Canoas");
  assert.ok(plans.some((plan) => plan.id === "FIBRA 500MB" && plan.price === 99.9));
  assert.ok(plans.some((plan) => plan.id === "FIBRA 500MB + 1 PONTO EXTRA DE WI-FI" && plan.price === 119.9));
});

test("todos os catálogos usam a mesma lista regional", () => {
  for (const source of regionalSources) {
    assert.match(source, /new Set\(\["sorocaba", "votorantim", "itapetininga", "ipero"\]\)/);
  }
});
