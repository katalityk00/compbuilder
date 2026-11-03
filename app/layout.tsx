import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compo LoL — régions & skins",
  description: "Génère toutes les compos League of Legends autour d'un champion, par région ou famille de skins.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>
        <header className="topbar">
          <Link href="/" className="brand">⚔ Compo<span>LoL</span></Link>
          <nav>
            <Link href="/">Constructeur</Link>
            <Link href="/explorer">Explorateur</Link>
            <Link href="/donnees">Données</Link>
          </nav>
        </header>
        <main>{children}</main>
      </body>
    </html>
  );
}
