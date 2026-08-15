# Contretype

Jeu de mémoire cinéphile construit sur un profil Letterboxd : une affiche, une question
(« qui a réalisé ? », « cite trois acteurs »), et un moteur de répétition espacée qui fait
revenir les films oubliés et espace ceux qui sont acquis.

Mobile-first, hors-ligne après l'import : films et progression vivent dans IndexedDB, rien
n'est envoyé à un serveur tiers.

## Ce qu'on peut oublier

Sept catégories, activables une par une avant chaque partie. Aucune ne coûte de requête : tout
est déjà dans le deck, et [lib/import/run.ts](lib/import/run.ts) crée les cartes manquantes
hors-ligne au lancement.

| Les gens | Le film |
|---|---|
| Réalisateur, acteurs, chef opérateur, compositeur | Titre d'après le casting, titre d'après l'affiche, année |

Les deux catégories « titre » sont distinctes : reconnaître un film à ses visages et le
reconnaître à son affiche floutée sont deux souvenirs différents, que FSRS planifie séparément.

**Quand ça ne vient pas**, trois mauvaises réponses ouvrent une échelle d'indices
([lib/game/hints.ts](lib/game/hints.ts)) — initiales, puis prénom, puis un début de nom — et
la dernière marche propose quatre choix. Chaque indice abaisse le plafond de note : une réponse
soufflée ne ressemble jamais à un rappel propre.

**Le mode arcade** ([lib/game/arcade.ts](lib/game/arcade.ts)) vit à côté du deck : sans fin,
trois fautes, tirage au hasard. Il n'écrit jamais de carte — c'est la garantie qui empêche une
partie jouée à la volée de réécrire les échéances de révision.

**Ton cinéma** (`/bonus`) est hors du jeu : réalisateurs récurrents, décennies, angles morts
mesurés sur l'historique, et les films que tu as vus mais oubliés — ceux qu'il est peut-être
temps de revoir.

## Démarrer

```bash
npm install
cp .env.local.example .env.local   # puis colle ta clé TMDB
npm run dev
```

La clé TMDB se crée gratuitement sur themoviedb.org → Paramètres → API. La **clé v3**
(32 caractères) et le **jeton v4** (long JWT) marchent tous les deux : le client détecte la
forme et l'envoie en query ou en en-tête. Sans elle, l'import s'arrête après la lecture de la
liste de films.

```bash
npm test                                # matcher, SRS, lecture des exports
npm run verify:letterboxd neoslight     # scraping d'un vrai profil
npx tsx --env-file=.env.local scripts/verify-pipeline.mts 25   # archive -> TMDB, bout en bout
```

## Comment les données arrivent

Letterboxd n'a pas d'API publique (accès sur demande, rarement accordé). Trois faits mesurés
sur le site en août 2026 déterminent l'architecture :

| Constat | Conséquence dans le code |
|---|---|
| `fetch` global (undici) reçoit un 403 Cloudflare sur **chaque** requête ; `node:https` avec les mêmes en-têtes reçoit 200 | [lib/http.ts](lib/http.ts) utilise `node:https`, donc les routes tournent en runtime `nodejs`, jamais edge |
| La section profil (`/<user>/films/`) répond `cf-mitigated: challenge` dès que l'IP a été un peu sollicitée, et reste bloquée 5 min et plus — la page 1 passe, la pagination non | l'import CSV est présenté **en premier** dans l'UI ; la lecture par pseudo reste offerte mais annoncée comme faillible |
| La section `/film/<slug>/` tolère ~3 req/s (mesuré : 49/50 en 31 s) | c'est ce qui rend praticable la résolution de ~2000 slugs |
| La page film porte `tmdb-id="496243"` (et le lien `themoviedb.org/tv/...` pour les séries) | identifiant exact, au lieu de deviner par titre + année |
| L'export CSV ne contient **aucun slug** : les films y sont des liens courts `boxd.it/23gY`, qui redirigent vers la page film | [lib/http.ts](lib/http.ts) suit les redirections, et le slug est lu sur l'URL finale — une seule requête logique par film, comme pour un slug |

Chaîne complète : archive ZIP (ou grille du profil) → référence de film → page film → id TMDB
exact → `/movie/{id}?append_to_response=credits` → réalisateur, casting, affiche, photos.

L'archive supprime les 28 requêtes fragiles sur le profil, et [lib/letterboxd/csv.ts](lib/letterboxd/csv.ts)
l'ouvre directement dans le navigateur (`fflate`) : `watched.csv` en priorité, sinon `diary.csv`
ou `ratings.csv`, et `profile.csv` fournit le pseudo. L'étape coûteuse restante — une page
`/film/` par titre — passe sans problème et son résultat est définitif.

### Deux voies de résolution

Interroger Letterboxd pour chaque film donne un identifiant exact mais coûte ~0,9 s par titre,
soit une demi-heure pour 2000 films. La recherche TMDB ne coûte rien mais peut confondre deux
films homonymes. [lib/tmdb/search.ts](lib/tmdb/search.ts) combine les deux : la recherche
tranche **seulement** s'il existe un et un seul titre exact dans l'année (±1), séries comprises
— sinon le film part sur la voie lente. Le doute est levé, jamais deviné.

Mesuré sur l'archive réelle du compte `neoslight` (1964 films) :

- **90,1 %** des films tranchés par la recherche seule, en 57 s ; les 9,9 % restants passent
  par Letterboxd (~3 min)
- sur 330 films tirés au hasard et résolus par les deux voies, 295 tranchés par la recherche
  et **295 identiques** à l'identifiant exact de Letterboxd — aucune divergence
- import complet : **~4 min** au lieu de ~29
- enrichissement : 25/25 jouables ; couverture chef opérateur 25/25, compositeur 22/25
  (catégories déjà stockées, jouables dans une version suivante)

Les ambiguïtés typiques sont *Les Misérables*, *Mother*, *RED*, *Taxi Driver* : titres repris,
remakes, mots trop courants. Exactement les cas où deviner serait une faute.

Les films sans affiche ou sans réalisateur n'entrent pas dans le deck, et les séries en sont
écartées : mieux vaut un deck plus petit qu'une question dont la réponse est douteuse.

## Repères de code

- [lib/letterboxd/scrape.ts](lib/letterboxd/scrape.ts) — parsing du profil, résolution des slugs, erreurs explicites si le HTML change
- [lib/letterboxd/csv.ts](lib/letterboxd/csv.ts) — repli sur l'export officiel, sans aucun scraping
- [lib/matching/fuzzy.ts](lib/matching/fuzzy.ts) — tolérance aux fautes proportionnelle à la longueur, nom de famille seul, garde-fou qui refuse une réponse collant mieux à quelqu'un d'autre
- [lib/matching/title.ts](lib/matching/title.ts) — même principe pour les titres, avec une règle en plus : un titre portant un autre numéro est hors d'atteinte de la tolérance, pour que « Scream » ne réponde jamais pour « Scream 2 »
- [lib/srs/scheduler.ts](lib/srs/scheduler.ts) — FSRS (`ts-fsrs`), notes déduites de la justesse, de la vitesse et des fautes de frappe
- [lib/srs/queue.ts](lib/srs/queue.ts) — cartes dues d'abord, puis inédites par popularité, avec anti-répétition
- [lib/db/schema.ts](lib/db/schema.ts) — Dexie ; une carte = un film × une catégorie
- [lib/db/backup.ts](lib/db/backup.ts) — valide une sauvegarde restaurée *avant* d'effacer quoi que ce soit
- [public/sw.js](public/sw.js) — service worker écrit à la main : coquille de l'app, plus un cache des affiches, sans quoi « hors-ligne » afficherait des cadres vides

## Attribution

This product uses the TMDB API but is not endorsed or certified by TMDB.
