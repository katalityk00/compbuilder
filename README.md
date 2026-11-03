# Compo LoL — régions & familles de skins

Saisis un champion de League of Legends → l'app liste **toutes les compos de 5** qui partagent
sa **région** (Noxus, Ionia…) ou une de ses **familles de skins** (K/DA, Infernal, True Damage, Far West…).

- Next.js 16 (App Router), 100 % statique, **aucune base de données**
- Les données sont récupérées **au build** et écrites dans `data/lol-data.json`
- Compatible Vercel sans configuration

## Démarrer

```bash
npm install
npm run data     # récupère les données (≈ 30 s) → data/lol-data.json
npm run dev      # http://localhost:3000
```

Pages :
- `/` — générateur : choix du champion, groupes (régions + familles), liste paginée des compos,
  option **« compo jouable »** (1 champion par rôle), rôle imposé, tirage au hasard, URL partageable.
- `/donnees` — **revue des données** : toutes les régions, familles de skins (skins concernés
  au survol), tableau des champions et avertissements (champions sans région, rôles estimés…).

## Sources

| Donnée | Source |
|---|---|
| Champions, icônes, classes | Data Dragon (Riot) |
| Skins + familles de skins | CommunityDragon `skins.json` / `skinlines.json` (fr_fr) |
| Région de chaque champion | Riot Universe (`associated-faction-slug`) |
| Rôles joués (top/jungle/…) | Meraki Analytics (sinon estimés depuis la classe) |

## Corrections manuelles

`data/overrides.json` est appliqué après la récupération :

```json
{
  "regions":      { "Briar": ["noxus"] },
  "extraRegions": { "Viktor": ["piltover"] },
  "positions":    { "Pyke": ["SUPPORT", "MIDDLE"] },
  "hiddenSkinLines": [1234]
}
```

- `regions` remplace la région, `extraRegions` en ajoute (le champion apparaît alors dans plusieurs régions)
- `hiddenSkinLines` masque une famille (son id est affiché dans `/donnees`)

Relance `npm run data` après modification.

## Déployer sur Vercel

1. Pousse le dossier sur GitHub
2. Vercel → *Add New Project* → importe le repo (preset Next.js détecté automatiquement)
3. Deploy

`npm run build` lance d'abord `prebuild`, qui rafraîchit les données : chaque redéploiement
récupère le dernier patch. Si une source est indisponible pendant le build et qu'un
`data/lol-data.json` est commité, l'ancien fichier est conservé — pense donc à le commiter après
ta revue.

Astuce : un *Deploy Hook* Vercel appelé chaque semaine (GitHub Action cron) garde les données à jour.

## Tests

```bash
npm test   # dénombrement, génération des compos, attribution des rôles
```
