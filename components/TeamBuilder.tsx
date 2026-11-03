"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { data } from "@/lib/data";
import {
  type Champion,
  type Group,
  type Role,
  ROLE_LABELS,
  TEAM_SIZE,
  assignPartialRoles,
  binom,
  buildGroups,
  commonGroups,
  skinsInLine,
} from "@/lib/compo";
import ChampionPicker from "./ChampionPicker";

const fmt = (n: number) => n.toLocaleString("fr-FR");
const SUGGEST_STEP = 30;

export default function TeamBuilder() {
  const params = useSearchParams();
  const champById = useMemo(() => new Map(data.champions.map((c) => [c.id, c])), []);
  const groups = useMemo(() => buildGroups(data), []);

  const [ids, setIds] = useState<string[]>(() =>
    (params.get("team") ?? "").split(",").filter((id) => champById.has(id)).slice(0, TEAM_SIZE)
  );
  const [focus, setFocus] = useState<string | null>(params.get("focus"));
  const [kind, setKind] = useState<"all" | "region" | "skinline">("all");
  const [rolesOnly, setRolesOnly] = useState(true);
  const [shown, setShown] = useState(SUGGEST_STEP);

  const team = ids.map((id) => champById.get(id)!);
  const full = ids.length === TEAM_SIZE;
  const shared = useMemo(() => commonGroups(ids, groups), [ids, groups]);
  const before = useMemo(() => commonGroups(ids.slice(0, -1), groups), [ids, groups]);
  const lost = ids.length >= 2 ? before.filter((g) => !shared.some((s) => s.key === g.key)) : [];
  const focusGroup = focus ? shared.find((g) => g.key === focus) ?? null : null;
  const roles = useMemo(() => assignPartialRoles(team), [ids]); // eslint-disable-line react-hooks/exhaustive-deps

  // URL partageable
  useEffect(() => {
    const p = new URLSearchParams();
    if (ids.length) p.set("team", ids.join(","));
    if (focusGroup) p.set("focus", focusGroup.key);
    const qs = p.toString();
    window.history.replaceState(null, "", qs ? `?${qs}` : window.location.pathname);
  }, [ids, focusGroup]);
  useEffect(() => setShown(SUGGEST_STEP), [ids, focus, kind, rolesOnly]);

  // Candidats pour le prochain emplacement : champions qui gardent au moins un thème commun
  const candidates = useMemo(() => {
    if (!ids.length || full) return [];
    const pool = shared.filter((g) => (focusGroup ? g.key === focusGroup.key : kind === "all" || g.type === kind));
    const keep = new Map<string, Group[]>();
    for (const g of pool)
      for (const id of g.members) {
        if (ids.includes(id)) continue;
        if (!keep.has(id)) keep.set(id, []);
        keep.get(id)!.push(g);
      }
    let list = [...keep.entries()].map(([id, gs]) => ({ champ: champById.get(id)!, groups: gs, rolesOk: true }));
    for (const c of list) c.rolesOk = !!assignPartialRoles([...team, c.champ]);
    if (rolesOnly) list = list.filter((c) => c.rolesOk);
    return list.sort((a, b) => b.groups.length - a.groups.length || a.champ.name.localeCompare(b.champ.name, "fr"));
  }, [ids, shared, focusGroup, kind, rolesOnly, full, champById]); // eslint-disable-line react-hooks/exhaustive-deps

  const add = (c: Champion | null) => {
    if (!c || ids.includes(c.id) || full) return;
    setIds([...ids, c.id]);
  };
  const remove = (id: string) => setIds(ids.filter((x) => x !== id));
  const lineIdOf = (g: Group | null) => (g?.type === "skinline" ? Number(g.key.split(":")[1]) : null);
  const focusLine = lineIdOf(focusGroup);
  const remaining = TEAM_SIZE - ids.length;
  const visibleShared = shared.filter((g) => kind === "all" || g.type === kind);

  return (
    <div className="stack">
      <section className="card hero">
        <h1>Constructeur de compo</h1>
        <p className="muted">
          Ajoute les champions un par un : à chaque ajout, seuls les <b>thèmes communs</b> (région ou famille de
          skins) restent. Patch {data.version}.
        </p>

        <div className="slots">
          {Array.from({ length: TEAM_SIZE }, (_, i) => {
            const c = team[i];
            if (!c) return <div key={i} className={`slot empty ${i === ids.length ? "next" : ""}`}>{i + 1}</div>;
            const skin = focusLine != null ? skinsInLine(c, focusLine)[0] : null;
            const role = roles?.get(c.id);
            return (
              <div key={c.id} className="slot">
                <button className="slot-x" onClick={() => remove(c.id)} title="Retirer">×</button>
                <img src={skin?.tile ?? c.icon} alt="" />
                <div className="m-name">{c.name}</div>
                {skin && <div className="m-skin" title={skin.name}>{skin.name}</div>}
                {role && <div className="m-role">{ROLE_LABELS[role]}</div>}
              </div>
            );
          })}
        </div>

        {!full && (
          <ChampionPicker
            champions={data.champions.filter((c) => !ids.includes(c.id))}
            value={null}
            onChange={add}
            placeholder={ids.length ? `Ajouter un ${ids.length + 1}ᵉ champion (n'importe lequel)…` : "Tape un premier champion (ex : Ahri, Darius…)"}
          />
        )}
        {ids.length > 0 && (
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <button onClick={() => setIds(ids.slice(0, -1))}>↶ Annuler le dernier</button>
            <button onClick={() => { setIds([]); setFocus(null); }}>Tout effacer</button>
            {!roles && <span className="pill warn">rôles incompatibles (plusieurs champions sur le même poste)</span>}
          </div>
        )}
      </section>

      {ids.length > 0 && (
        <section className={`card ${shared.length === 0 ? "invalid" : full ? "valid" : ""}`}>
          <div className="list-head">
            <h2>
              {shared.length === 0
                ? "✖ Aucun thème commun"
                : full
                  ? `✔ Compo complète — ${shared.length} thème${shared.length > 1 ? "s" : ""} commun${shared.length > 1 ? "s" : ""}`
                  : `${shared.length} thème${shared.length > 1 ? "s" : ""} commun${shared.length > 1 ? "s" : ""}`}
            </h2>
            {shared.length > 0 && (
              <div className="seg">
                {(["all", "region", "skinline"] as const).map((k) => (
                  <button key={k} className={kind === k ? "on" : ""} onClick={() => setKind(k)}>
                    {k === "all" ? "Tout" : k === "region" ? "Régions" : "Skins"}
                  </button>
                ))}
              </div>
            )}
          </div>

          {lost.length > 0 && (
            <p className="lost">
              En ajoutant <b>{team[team.length - 1].name}</b>, tu perds : {lost.map((g) => g.name).join(", ")}
            </p>
          )}
          {shared.length === 0 && (
            <p className="muted">Retire le dernier champion pour revenir aux thèmes précédents.</p>
          )}

          <div className="groups">
            {visibleShared.map((g) => {
              const pool = g.members.length - ids.length;
              const n = binom(pool, remaining);
              return (
                <button
                  key={g.key}
                  className={`group ${g.type} ${focusGroup?.key === g.key ? "active" : ""}`}
                  onClick={() => setFocus(focusGroup?.key === g.key ? null : g.key)}
                  title={full ? "" : "Cliquer pour ne proposer que ce thème"}
                >
                  <span className="g-type">{g.type === "region" ? "Région" : "Skins"}</span>
                  <span className="g-name">{g.name}</span>
                  <span className="g-meta">
                    {full ? `${g.members.length} champions dans ce thème` : `${pool} candidat${pool > 1 ? "s" : ""} · ${fmt(n)} compo${n > 1 ? "s" : ""} possible${n > 1 ? "s" : ""}`}
                  </span>
                </button>
              );
            })}
          </div>

          {full && shared.some((g) => g.type === "skinline") && (
            <div className="skins-recap">
              <h3>Skins à équiper</h3>
              {shared.filter((g) => g.type === "skinline").map((g) => {
                const lid = lineIdOf(g)!;
                return (
                  <div key={g.key} className="recap-line">
                    <b>{g.name}</b>
                    <ul className="recap-skins">
                      {team.map((c) => (
                        <li key={c.id}>
                          <span className="recap-champ">{c.name}</span>
                          <span className="muted small">{skinsInLine(c, lid).map((s) => s.name).join(" · ")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {ids.length > 0 && !full && shared.length > 0 && (
        <section className="card">
          <div className="list-head">
            <h2>
              Champions pour le {ids.length + 1}ᵉ emplacement
              {focusGroup && <span className="muted"> — {focusGroup.name}</span>}
            </h2>
            <span className="muted">{candidates.length} proposition{candidates.length > 1 ? "s" : ""}</span>
          </div>
          <div className="toolbar">
            <label className="check">
              <input type="checkbox" checked={rolesOnly} onChange={(e) => setRolesOnly(e.target.checked)} />
              Seulement des rôles compatibles (1 champion par poste)
            </label>
            {focusGroup && <button onClick={() => setFocus(null)}>Tous les thèmes</button>}
          </div>
          {candidates.length === 0 ? (
            <p className="muted">Aucun champion ne garde un thème commun{rolesOnly ? " avec des rôles compatibles" : ""}.</p>
          ) : (
            <>
              <div className="cands">
                {candidates.slice(0, shown).map(({ champ, groups: gs, rolesOk }) => (
                  <button key={champ.id} className="cand" onClick={() => add(champ)}>
                    <img src={champ.icon} alt="" width={44} height={44} loading="lazy" />
                    <div className="cand-body">
                      <div className="cand-name">
                        {champ.name}
                        <span className="muted small"> {champ.positions.map((p) => ROLE_LABELS[p as Role] ?? p).join("/")}</span>
                        {!rolesOk && <span className="pill warn">rôle en double</span>}
                      </div>
                      <div className="cand-groups">
                        {gs.map((g) => <span key={g.key} className={`tag ${g.type}`}>{g.name}</span>)}
                      </div>
                    </div>
                  </button>
                ))}
              </div>
              {candidates.length > shown && (
                <div className="pager">
                  <button onClick={() => setShown(shown + SUGGEST_STEP)}>
                    Voir plus ({candidates.length - shown} restants)
                  </button>
                </div>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
