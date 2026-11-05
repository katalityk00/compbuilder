// Logique pure (sans React) : groupes, dénombrement et génération des compos.

export type Role = "TOP" | "JUNGLE" | "MIDDLE" | "BOTTOM" | "SUPPORT";
export const ROLES: Role[] = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "SUPPORT"];
export const ROLE_LABELS: Record<Role, string> = {
  TOP: "Top",
  JUNGLE: "Jungle",
  MIDDLE: "Mid",
  BOTTOM: "ADC",
  SUPPORT: "Support",
};

export interface Skin {
  id: number;
  name: string;
  lines: number[];
  tile: string | null;
  rarity?: string;
  legacy?: boolean;
}
export interface Champion {
  id: string;
  key: number;
  name: string;
  title: string;
  tags: string[];
  icon: string;
  regions: string[];
  positions: string[];
  positionsEstimated?: boolean;
  releaseYear?: number;
  skins: Skin[];
}
export interface LolData {
  version: string;
  generatedAt: string;
  champions: Champion[];
  regions: { slug: string; name: string; size: number }[];
  skinLines: { id: number; name: string; size: number }[];
  warnings: string[];
}

export type GroupType = "region" | "skinline" | "letter" | "year";
export const GROUP_TYPES: GroupType[] = ["region", "skinline", "letter", "year"];
/** Libellé court d'un thème (badge). */
export const GROUP_TYPE_LABELS: Record<GroupType, string> = {
  region: "Région",
  skinline: "Skins",
  letter: "Lettre",
  year: "Année",
};
/** Libellé pluriel (filtres). */
export const GROUP_TYPE_PLURALS: Record<GroupType, string> = {
  region: "Régions",
  skinline: "Skins",
  letter: "Lettres",
  year: "Années",
};
export interface Group {
  key: string; // "region:noxus" | "skinline:12" | "letter:A" | "year:2018-2019"
  type: GroupType;
  name: string;
  members: string[]; // ids de champions, triés par nom
}

export const TEAM_SIZE = 5;

/** Ordre d'affichage des types de thèmes. */
const typeRank = (t: GroupType) => GROUP_TYPES.indexOf(t);
const byTypeThenSize = (a: Group, b: Group) =>
  a.type === b.type ? b.members.length - a.members.length : typeRank(a.type) - typeRank(b.type);

/** Première lettre « propre » d'un nom : "Kai'Sa" -> "K", "Élise" -> "E". */
export function firstLetter(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z]/g, "")
    .charAt(0)
    .toUpperCase();
}

/**
 * Regroupe les années de sortie en tranches d'au moins `minSize` champions :
 * une année trop petite est fusionnée avec les suivantes (« 2018-2019 »),
 * un reliquat final trop petit est rattaché à la tranche précédente.
 */
export function yearBuckets(
  years: Map<string, number>,
  minSize = TEAM_SIZE
): { from: number; to: number; ids: string[] }[] {
  const byYear = new Map<number, string[]>();
  for (const [id, y] of years) {
    if (!byYear.has(y)) byYear.set(y, []);
    byYear.get(y)!.push(id);
  }
  const buckets: { from: number; to: number; ids: string[] }[] = [];
  let cur: { from: number; to: number; ids: string[] } | null = null;
  for (const y of [...byYear.keys()].sort((a, b) => a - b)) {
    if (!cur) cur = { from: y, to: y, ids: [] };
    cur.to = y;
    cur.ids.push(...byYear.get(y)!);
    if (cur.ids.length >= minSize) {
      buckets.push(cur);
      cur = null;
    }
  }
  if (cur) {
    const last = buckets[buckets.length - 1];
    if (last) {
      last.to = cur.to;
      last.ids.push(...cur.ids);
    } else buckets.push(cur);
  }
  return buckets;
}

/**
 * Tranches glissantes de 2 années (« 2022-2023 », « 2023-2024 »…), étendues aux
 * années suivantes tant qu'il y a moins de `min` champions, gardées si moins de `max`.
 */
export function yearRanges(
  years: Map<string, number>,
  min = TEAM_SIZE,
  max = 20
): { from: number; to: number; ids: string[] }[] {
  const all = [...new Set(years.values())].sort((a, b) => a - b);
  const out: { from: number; to: number; ids: string[] }[] = [];
  for (let i = 0; i < all.length - 1; i++) {
    const from = all[i];
    let to = from;
    let ids: string[] = [];
    for (let j = i + 1; j < all.length && ids.length < min; j++) {
      to = all[j];
      ids = [...years].filter(([, y]) => y >= from && y <= to).map(([id]) => id);
    }
    if (ids.length >= min && ids.length < max) out.push({ from, to, ids });
  }
  return out;
}

export function buildGroups(data: LolData): Map<string, Group> {
  const groups = new Map<string, Group>();
  const byId = new Map(data.champions.map((c) => [c.id, c]));
  for (const r of data.regions) {
    groups.set(`region:${r.slug}`, {
      key: `region:${r.slug}`,
      type: "region",
      name: r.name,
      members: data.champions.filter((c) => c.regions.includes(r.slug)).map((c) => c.id),
    });
  }
  const lineName = new Map(data.skinLines.map((l) => [l.id, l.name]));
  const lineMembers = new Map<number, Set<string>>();
  for (const c of data.champions)
    for (const s of c.skins)
      for (const l of s.lines) {
        if (!lineName.has(l)) continue;
        if (!lineMembers.has(l)) lineMembers.set(l, new Set());
        lineMembers.get(l)!.add(c.id);
      }
  for (const [id, set] of lineMembers) {
    const members = [...set].sort((a, b) =>
      (byId.get(a)?.name ?? a).localeCompare(byId.get(b)?.name ?? b, "fr")
    );
    groups.set(`skinline:${id}`, { key: `skinline:${id}`, type: "skinline", name: lineName.get(id)!, members });
  }

  // Première lettre (champions déjà triés par nom dans les données)
  const letters = new Map<string, string[]>();
  for (const c of data.champions) {
    const l = firstLetter(c.name);
    if (!l) continue;
    if (!letters.has(l)) letters.set(l, []);
    letters.get(l)!.push(c.id);
  }
  for (const l of [...letters.keys()].sort()) {
    const members = letters.get(l)!;
    if (members.length < TEAM_SIZE) continue; // trop peu pour une compo (Q, U, X…)
    groups.set(`letter:${l}`, { key: `letter:${l}`, type: "letter", name: `Lettre ${l}`, members });
  }

  // Année de sortie : années seules (≥ 5 champions) + tranches de 2 ans et plus (5 à 19)
  const years = new Map<string, number>();
  for (const c of data.champions) if (c.releaseYear) years.set(c.id, c.releaseYear);
  const order = new Map(data.champions.map((c, i) => [c.id, i]));
  for (const b of [...yearBuckets(years), ...yearRanges(years)]) { // même clé = même groupe, dédoublonné par la Map
    const label = b.from === b.to ? `${b.from}` : `${b.from}-${b.to}`;
    const members = b.ids.sort((x, y) => order.get(x)! - order.get(y)!);
    groups.set(`year:${label}`, { key: `year:${label}`, type: "year", name: `Sortis en ${label}`, members });
  }
  return groups;
}

/** Groupes (régions, familles de skins, lettre, année) auxquels appartient un champion. */
export function groupsOf(champId: string, groups: Map<string, Group>): Group[] {
  return [...groups.values()]
    .filter((g) => g.members.includes(champId))
    .sort(byTypeThenSize);
}

/** Coefficient binomial C(n, k). */
export function binom(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  k = Math.min(k, n - k);
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return Math.round(r);
}

/** Retourne la combinaison n°`index` (ordre lexicographique) de k éléments parmi n. */
export function unrankCombination(n: number, k: number, index: number): number[] {
  const out: number[] = [];
  let x = 0;
  for (let i = 0; i < k; i++) {
    while (true) {
      const c = binom(n - x - 1, k - i - 1);
      if (index < c) break;
      index -= c;
      x++;
    }
    out.push(x);
    x++;
  }
  return out;
}

/**
 * Cherche une attribution 1 champion = 1 rôle pour une équipe de 5.
 * `fixed` permet d'imposer le rôle d'un champion (ex : le champion saisi).
 */
export function assignRoles(
  team: Champion[],
  fixed?: { id: string; role: Role }
): Record<Role, Champion> | null {
  const result = {} as Record<Role, Champion>;
  const used = new Set<string>();
  const order = [...ROLES];
  if (fixed) {
    const c = team.find((t) => t.id === fixed.id);
    if (!c) return null;
    result[fixed.role] = c;
    used.add(c.id);
    order.splice(order.indexOf(fixed.role), 1);
  }
  const rec = (i: number): boolean => {
    if (i === order.length) return true;
    const role = order[i];
    for (const c of team) {
      if (used.has(c.id) || !c.positions.includes(role)) continue;
      used.add(c.id);
      result[role] = c;
      if (rec(i + 1)) return true;
      used.delete(c.id);
    }
    return false;
  };
  return rec(0) ? result : null;
}

export interface CompoQuery {
  champion: Champion;
  pool: Champion[]; // coéquipiers possibles (sans le champion saisi)
  rolesMode: boolean; // exiger une compo jouable (1 par rôle)
  fixedRole?: Role; // rôle imposé au champion saisi
}

/** Nombre max de combinaisons parcourues en mode rôles (garde-fou navigateur). */
export const MAX_SCAN = 3_000_000;

/**
 * Prépare l'accès aux compos d'un groupe.
 * - sans contrainte de rôle : accès direct par index (aucun calcul)
 * - avec contrainte de rôle : on parcourt toutes les combinaisons et on garde les valides
 */
export function prepareCompos(q: CompoQuery) {
  const n = q.pool.length;
  const k = TEAM_SIZE - 1;
  const total = binom(n, k);
  const roleNeeded = q.rolesMode || !!q.fixedRole;

  if (!roleNeeded) {
    return {
      total,
      truncated: false,
      get(index: number) {
        const team = [q.champion, ...unrankCombination(n, k, index).map((i) => q.pool[i])];
        return { team, roles: assignRoles(team) };
      },
    };
  }

  // Pré-filtre : un coéquipier sans position utile est inutile
  const valid: number[] = []; // index lexicographique des combos valides
  let truncated = false;
  if (total > MAX_SCAN) truncated = true;
  const limit = Math.min(total, MAX_SCAN);
  const fixed = q.fixedRole ? { id: q.champion.id, role: q.fixedRole } : undefined;
  if (!fixed || q.champion.positions.includes(fixed.role)) {
    // itération lexicographique incrémentale (plus rapide que unrank à chaque pas)
    const idx = Array.from({ length: k }, (_, i) => i);
    for (let r = 0; r < limit; r++) {
      const team = [q.champion, ...idx.map((i) => q.pool[i])];
      if (assignRoles(team, fixed)) valid.push(r);
      // combinaison suivante
      let p = k - 1;
      while (p >= 0 && idx[p] === n - k + p) p--;
      if (p < 0) break;
      idx[p]++;
      for (let j = p + 1; j < k; j++) idx[j] = idx[j - 1] + 1;
    }
  }
  return {
    total: valid.length,
    truncated,
    get(index: number) {
      const team = [q.champion, ...unrankCombination(n, k, valid[index]).map((i) => q.pool[i])];
      return { team, roles: assignRoles(team, fixed) };
    },
  };
}

/** Skin(s) d'un champion appartenant à une famille donnée. */
export function skinsInLine(champ: Champion, lineId: number): Skin[] {
  return champ.skins.filter((s) => s.lines.includes(lineId));
}

/**
 * Bonus : groupes communs à une équipe entière (ex : 5 Noxiens qui ont aussi
 * tous un skin "Infernal"). Utile pour repérer les compos "double thème".
 */
export function sharedGroups(team: Champion[], groups: Map<string, Group>): Group[] {
  return [...groups.values()].filter((g) => team.every((c) => g.members.includes(c.id)));
}

/** Groupes communs à tous les champions donnés (ids). */
export function commonGroups(ids: string[], groups: Map<string, Group>): Group[] {
  if (!ids.length) return [];
  return [...groups.values()]
    .filter((g) => ids.every((id) => g.members.includes(id)))
    .sort(byTypeThenSize);
}

/**
 * Attribue un rôle distinct à chaque champion d'une équipe partielle (1 à 5).
 * Retourne null si impossible (ex : 3 champions qui ne jouent que mid).
 */
export function assignPartialRoles(team: Champion[]): Map<string, Role> | null {
  const res = new Map<string, Role>();
  const taken = new Set<Role>();
  // les champions les moins flexibles d'abord
  const order = [...team].sort((a, b) => a.positions.length - b.positions.length);
  const rec = (i: number): boolean => {
    if (i === order.length) return true;
    const c = order[i];
    for (const r of ROLES) {
      if (taken.has(r) || !c.positions.includes(r)) continue;
      taken.add(r);
      res.set(c.id, r);
      if (rec(i + 1)) return true;
      taken.delete(r);
      res.delete(c.id);
    }
    return false;
  };
  return rec(0) ? res : null;
}
