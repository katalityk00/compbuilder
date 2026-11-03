"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { data } from "@/lib/data";
import { ROLE_LABELS, type Role, buildGroups, TEAM_SIZE } from "@/lib/compo";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

type Tab = "regions" | "skinlines" | "champions" | "warnings";

export default function DataReview() {
  const [tab, setTab] = useState<Tab>("regions");
  const [q, setQ] = useState("");
  const [minSize, setMinSize] = useState(TEAM_SIZE);
  const groups = useMemo(() => buildGroups(data), []);
  const byId = useMemo(() => new Map(data.champions.map((c) => [c.id, c])), []);
  const regionName = useMemo(() => new Map(data.regions.map((r) => [r.slug, r.name])), []);
  const lineName = useMemo(() => new Map(data.skinLines.map((l) => [l.id, l.name])), []);
  const nq = norm(q);

  const lines = data.skinLines.filter((l) => l.size >= minSize && norm(l.name).includes(nq));
  const regions = data.regions.filter((r) => norm(r.name).includes(nq));
  const champs = data.champions.filter((c) => norm(c.name).includes(nq));
  const usable = data.skinLines.filter((l) => l.size >= TEAM_SIZE).length;
  const estimated = data.champions.filter((c) => c.positionsEstimated).length;

  return (
    <div className="stack">
      <section className="card">
        <h1>Revue des données</h1>
        <p className="muted">
          Patch {data.version} · généré le {new Date(data.generatedAt).toLocaleString("fr-FR")}
        </p>
        <div className="stats">
          <Stat n={data.champions.length} label="champions" />
          <Stat n={data.regions.length} label="régions" />
          <Stat n={data.skinLines.length} label="familles de skins" />
          <Stat n={usable} label={`familles avec ≥ ${TEAM_SIZE} champions`} />
          <Stat n={data.warnings.length} label="avertissements" warn={data.warnings.length > 0} />
          {estimated > 0 && <Stat n={estimated} label="rôles estimés" warn />}
        </div>
      </section>

      <section className="card">
        <div className="toolbar">
          <div className="seg">
            {([
              ["regions", "Régions"],
              ["skinlines", "Familles de skins"],
              ["champions", "Champions"],
              ["warnings", `Avertissements (${data.warnings.length})`],
            ] as [Tab, string][]).map(([k, label]) => (
              <button key={k} className={tab === k ? "on" : ""} onClick={() => setTab(k)}>{label}</button>
            ))}
          </div>
          {tab !== "warnings" && (
            <input className="search" placeholder="Filtrer…" value={q} onChange={(e) => setQ(e.target.value)} />
          )}
          {tab === "skinlines" && (
            <label>
              Min. champions{" "}
              <input type="number" min={1} value={minSize} onChange={(e) => setMinSize(Number(e.target.value) || 1)} style={{ width: 60 }} />
            </label>
          )}
        </div>

        {tab === "regions" &&
          regions.map((r) => (
            <GroupBlock key={r.slug} title={r.name} count={r.size} ids={groups.get(`region:${r.slug}`)?.members ?? []} byId={byId} />
          ))}

        {tab === "skinlines" && (
          <>
            <p className="muted small">{lines.length} famille(s) affichée(s)</p>
            {lines.map((l) => (
              <GroupBlock
                key={l.id}
                title={l.name}
                count={l.size}
                ids={groups.get(`skinline:${l.id}`)?.members ?? []}
                byId={byId}
                lineId={l.id}
                sub={`id ${l.id}`}
              />
            ))}
          </>
        )}

        {tab === "champions" && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Champion</th><th>Région(s)</th><th>Rôles</th><th>Skins</th><th>Familles de skins</th></tr>
              </thead>
              <tbody>
                {champs.map((c) => {
                  const fam = [...new Set(c.skins.flatMap((s) => s.lines))].map((id) => lineName.get(id)).filter(Boolean);
                  return (
                    <tr key={c.id}>
                      <td>
                        <Link href={`/?team=${c.id}`} className="row-champ">
                          <img src={c.icon} alt="" width={28} height={28} /> {c.name}
                        </Link>
                      </td>
                      <td>{c.regions.map((r) => regionName.get(r) ?? r).join(", ")}</td>
                      <td>
                        {c.positions.map((p) => ROLE_LABELS[p as Role] ?? p).join(", ")}
                        {c.positionsEstimated && <span className="pill warn">estimé</span>}
                      </td>
                      <td>{c.skins.length}</td>
                      <td className="small">{fam.join(" · ") || <span className="muted">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {tab === "warnings" &&
          (data.warnings.length === 0 ? (
            <p>Aucun avertissement 🎉</p>
          ) : (
            <ul className="warnings">{data.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
          ))}
      </section>
    </div>
  );
}

function Stat({ n, label, warn }: { n: number; label: string; warn?: boolean }) {
  return (
    <div className={`stat ${warn ? "warn" : ""}`}>
      <b>{n.toLocaleString("fr-FR")}</b>
      <span>{label}</span>
    </div>
  );
}

function GroupBlock({
  title,
  count,
  ids,
  byId,
  lineId,
  sub,
}: {
  title: string;
  count: number;
  ids: string[];
  byId: Map<string, (typeof data.champions)[number]>;
  lineId?: number;
  sub?: string;
}) {
  return (
    <details className="gblock" open={count <= 30}>
      <summary>
        <b>{title}</b> <span className="muted">— {count} champion{count > 1 ? "s" : ""}</span>
        {sub && <span className="muted small"> · {sub}</span>}
      </summary>
      <div className="icons">
        {ids.map((id) => {
          const c = byId.get(id)!;
          const skins = lineId != null ? c.skins.filter((s) => s.lines.includes(lineId)) : [];
          return (
            <Link key={id} href={`/?team=${id}`} className="icon" title={skins.length ? skins.map((s) => s.name).join("\n") : c.name}>
              <img src={c.icon} alt="" width={40} height={40} loading="lazy" />
              <span>{c.name}</span>
            </Link>
          );
        })}
      </div>
    </details>
  );
}
