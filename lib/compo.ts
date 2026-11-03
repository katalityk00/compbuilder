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

export type GroupType = "region" | "skinline";
export interface Group {
  key: string; // "region:noxus" | "skinline:12"
  type: GroupType;
  name: string;
  members: string[]; // ids de champions, triés par nom
}

export const TEAM_SIZE = 5;

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
  return groups;
}

/** Groupes (régions + familles de skins) auxquels appartient un champion. */
export function groupsOf(champId: string, groups: Map<string, Group>): Group[] {
  return [...groups.values()]
    .filter((g) => g.members.includes(champId))
    .sort((a, b) => (a.type === b.type ? b.members.length - a.members.length : a.type === "region" ? -1 : 1));
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
    .sort((a, b) => (a.type === b.type ? b.members.length - a.members.length : a.type === "region" ? -1 : 1));
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
