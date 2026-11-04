import test from "node:test";
import assert from "node:assert/strict";
import { binom, unrankCombination, assignRoles, prepareCompos, firstLetter, yearBuckets } from "../lib/compo.ts";

test("binom", () => {
  assert.equal(binom(5, 2), 10);
  assert.equal(binom(20, 4), 4845);
  assert.equal(binom(3, 4), 0);
});

test("unrank couvre toutes les combinaisons sans doublon", () => {
  const n = 9, k = 4, seen = new Set();
  for (let i = 0; i < binom(n, k); i++) {
    const c = unrankCombination(n, k, i);
    assert.equal(c.length, k);
    for (let j = 1; j < k; j++) assert.ok(c[j] > c[j - 1]);
    seen.add(c.join(","));
  }
  assert.equal(seen.size, binom(n, k));
  assert.deepEqual(unrankCombination(n, k, 0), [0, 1, 2, 3]);
  assert.deepEqual(unrankCombination(n, k, binom(n, k) - 1), [5, 6, 7, 8]);
});

const mk = (id, positions) => ({ id, name: id, positions, skins: [], regions: [], tags: [] });

test("assignRoles", () => {
  const team = [mk("a", ["TOP"]), mk("b", ["JUNGLE", "TOP"]), mk("c", ["MIDDLE"]), mk("d", ["BOTTOM"]), mk("e", ["SUPPORT"])];
  const r = assignRoles(team);
  assert.equal(r.TOP.id, "a");
  assert.equal(r.JUNGLE.id, "b");
  assert.equal(assignRoles([...team.slice(0, 4), mk("f", ["TOP"])]), null);
});

test("prepareCompos avec/sans rôles", () => {
  const champ = mk("x", ["TOP"]);
  const pool = [mk("j", ["JUNGLE"]), mk("m", ["MIDDLE"]), mk("b", ["BOTTOM"]), mk("s", ["SUPPORT"]), mk("m2", ["MIDDLE"])];
  const all = prepareCompos({ champion: champ, pool, rolesMode: false });
  assert.equal(all.total, 5);
  const roles = prepareCompos({ champion: champ, pool, rolesMode: true });
  assert.equal(roles.total, 2); // j,b,s + m ou m2
  for (let i = 0; i < roles.total; i++) assert.ok(roles.get(i).roles);
  const fixedBad = prepareCompos({ champion: champ, pool, rolesMode: true, fixedRole: "MIDDLE" });
  assert.equal(fixedBad.total, 0);
});

test("firstLetter", () => {
  assert.equal(firstLetter("Kai'Sa"), "K");
  assert.equal(firstLetter("Élise"), "E");
  assert.equal(firstLetter("Nunu et Willump"), "N");
});

test("yearBuckets fusionne les années trop petites", () => {
  const years = new Map();
  const add = (y, n) => { for (let i = 0; i < n; i++) years.set(`${y}-${i}`, y); };
  add(2009, 6); add(2017, 5); add(2018, 3); add(2019, 5); add(2020, 2);
  const b = yearBuckets(years, 5).map((x) => [x.from, x.to, x.ids.length]);
  assert.deepEqual(b, [[2009, 2009, 6], [2017, 2017, 5], [2018, 2020, 10]]);
});
