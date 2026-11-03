"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { data } from "@/lib/data";
import {
  type Champion,
  type Group,
  type Role,
  ROLES,
  ROLE_LABELS,
  TEAM_SIZE,
  binom,
  buildGroups,
  groupsOf,
  prepareCompos,
  sharedGroups,
  skinsInLine,
} from "@/lib/compo";
import ChampionPicker from "./ChampionPicker";

const PAGE_SIZE = 20;
const fmt = (n: number) => n.toLocaleString("fr-FR");

export default function Composer() {
  const params = useSearchParams();
  const champById = useMemo(() => new Map(data.champions.map((c) => [c.id, c])), []);
  const groups = useMemo(() => buildGroups(data), []);

  const [champId, setChampId] = useState<string | null>(params.get("c"));
  const [groupKey, setGroupKey] = useState<string | null>(params.get("g"));
  const [rolesMode, setRolesMode] = useState(params.get("roles") === "1");
  const [fixedRole, setFixedRole] = useState<Role | "">((params.get("role") as Role) || "");
  const [page, setPage] = useState(0);
  const [kind, setKind] = useState<"all" | "region" | "skinline">("all");

  const champion = champId ? champById.get(champId) ?? null : null;
  const myGroups = useMemo(() => (champion ? groupsOf(champion.id, groups) : []), [champion, groups]);
  const group = groupKey ? groups.get(groupKey) ?? null : null;
  const activeGroup = group && champion && group.members.includes(champion.id) ? group : null;

  // URL partageable
  useEffect(() => {
    const p = new URLSearchParams();
    if (champId) p.set("c", champId);
    if (activeGroup) p.set("g", activeGroup.key);
    if (rolesMode) p.set("roles", "1");
    if (fixedRole) p.set("role", fixedRole);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [champId, activeGroup, rolesMode, fixedRole]);

  useEffect(() => setPage(0), [champId, groupKey, rolesMode, fixedRole]);

  const compos = useMemo(() => {
    if (!champion || !activeGroup) return null;
    const pool = activeGroup.members.filter((id) => id !== champion.id).map((id) => champById.get(id)!);
    return prepareCompos({ champion, pool, rolesMode, fixedRole: fixedRole || undefined });
  }, [champion, activeGroup, rolesMode, fixedRole, champById]);

  const visibleGroups = myGroups.filter((g) => kind === "all" || g.type === kind);
  const totalAll = myGroups.reduce((s, g) => s + binom(g.members.length - 1, TEAM_SIZE - 1), 0);
  const pages = compos ? Math.ceil(compos.total / PAGE_SIZE) : 0;

  return (
    <div className="stack">
      <section className="card hero">
        <h1>Explorateur de compos</h1>
        <p className="muted">
          Choisis un champion : on liste toutes les équipes de 5 qui partagent sa <b>région</b> ou une de
          ses <b>familles de skins</b>. Données du patch {data.version}.
        </p>
        <ChampionPicker
          champions={data.champions}
          value={champion}
          onChange={(c) => {
            setChampId(c?.id ?? null);
            setGroupKey(null);
          }}
        />
      </section>

      {champion && (
        <section className="card">
          <div className="champ-head">
            <img src={champion.icon} alt="" width={64} height={64} />
            <div>
              <h2>{champion.name}</h2>
              <div className="muted">{champion.title}</div>
              <div className="pills">
                {champion.positions.map((p) => (
                  <span key={p} className="pill">{ROLE_LABELS[p as Role] ?? p}</span>
                ))}
                {champion.positionsEstimated && <span className="pill warn">rôles estimés</span>}
              </div>
            </div>
            <div className="big-num">
              <b>{fmt(totalAll)}</b>
              <span>compos possibles au total</span>
            </div>
          </div>

          <div className="toolbar">
            <div className="seg">
              {(["all", "region", "skinline"] as const).map((k) => (
                <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                  {k === "all" ? "Tout" : k === "region" ? "Régions" : "Familles de skins"}
                </button>
              ))}
            </div>
          </div>

          {visibleGroups.length === 0 && <p className="muted">Aucun groupe pour ce filtre.</p>}
          <div className="groups">
            {visibleGroups.map((g) => (
              <GroupChip
                key={g.key}
                g={g}
                active={activeGroup?.key === g.key}
                onClick={() => setGroupKey(g.key === groupKey ? null : g.key)}
              />
            ))}
          </div>
        </section>
      )}

      {champion && activeGroup && compos && (
        <section className="card">
          <div className="list-head">
            <h2>
              {activeGroup.type === "region" ? "Région" : "Famille"} : {activeGroup.name}
            </h2>
            <span className="muted">
              {fmt(compos.total)} compo{compos.total > 1 ? "s" : ""}
              {compos.truncated && " (calcul limité, groupe très grand)"}
            </span>
          </div>

          <div className="toolbar">
            <label className="check">
              <input type="checkbox" checked={rolesMode} onChange={(e) => setRolesMode(e.target.checked)} />
              Compo jouable (1 champion par rôle)
            </label>
            <label>
              Rôle de {champion.name} :{" "}
              <select value={fixedRole} onChange={(e) => setFixedRole(e.target.value as Role | "")}>
                <option value="">peu importe</option>
                {ROLES.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                ))}
              </select>
            </label>
            <button
              disabled={!compos.total}
              onClick={() => setPage(Math.floor(Math.random() * pages))}
              title="Aller sur une page au hasard"
            >
              🎲 Au hasard
            </button>
          </div>

          {compos.total === 0 ? (
            <p className="muted">
              Aucune compo ne respecte ces critères
              {activeGroup.members.length < TEAM_SIZE ? ` (le groupe ne compte que ${activeGroup.members.length} champion(s))` : ""}.
            </p>
          ) : (
            <>
              <ol className="compos" start={page * PAGE_SIZE + 1}>
                {Array.from({ length: Math.min(PAGE_SIZE, compos.total - page * PAGE_SIZE) }, (_, i) => {
                  const idx = page * PAGE_SIZE + i;
                  const { team, roles } = compos.get(idx);
                  return (
                    <CompoRow key={idx} team={team} roles={roles} group={activeGroup} groups={groups} />
                  );
                })}
              </ol>
              <Pager page={page} pages={pages} setPage={setPage} />
            </>
          )}
        </section>
      )}
    </div>
  );
}

function GroupChip({ g, active, onClick }: { g: Group; active: boolean; onClick: () => void }) {
  const mates = g.members.length - 1;
  const n = binom(mates, TEAM_SIZE - 1);
  return (
    <button className={`group ${g.type} ${active ? "active" : ""}`} onClick={onClick} disabled={mates < TEAM_SIZE - 1}>
      <span className="g-type">{g.type === "region" ? "Région" : "Skins"}</span>
      <span className="g-name">{g.name}</span>
      <span className="g-meta">
        {mates} coéquipier{mates > 1 ? "s" : ""} · {mates < TEAM_SIZE - 1 ? "pas assez" : `${fmt(n)} compos`}
      </span>
    </button>
  );
}

function CompoRow({
  team,
  roles,
  group,
  groups,
}: {
  team: Champion[];
  roles: Record<Role, Champion> | null;
  group: Group;
  groups: Map<string, Group>;
}) {
  const lineId = group.type === "skinline" ? Number(group.key.split(":")[1]) : null;
  const roleOf = new Map<string, Role>();
  if (roles) for (const r of ROLES) roleOf.set(roles[r].id, r);
  const ordered = roles ? ROLES.map((r) => roles[r]) : team;
  const bonus = sharedGroups(team, groups).filter((g) => g.key !== group.key);

  return (
    <li className="compo">
      <div className="team">
        {ordered.map((c) => {
          const skin = lineId != null ? skinsInLine(c, lineId)[0] : null;
          return (
            <div key={c.id} className={`member ${c.id === team[0].id ? "me" : ""}`}>
              <img src={skin?.tile ?? c.icon} alt="" loading="lazy" />
              <div className="m-name">{c.name}</div>
              {skin && <div className="m-skin" title={skin.name}>{skin.name}</div>}
              {roleOf.get(c.id) && <div className="m-role">{ROLE_LABELS[roleOf.get(c.id)!]}</div>}
            </div>
          );
        })}
      </div>
      {bonus.length > 0 && (
        <div className="bonus">
          ✨ Aussi en commun : {bonus.map((b) => b.name).join(", ")}
        </div>
      )}
      {!roles && <div className="bonus muted">Pas de répartition 1 par rôle possible</div>}
    </li>
  );
}

function Pager({ page, pages, setPage }: { page: number; pages: number; setPage: (p: number) => void }) {
  if (pages <= 1) return null;
  return (
    <div className="pager">
      <button disabled={page === 0} onClick={() => setPage(0)}>«</button>
      <button disabled={page === 0} onClick={() => setPage(page - 1)}>‹</button>
      <span>
        Page{" "}
        <input
          type="number"
          min={1}
          max={pages}
          value={page + 1}
          onChange={(e) => {
            const v = Number(e.target.value) - 1;
            if (v >= 0 && v < pages) setPage(v);
          }}
        />{" "}
        / {fmt(pages)}
      </span>
      <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)}>›</button>
      <button disabled={page >= pages - 1} onClick={() => setPage(pages - 1)}>»</button>
    </div>
  );
}
