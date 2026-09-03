# Authentification & autorisations — C-AUTO

## 1. Mots de passe

- Hachage **bcryptjs, 12 rounds** (inscription, création d'admin, changement de mot de passe) ; vérification par `bcrypt.compare`.
- Aucun mot de passe réel n'est stocké en clair ni commité (le seul mot de passe du dépôt est le mot de passe **démo** `Test1234!` des comptes de démonstration, remplaçable ; le compte admin de développement, lui, est défini par variables d'environnement `SEED_ADMIN_*`, module 80).

## 2. JWT d'accès

- Émis par `signToken` (`backend/src/middlewares/auth.js`) avec `{ sub: user.id, role }`, secret `JWT_SECRET` (serveur refuse de démarrer sans lui), expiration `JWT_EXPIRES_IN || '2h'`.
- Porté en en-tête `Authorization: Bearer <token>` ; validé par `requireAuth`.
- Quand le rôle est `SUPER_ADMIN`, `requireAuth` mappe `req.user.isSuperAdmin = true` et **dégrade `role` en `ADMIN`** pour les contrôles en aval.

## 3. Refresh token (rotation)

- Publique non exposé : 48 octets aléatoires hex, stocké **haché (SHA-256)** dans `refresh_tokens` (`token_hash`, `expires_at`, `ip`, `user_agent`).
- Déposé en cookie **httpOnly** : nom `cauto_refresh` (`REFRESH_COOKIE_NAME`), `path: /api/auth`, `sameSite: 'lax'`, `secure` en production (ou `COOKIE_SECURE`), durée **30 jours** (cookie et DB).
- `POST /refresh` : rotation (ancien `revoked_at=now()`, nouveau jeton) ; un compte `SUSPENDED` est refusé.
- Lecture du cookie via parsing du header `Cookie` (aucun cookie-parser).

## 4. OTP (codes à usage unique)

- Table `otp_codes` : code **6 chiffres** (100000–999999), `code_hash` (SHA-256), `purpose` (`LOGIN`, `SUPER_CONFIRM`, …), `expires_at` = **+10 min**, `attempts`, `consumed_at`, `ip`.
- `POST /api/auth/otp/request` : génère et délivre selon le mode — `DEMO_MODE` → retourné `medium:'demo'` ; `OTP_API_URL`+`OTP_API_KEY` → SMS (`'sms'`) ; sinon `'debug'` hors prod / `'log'` en prod. Anti-énumération : email inconnu renvoie quand même `ok:true`.
- `POST /api/auth/otp/verify` : comparaison **temps constant** sur haché ; **max 5 tentatives** (sinon 429) ; succès → `consumed_at=now()` + `{verified, token, user}`.
- Limite de débit : `otpLimiter` (10/15 min).

## 5. RBAC — rôles & permissions

- Rôles canoniques (`auth.js`) : `CLIENT, GARAGE, MECANICIEN, EXPERT, SUPPLIER, LIVREUR, FLEET_MANAGER, ADMIN, SUPER_ADMIN`.
- Contrôles :
  - `requireAuth` — présence/validité du JWT ;
  - `requireRole(...roles)` — liste blanche (SUPER_ADMIN toujours autorisé via `isSuperAdmin`) ;
  - `requirePermission(code)` — vérifie `user_roles → role_permissions → permissions` (`hasPermission`) ; ex. `users.roles.assign`, `admin.settings.manage`, `admin.audit.view` ;
  - `requireSuperConfirm(mode)` — **deuxième facteur** pour les mutations sensibles super-admin : mode `password` (body `confirm_password` vérifié bcrypt) ou `otp` (body `confirm_otp`, purpose `SUPER_CONFIRM`, 5 essais max).
- Console super admin : `requireAuth` + vérification explicite `isSuperAdmin` (un simple ADMIN → 403) ; auto-modification interdite ; suspension/revoke du rôle SUPER_ADMIN interdits ; pay par défaut protégé.

## 6. Rate limiting

| Limiteur | Portée | Fenêtre | Max | Variable |
|---|---|---|---|---|
| API globale | `/api` | 15 min | 300 | `RATE_LIMIT_API_MAX` |
| Auth | `/register`, `/login`, `/refresh` | 15 min | 20 | `RATE_LIMIT_AUTH_MAX` |
| OTP | `/otp/request`, `/otp/verify` | 15 min | 10 | `RATE_LIMIT_OTP_MAX` |
| Essais OTP (logique) | `/otp/verify`, `requireSuperConfirm` | par code | 5 | codé en dur |

Tout passe par `express-rate-limit` avec `standardHeaders: true`.

## 7. Sessions des rôles

- **Client** : véhicules visibles seulement par le propriétaire (et garage assigné/admin) ; ne peut ni créer ni modifier un diagnostic pro.
- **Pro (GARAGE/MECANICIEN)** : réception, diagnostic, devis, ordre, contrôle qualité, clôture.
- **Fournisseur (SUPPLIER)** : catalogue pièces/commandes ; aucun accès aux données véhicule privées.
- **ADMIN / SUPER_ADMIN** : consoles d'administration (voir `docs/api.md` §7).