"use client";

import { useMemo, useState } from "react";
import type { Champion } from "@/lib/compo";

const norm = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export default function ChampionPicker({
  champions,
  value,
  onChange,
  placeholder,
}: {
  champions: Champion[];
  value: Champion | null;
  onChange: (c: Champion | null) => void;
  placeholder?: string;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);

  const results = useMemo(() => {
    const n = norm(q);
    if (!n) return champions.slice(0, 12);
    const starts = champions.filter((c) => norm(c.name).startsWith(n) || norm(c.id).startsWith(n));
    const contains = champions.filter((c) => !starts.includes(c) && norm(c.name).includes(n));
    return [...starts, ...contains].slice(0, 12);
  }, [q, champions]);

  const pick = (c: Champion) => {
    onChange(c);
    setQ("");
    setOpen(false);
  };

  return (
    <div className="picker">
      <input
        placeholder={placeholder ?? (value ? `${value.name} — changer de champion…` : "Tape un champion (ex : Ahri, Darius…)")}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setHi(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, results.length - 1)); }
          if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          if (e.key === "Enter" && results[hi]) pick(results[hi]);
          if (e.key === "Escape") setOpen(false);
        }}
        aria-label="Rechercher un champion"
      />
      {open && results.length > 0 && (
        <ul className="suggest">
          {results.map((c, i) => (
            <li key={c.id}>
              <button
                className={i === hi ? "hi" : ""}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => pick(c)}
              >
                <img src={c.icon} alt="" width={28} height={28} />
                {c.name}
                <span className="muted small">{c.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
