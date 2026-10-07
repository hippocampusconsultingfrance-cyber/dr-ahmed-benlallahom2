# Audit complet du code — 7 octobre 2026

**Périmètre :** dépôt `dr-ahmed-benlallahom2` (branche `main` @ `78f46f1`), front React/Vite, API Express/tRPC, schéma Drizzle/Neon, configuration Vercel.
**Méthode :** lecture du code, `tsc`, suite Vitest (`test:ci`), `pnpm audit`, build Vite de production. Aucun appel au site en production, aucune donnée réelle touchée.

## Synthèse

Le code est globalement **sérieux** : TypeScript strict sans erreur, 478 tests qui passent, validation Zod partout, routes admin protégées par rôle + MFA, webhooks Stripe et Resend signés, fichiers candidats chiffrés, limitation de débit persistante sur les formulaires sensibles. Ce n'est pas un « site ChatGPT » fragile.

Les vrais problèmes viennent surtout de la **migration Manus → Vercel restée incomplète** : plusieurs mécanismes (tâches planifiées, SEO rendu côté serveur, stockage d'images) supposent encore l'hébergement Manus et ne fonctionnent pas en production sur Vercel.

| Priorité | Nombre | Thème principal |
| --- | --- | --- |
| P0 (critique, impact patient/légal) | 2 | Tâches planifiées jamais exécutées sur Vercel |
| P1 (important) | 5 | SEO/partage social, anti-abus réservation, accessibilité |
| P2 (à planifier) | 8 | Robustesse paiement, dépendances, build |
| P3 (hygiène) | 6 | Dette technique, nettoyage du dépôt |

---

## P0 — Critique

### P0-1. Les tâches planifiées ne tournent pas sur Vercel (confirmations, factures, rappels)

`vercel.json` ne déclare **qu'un seul** cron : `/api/scheduled/recruitment-processing`. Tous les autres jobs sont authentifiés via `sdk.authenticateRequest(req)` → `user.isCron`, mécanisme propre à la plateforme Manus (`server/_core/sdk.ts`, `references/periodic-updates.md`), qui n'appelle plus le domaine servi par Vercel :

| Endpoint (`server/_core/index.ts`) | Effet si jamais appelé |
| --- | --- |
| `/api/scheduled/appointment-fulfillment` (l. 957) | **Après un paiement Stripe, l'email de confirmation et la facture restent en file d'attente indéfiniment.** Le webhook ne fait qu'`enqueueAppointmentFulfillment` (`server/appointmentFulfillment.ts:15`), il n'envoie rien lui‑même. |
| `/api/scheduled/reminder` (l. 827) | Aucun rappel 24 h avant consultation. |
| `/api/scheduled/appointment-hold-cleanup` (l. 971) | Les créneaux « held » expirés ne sont libérés que lors d'une nouvelle réservation (atténué, mais pas d'état propre). |
| `/api/scheduled/candidate-document-processing` (l. 985) | Les documents déposés dans l'espace candidat ne sont jamais analysés. |
| `/api/scheduled/recruitment-retention` (l. 887) | **Les durées de conservation RGPD annoncées ne sont pas appliquées** (purge jamais exécutée) → risque de non-conformité CNIL. |
| `/api/scheduled/security-posture` (l. 999) | Les tables de rate-limit / événements de sécurité grossissent sans fin. |

Cela explique probablement le constat de l'audit du 25/08 : « 5 rendez-vous confirmed avec paiement pending ».

**Correction recommandée :** ajouter chaque job dans `vercel.json > crons` en méthode `GET`, protégé comme `recruitment-processing` par `Authorization: Bearer ${CRON_SECRET}` (factoriser un middleware `requireVercelCron`). Pour la confirmation de paiement, appeler aussi `processDueAppointmentFulfillmentJobs(1)` directement à la fin du webhook Stripe (via `waitUntil` de `@vercel/functions`) pour que le patient reçoive son email immédiatement. Attention : le plan Vercel Hobby limite les crons à 1/jour — un plan Pro est nécessaire pour un rythme horaire.

### P0-2. Images stockées sous `/manus-storage/` dépendantes de l'API Forge Manus

`server/_core/storageProxy.ts` signe les URLs via `ENV.forgeApiUrl/forgeApiKey`. Sans ces variables (ou si Manus coupe le service), tous les visuels servis par ce chemin renvoient 500. L'audit du 25/08 constatait déjà 6 images cassées sur l'accueil.

**Correction :** migrer ces fichiers vers `@vercel/blob` (déjà en dépendance) ou dans `client/public/assets/`, puis supprimer le proxy.

---

## P1 — Important

### P1-1. Aucun `<title>` ni meta description dans le HTML servi par Vercel

`client/index.html` contient un marqueur `<!--route-seo-->` remplacé par Express (`server/_core/static.ts:30`). Mais sur Vercel, la règle `"/:path*" → "/index.html"` sert le fichier **statique** : le marqueur reste vide. Conséquences :
- pas de titre, description, canonical ni balises Open Graph sans JavaScript → **aperçus LinkedIn / WhatsApp / Facebook vides**, SEO dégradé (Google exécute le JS mais avec retard) ;
- le `SEOHead` client ne compense que pour les navigateurs.

**Correction :** soit router les pages HTML vers la fonction (`"/:path*" → "/api/index"` en excluant `/assets/`), soit au minimum mettre un `<title>`, une description et des `og:*` par défaut dans `index.html`, idéalement pré-rendre les pages publiques au build.

### P1-2. Réservation : pas d'anti-bot ni de limitation de débit (`appointments.create`)

`server/routers.ts:495` est public, sans Turnstile ni `enforcePublicFormRateLimit` (contrairement au contact, RGPD, recrutement, questions santé). Chaque appel **bloque un créneau 30 min** (`APPOINTMENT_HOLD_MS`) et crée une session Stripe. Un script peut verrouiller tout l'agenda en boucle.

**Correction :** ajouter Turnstile + rate-limit par IP/email (même pattern que `contact.submit`), et limiter le nombre de holds actifs par email.

### P1-3. `/api/client-briefs` sans anti-bot ni rate-limit

`server/_core/index.ts:390` : seul un champ honeypot protège le formulaire employeur ; chaque envoi insère en base et notifie le propriétaire → spam facile. Même correction que P1-2.

### P1-4. Zoom bloqué sur mobile (accessibilité)

`client/index.html:6` : `maximum-scale=1` empêche le zoom pincé → non-conformité WCAG 1.4.4 / RGAA 10.4, gênant pour un public de patients. Supprimer `maximum-scale=1`.

### P1-5. Données structurées (JSON-LD) incorrectes

Dans `client/index.html` :
- `worksFor.url` pointe vers `/venture/hippocampus` → **404** (le slug réel est `hippocampus-consulting`) ;
- `sameAs` contient `"https://twitter.com/"` (profil vide) ;
- l'image du `Person` est le logo SVG (Google attend une photo raster) ;
- le `twitterHandle` par défaut de `SEOHead` (`@drahmedbenlallahom`) ne semble pas exister.

Le sitemap dynamique (`server/_core/index.ts:793`) liste aussi `/venture/novarena` qui n'existe pas et diverge de `client/public/sitemap.xml` (c'est le statique qui est servi sur Vercel). Supprimer la route Express ou la générer depuis la même source de vérité.

---

## P2 — À planifier

1. **Webhook Stripe moins strict que le reste** (`server/_core/index.ts:185-232`) : ne vérifie pas `session.payment_status === "paid"` ni que `session.id === appointment.stripeSessionId`, et confirme le rendez-vous même s'il est déjà `cancelled/expired` (créneau potentiellement réattribué entre-temps → double réservation, rare). Conditionner l'`UPDATE` à `appointmentStatus = 'held'` et rembourser/alerter sinon.
2. **Libellé Stripe en anglais** (« Health Consultation - 30 minutes ») sur un site francophone : visible sur la page de paiement et le reçu.
3. **Identifiants générés avec `Math.random()`** (`routers.ts:346,388`, `index.ts:402,502`, `medicalQuestionsRouter.ts:31`) alors que `randomUUID` est déjà utilisé pour les rendez-vous. Si ces numéros de suivi servent à consulter un dossier, ils doivent être imprévisibles → `crypto.randomUUID()`.
4. **Installation non reproductible** : `vercel.json` utilise `pnpm install --no-frozen-lockfile` ; la prod peut installer des versions différentes du lockfile testé. Passer à `--frozen-lockfile`.
5. **Dépendances de dev vulnérables** : `pnpm audit` → 4 critiques / 33 hautes, **toutes en dev** (vitest 2.1 / tinypool, `pnpm` et `tar` en devDependency, vite, postcss). La prod n'a que 5 modérées + 3 faibles (dompurify/katex via `streamdown → mermaid`). Monter vitest ≥ 3, retirer `pnpm` et `add` des devDependencies (ajouté par erreur via `pnpm add add`), mettre à jour `streamdown`.
6. **Tests dépendants de secrets réels** : 12 tests échouent sans `.env` (`candidateAuth`, `candidateDocumentEncryption`, `resend`, `turnstileSecret`, …). Injecter des valeurs factices dans `vitest.config.ts` (`test.env`) pour que `pnpm test` soit vert partout, et séparer les vérifications de configuration de prod dans un script dédié.
7. **Bundle initial de 367 kB (110 kB gzip)** : correct mais améliorable ; `framer-motion`, `recharts`, `streamdown/mermaid` et Clerk méritent d'être chargés à la demande uniquement là où ils servent. `LegalPage` fait 107 kB — découper par section.
8. **`api/index.js` (390 kB) commité** alors qu'il est régénéré à chaque build et figé depuis la PR #14 : source de confusion ; l'ajouter à `.gitignore`.

---

## P3 — Hygiène / dette technique

1. **~60 fichiers Markdown de rapports à la racine** (audits, diagnostics datés, todo, notes) + scripts ponctuels (`add-testimonials*.sh/.mjs`, `seed-testimonials.mjs`, `update-testimonials.mjs`, `webhook-update.txt` contenant un ancien code MySQL). Les déplacer dans `docs/` (archives) et supprimer les scripts obsolètes. Les scripts `add-testimonials.sh` appellent même un endpoint avec des champs (`firstName`) qui n'existent plus.
2. **Code mort** : `client/src/pages/BookingPage-old.tsx` (313 l.) et `ComponentShowcase.tsx` (1 437 l.) ne sont importés nulle part.
3. **Résidus Manus** : `vite-plugin-manus-runtime`, `allowedHosts` `.manus.computer`, `server/_core/{sdk,oauth,heartbeat,dataApi,map,imageGeneration,voiceTranscription}.ts`, dossier `references/` (doc Manus). À retirer une fois P0 traité, pour réduire la surface d'attaque et la confusion.
4. **Nommage trompeur du schéma** : `pgTable as mysqlTable`, `mysqlEnum` qui crée des `varchar` ; dépendance `mysql2` utilisée seulement par un ancien test (`server/testimonials.test.ts`). Renommer pour refléter PostgreSQL.
5. **Fichiers monolithiques** : `server/routers.ts` (2 282 l.) et `server/_core/index.ts` (1 054 l. avec routes métier inline) → découper par domaine (`appointments`, `recruitment`, `admin`, …) comme déjà fait pour `medicalQuestionsRouter`.
6. **Polices** : préchargement d'URLs Google Fonts versionnées en dur (`dmsans/v15`, `playfairdisplay/v37`) qui cassent silencieusement quand Google change de version ; préférer l'auto-hébergement (`@fontsource`) — meilleur aussi pour le RGPD (pas d'IP envoyée à Google, cf. jurisprudence allemande LG München 2022).

---

## Points forts constatés

- `tsc --noEmit` : **0 erreur**. Build Vite : OK, pages découpées en lazy chunks.
- Tests : **478 réussis**, 12 échecs uniquement liés aux secrets absents en local.
- Toutes les mutations admin passent par `adminProcedure` (rôle + MFA serveur).
- En-têtes de sécurité complets (CSP, HSTS preload, nosniff, Permissions-Policy) côté Express **et** Vercel.
- Webhooks Stripe (signature + contrôle du montant, idempotence) et Resend (Svix) vérifiés.
- Uploads : multer avec limite 5 Mo, validation de type, chiffrement AES-256 des documents candidats, téléchargements via routes authentifiées.
- Requêtes SQL brutes systématiquement paramétrées (`sql\`…${}\``) → pas d'injection SQL repérée.
- Prix des consultations calculés côté serveur, jamais fournis par le client.

## Plan d'action conseillé

1. **Semaine 1** : P0-1 (crons Vercel + envoi immédiat post-paiement), puis vérifier en base les rendez-vous payés sans email ; P0-2 (migration des images).
2. **Semaine 2** : P1-1 à P1-5 (SEO HTML, anti-abus réservation et brief employeur, zoom, JSON-LD).
3. **Ensuite** : P2 puis nettoyage P3.
