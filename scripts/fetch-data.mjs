#!/usr/bin/env node
/**
 * Récupère toutes les données nécessaires depuis les sources publiques
 * et génère data/lol-data.json (aucune base de données).
 *
 * Sources :
 *  - Data Dragon (Riot)        : liste des champions, icônes, rôles (tags)
 *  - CommunityDragon           : skins + familles de skins (skinlines)
 *  - Universe (Riot)           : région / faction de chaque champion
 *  - Meraki Analytics (option) : positions jouées (TOP/JUNGLE/MID/ADC/SUPPORT)
 *  - data/overrides.json       : corrections manuelles (régions secondaires, etc.)
 *
 * Options :
 *  --if-missing     ne fait rien si data/lol-data.json existe déjà
 *  --keep-on-error  si une source obligatoire échoue mais qu'un fichier existe,
 *                   on garde l'ancien fichier au lieu de faire échouer le build
 */
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "data", "lol-data.json");
const OVERRIDES = path.join(ROOT, "data", "overrides.json");
const args = new Set(process.argv.slice(2));

const LOCALE_DD = "fr_FR";
const LOCALE_CD = "fr_fr";
const CDRAGON = "https://raw.communitydragon.org/latest/plugins/rcp-be-lol-game-data/global";
const UNIVERSE = "https://universe-meeps.leagueoflegends.com/v1";
const MERAKI = "https://cdn.merakianalytics.com/riot/lol/resources/latest/en-US/champions.json";

// Noms FR des régions (les slugs viennent de l'API Universe)
const REGION_NAMES = {
  "bandle-city": "Bandle",
  bilgewater: "Bilgewater",
  demacia: "Demacia",
  freljord: "Freljord",
  ionia: "Ionia",
  ixtal: "Ixtal",
  noxus: "Noxus",
  piltover: "Piltover",
  "shadow-isles": "Îles obscures",
  shurima: "Shurima",
  "mount-targon": "Targon",
  void: "Néant",
  zaun: "Zaun",
  runeterra: "Runeterra (sans région)",
};
const FACTION_ALIASES = { unaffiliated: "runeterra", targon: "mount-targon", "the-void": "void" };

async function fileExists(p) {
  try { await fs.access(p); return true; } catch { return false; }
}

async function getJson(url, { retries = 2 } = {}) {
  let lastErr;
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url, { headers: { "user-agent": "lol-compo-builder" } });
      if (!res.ok) throw new Error(`HTTP ${res.status} sur ${url}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  throw lastErr;
}

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx], idx);
      }
    })
  );
  return out;
}

const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");

const normFaction = (slug) => {
  const s = String(slug || "").toLowerCase().trim();
  return FACTION_ALIASES[s] || s || "runeterra";
};

/** Convertit un chemin "/lol-game-data/assets/..." en URL CommunityDragon. */
const cdragonAsset = (p) =>
  p ? `${CDRAGON}/default/${p.replace(/^\/lol-game-data\/assets\//i, "").toLowerCase()}` : null;

// ---------------------------------------------------------------- Champions
async function loadChampions() {
  const versions = await getJson("https://ddragon.leagueoflegends.com/api/versions.json");
  const version = versions[0];
  const [fr, en] = await Promise.all([
    getJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/${LOCALE_DD}/champion.json`),
    getJson(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`),
  ]);
  const champions = Object.values(fr.data).map((c) => ({
    id: c.id, // ex: "MonkeyKing"
    key: Number(c.key), // ex: 62
    name: c.name, // nom FR affiché
    nameEn: en.data[c.id]?.name ?? c.name,
    title: c.title,
    tags: c.tags,
    icon: `https://ddragon.leagueoflegends.com/cdn/${version}/img/champion/${c.image.full}`,
  }));
  return { version, champions };
}

// ---------------------------------------------------------------- Skins
async function loadSkins(champions) {
  const [skins, lines] = await Promise.all([
    getJson(`${CDRAGON}/${LOCALE_CD}/v1/skins.json`),
    getJson(`${CDRAGON}/${LOCALE_CD}/v1/skinlines.json`),
  ]);
  const lineNames = new Map();
  for (const l of lines) if (l && l.id && l.name) lineNames.set(l.id, l.name.trim());

  const byKey = new Map(champions.map((c) => [c.key, c]));
  for (const c of champions) c.skins = [];

  for (const s of Object.values(skins)) {
    if (!s || s.isBase) continue;
    const champ = byKey.get(Math.floor(s.id / 1000));
    if (!champ) continue;
    const lineIds = (s.skinLines || []).map((l) => l.id).filter((id) => lineNames.has(id));
    champ.skins.push({
      id: s.id,
      name: s.name,
      lines: lineIds,
      tile: cdragonAsset(s.tilePath),
      // les skins "Légendaires" / "Ultimes" etc.
      rarity: s.rarity && s.rarity !== "kNoRarity" ? s.rarity.replace(/^k/, "") : undefined,
      legacy: s.isLegacy || undefined,
    });
  }
  return lineNames;
}

// ---------------------------------------------------------------- Régions
async function loadRegions(champions, warnings) {
  const found = new Map(); // champion.id -> faction slug

  // 1) index global (une seule requête)
  try {
    const idx = await getJson(`${UNIVERSE}/en_us/search/index.json`);
    const list = idx.champions || [];
    const bySlug = new Map(list.map((c) => [norm(c.slug), c]));
    const byName = new Map(list.map((c) => [norm(c.name), c]));
    for (const c of champions) {
      const u = bySlug.get(norm(c.id)) || byName.get(norm(c.nameEn)) || byName.get(norm(c.name));
      if (u && u["associated-faction-slug"]) found.set(c.id, normFaction(u["associated-faction-slug"]));
    }
  } catch (e) {
    warnings.push(`Index Universe indisponible (${e.message}), repli champion par champion.`);
  }

  // 2) repli champion par champion pour les manquants
  const missing = champions.filter((c) => !found.has(c.id));
  await mapLimit(missing, 8, async (c) => {
    const candidates = [...new Set([c.id.toLowerCase(), norm(c.nameEn)])];
    for (const slug of candidates) {
      try {
        const j = await getJson(`${UNIVERSE}/en_us/champions/${slug}/index.json`, { retries: 0 });
        const f = j?.champion?.["associated-faction-slug"];
        if (f) { found.set(c.id, normFaction(f)); return; }
      } catch { /* on essaie le slug suivant */ }
    }
  });

  for (const c of champions) {
    if (found.has(c.id)) c.regions = [found.get(c.id)];
    else {
      c.regions = ["runeterra"];
      warnings.push(`Région introuvable pour ${c.name} → Runeterra (à corriger dans data/overrides.json)`);
    }
  }
}

// ---------------------------------------------------------------- Positions
const TAG_FALLBACK = {
  Marksman: ["BOTTOM"],
  Support: ["SUPPORT"],
  Mage: ["MIDDLE"],
  Assassin: ["MIDDLE"],
  Fighter: ["TOP", "JUNGLE"],
  Tank: ["TOP", "SUPPORT"],
};
async function loadPositions(champions, warnings) {
  let meraki = null;
  try {
    meraki = await getJson(MERAKI);
  } catch (e) {
    warnings.push(`Meraki indisponible (${e.message}) : positions estimées depuis les classes.`);
  }
  const byKey = new Map();
  if (meraki) for (const m of Object.values(meraki)) byKey.set(Number(m.id), m);
  for (const c of champions) {
    const pos = byKey.get(c.key)?.positions;
    if (Array.isArray(pos) && pos.length) {
      c.positions = [...new Set(pos.map((p) => (p === "MID" ? "MIDDLE" : p === "ADC" ? "BOTTOM" : p)))];
    } else {
      c.positions = [...new Set(c.tags.flatMap((t) => TAG_FALLBACK[t] || []))];
      c.positionsEstimated = true;
    }
  }
}

// ---------------------------------------------------------------- Overrides
async function applyOverrides(champions, lineNames, warnings) {
  if (!(await fileExists(OVERRIDES))) return;
  const o = JSON.parse(await fs.readFile(OVERRIDES, "utf8"));
  const find = (k) => champions.find((c) => c.id === k || norm(c.name) === norm(k) || norm(c.nameEn) === norm(k));
  for (const [k, regs] of Object.entries(o.regions || {})) {
    const c = find(k);
    if (!c) { warnings.push(`overrides.regions : champion inconnu "${k}"`); continue; }
    c.regions = regs.map(normFaction);
  }
  for (const [k, regs] of Object.entries(o.extraRegions || {})) {
    const c = find(k);
    if (!c) { warnings.push(`overrides.extraRegions : champion inconnu "${k}"`); continue; }
    c.regions = [...new Set([...c.regions, ...regs.map(normFaction)])];
  }
  for (const [k, pos] of Object.entries(o.positions || {})) {
    const c = find(k);
    if (!c) { warnings.push(`overrides.positions : champion inconnu "${k}"`); continue; }
    c.positions = pos; delete c.positionsEstimated;
  }
  for (const id of o.hiddenSkinLines || []) lineNames.delete(Number(id));
}

// ---------------------------------------------------------------- Main
async function main() {
  if (args.has("--if-missing") && (await fileExists(OUT))) {
    console.log("data/lol-data.json existe déjà — récupération ignorée (npm run data pour forcer).");
    return;
  }
  const warnings = [];
  console.log("→ Champions (Data Dragon)…");
  const { version, champions } = await loadChampions();
  console.log(`  ${champions.length} champions, patch ${version}`);

  console.log("→ Skins & familles (CommunityDragon)…");
  const lineNames = await loadSkins(champions);

  console.log("→ Régions (Universe)…");
  await loadRegions(champions, warnings);

  console.log("→ Positions (Meraki)…");
  await loadPositions(champions, warnings);

  await applyOverrides(champions, lineNames, warnings);

  // Familles de skins : on ne garde que celles qui existent encore après overrides
  const usedLines = new Map();
  for (const c of champions) {
    for (const s of c.skins) {
      s.lines = s.lines.filter((id) => lineNames.has(id));
      for (const id of s.lines) {
        if (!usedLines.has(id)) usedLines.set(id, new Set());
        usedLines.get(id).add(c.id);
      }
    }
  }
  const skinLines = [...usedLines.entries()]
    .map(([id, set]) => ({ id, name: lineNames.get(id), size: set.size }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  const regionSet = new Set(champions.flatMap((c) => c.regions));
  const regions = [...regionSet]
    .map((slug) => ({
      slug,
      name: REGION_NAMES[slug] || slug.replace(/-/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()),
      size: champions.filter((c) => c.regions.includes(slug)).length,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "fr"));

  champions.sort((a, b) => a.name.localeCompare(b.name, "fr"));
  for (const c of champions) {
    delete c.nameEn;
    c.skins.sort((a, b) => a.id - b.id);
  }

  const out = {
    version,
    generatedAt: new Date().toISOString(),
    champions,
    regions,
    skinLines,
    warnings,
  };
  await fs.mkdir(path.dirname(OUT), { recursive: true });
  await fs.writeFile(OUT, JSON.stringify(out));
  console.log(
    `✔ data/lol-data.json : ${champions.length} champions, ${regions.length} régions, ${skinLines.length} familles de skins, ${warnings.length} avertissement(s).`
  );
  for (const w of warnings.slice(0, 30)) console.warn("  ⚠ " + w);
  if (warnings.length > 30) console.warn(`  … et ${warnings.length - 30} autres (voir la page /donnees)`);
}

main().catch(async (e) => {
  console.error("✖ Échec de la récupération des données :", e.message);
  if (args.has("--keep-on-error") && (await fileExists(OUT))) {
    console.warn("  → On conserve le data/lol-data.json existant.");
    process.exit(0);
  }
  process.exit(1);
});
