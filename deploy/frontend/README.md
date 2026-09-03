# C-AUTO — Frontend sur plateformes statiques « compatibles Next.js »

Le frontend C-AUTO est une **SPA statique** (`frontend/www`) : il se déploie
donc sur toutes les plateformes qui hébergent des applications Next.js —
**Vercel**, **Netlify**, **Cloudflare Pages** — sans framework particulier
(framework détecté : « static / other »). Aucune compilation n'est nécessaire.

## Principe

Le bundle appelle l'API **en relatif** (`/api/…`) : aucune adresse d'hôte n'est
gravée dedans. Sur une plateforme statique, il suffit de :

1. Servir le dossier `frontend/www` (document root).
2. **Proxy inversé `/api/*` → backend** grâce au fichier de configuration de la
   plateforme (rule de rewrite externe, statut 200).
3. Appliquer le **repli SPA** (`/app/*` → `/app/index.html`, `/*` → `/index.html`)
   et les **règles de cache** PWA (service worker jamais en cache) — déjà écrites
   dans les fichiers fournis, miroir de `frontend/nginx.conf`.

> Seule valeur à renseigner : l'URL publique de l'API C-AUTO
> (`__BACKEND_API_ORIGIN__`), par ex. `https://api.cauto.example`. Cette adresse
> est celle de votre déploiement backend (VPS + Docker, Railway, Render, Fly.io,
> Coolify…), pas un hébergeur imposé — elle reste modifiable à tout moment.

## Fichiers fournis

| Plateforme          | Fichier(s)                                            | Copier dans `frontend/www/` |
|---------------------|-------------------------------------------------------|------------------------------|
| Vercel              | `vercel.json`                                         | `vercel.json`                |
| Netlify             | `netlify.toml`                                        | `netlify.toml`               |
| Cloudflare Pages    | `cloudflare-pages/_redirects` + `_headers`            | `_redirects`, `_headers`     |

## Procédure

```bash
# Pour Vercel :
cp deploy/frontend/vercel.json frontend/www/vercel.json

# Pour Netlify :
cp deploy/frontend/netlify.toml frontend/www/netlify.toml

# Pour Cloudflare Pages :
cp deploy/frontend/cloudflare-pages/_redirects frontend/www/_redirects
cp deploy/frontend/cloudflare-pages/_headers frontend/www/_headers
```

Puis remplacer `__BACKEND_API_ORIGIN__` dans le fichier copié par l'URL du
backend, et déployer avec le document root = `frontend/www` :

- **Vercel** : `vercel --prod` (ou import git ; Framework Preset = Other, Root
  Directory = `frontend/www`).
- **Netlify** : Build Command vide, Publish directory = `frontend/www`.
- **Cloudflare Pages** : Build Command vide, Root directory = `frontend/www`.

## Ce que ces fichiers garantissent (équivalent nginx)

- `/api/*` → proxy vers `https://__BACKEND_API_ORIGIN__/api/*` (200, sans
  changement d'URL côté navigateur).
- Repli SPA : toute route `/app/*` manquante sert `app/index.html`, toute route
  racine manquante sert `index.html` (aucune page 404 « non-application »).
- `/app/sw.js`, `/app/pwa.js`, `/app/manifest.json` : **jamais** en cache long
  (le service worker doit être détecté par le navigateur).
- `/app/index.html`, `/app/offline.html`, `/*.html` : revalidation à chaque
  requête (versions `?v=` portées par les assets).
- `/app/*.js`, `/app/*.css` (versionnés) : cache public immuable 7 jours.
- Assets marketing `css/ js/ img/` : cache public 7 jours.

## Non-verrouillage

Chaque plateforme n'est qu'un **fichier de configuration optionnel** : passer
de l'une à l'autre = copier un autre fichier et changer le backend origin.
Aucune modification du code applicatif, aucune dépendance ajoutée, aucun secret.
La pile Docker (nginx) reste la voie par défaut ; les plateformes statiques
sont une alternative possible à tout moment.