# Audit A-à-Z non destructif — `drahmedbenlallahom.com`

**Date de contrôle :** 25 août 2026  
**Périmètre :** domaine public, application locale, API, parcours publics, accès protégés, données agrégées, mobile/desktop, sécurité et performance.  
**Méthode :** aucune candidature, aucun CV, aucun document, aucun email/SMS, aucun paiement, aucune publication, aucune réinitialisation de mot de passe et aucune action administrateur n’ont été créés, envoyés ou modifiés.

## Conclusion exécutive

Le **code applicatif actuel est techniquement cohérent en local**, mais la version effectivement servie par le domaine public est dans un état critique : elle est distribuée par **Vercel**, tandis que l’application full-stack validée est hébergée ailleurs. Le runtime Vercel échoue sur toutes les lectures tRPC de contrôle avec `FUNCTION_INVOCATION_FAILED`, et les actifs stockés sous `/manus-storage/` ne se chargent plus. En conséquence, une part importante des parcours visibles et dynamiques est indisponible sur le site réellement visité.

> Le constat principal n’est pas un défaut isolé de formulaire ou de design : c’est une **divergence de déploiement et de routage** entre le domaine personnalisé, le runtime API et le déploiement géré.

## Anomalies confirmées et priorisation

| Priorité | Anomalie confirmée | Effet observable | Preuve de contrôle | Action de réparation à choisir |
| --- | --- | --- | --- | --- |
| **P0** | Runtime API public Vercel en échec | `auth.me`, `medicalQuestions.published`, `testimonials.list` et `system.health` renvoient tous HTTP 500 `FUNCTION_INVOCATION_FAILED` | Quatre requêtes tRPC de lecture indépendantes échouent sur le domaine public | Réaligner le domaine avec le déploiement full-stack fonctionnel **ou** réparer le déploiement serverless Vercel et ses variables/routages |
| **P0** | Divergence d’hébergement Manus / Vercel | Le domaine racine est servi par Vercel ; `www` redirige vers lui ; l’API du domaine Manus direct renvoie une page HTML « Site Unavailable » | En-têtes HTTP et tests des deux origines | Choisir une seule origine de production et une seule stratégie de domaine avant tout correctif fonctionnel |
| **P1** | Parcours protégés rendus inutilisables | Recrutement standard, VVIP, Questions santé et oubli de mot de passe restent bloqués avec « vérification anti-bot indisponible » | Aucun iframe/jeton Turnstile reçu sur le domaine Vercel ; les boutons restent bloqués de façon sûre | Corriger d’abord la panne de runtime, puis refaire une recette Turnstile réelle sur le domaine choisi |
| **P1** | Actifs graphiques de production indisponibles | Logos, visuel principal, portrait, illustration Services, visuel Contact et visuel Réservation sont vides/cassés | Les six images de l’accueil sous `/manus-storage/` ont `naturalWidth = 0` et `naturalHeight = 0` | Réparer le proxy/chemin de stockage de l’hébergement retenu ; vérifier chaque actif après bascule |
| **P1** | État paiement / rendez-vous à rapprocher | Cinq rendez-vous sont « confirmed » avec paiement « pending », dont un rendez-vous passé | Requête agrégée non nominative en base | Vérifier la logique de confirmation Stripe et traiter manuellement les dossiers concernés avant toute automatisation supplémentaire |
| **P2** | Recherche publique non fiable | La recherche de `anesthésie` retourne zéro résultat alors que le site présente des contenus correspondants | Test de recherche sur le domaine public | Revalider l’index de recherche après rétablissement du bon bundle/runtimes |
| **P2** | Faux code HTTP de route inconnue | L’écran graphique 404 est affiché, mais Vercel répond HTTP 200 | Test d’une URL volontairement inconnue | Renvoyer un véritable HTTP 404 au niveau de l’hébergement/routage pour le SEO et la supervision |
| **P2** | En-têtes de protection manquants sur Vercel | HSTS présent, mais CSP, `X-Content-Type-Options`, `Referrer-Policy` et `Permissions-Policy` absents dans la réponse contrôlée | Inspection d’en-têtes HTTP | Appliquer la politique d’en-têtes au niveau de l’origine de production retenue |
| **P3** | Prévisualisateur non autorisé par Turnstile | Le prévisualisateur temporaire reçoit le code `110200` | Journal navigateur local ; ce code signifie « domaine non autorisé » dans la documentation Cloudflare [1] | Prévoir une recette sur domaine autorisé, ou ajouter une stratégie de test dédiée sans ouvrir inutilement la liste des hôtes |

## Périmètre des conséquences en production

La panne P0 explique directement les symptômes suivants observés sur le domaine public : les témoignages restent en erreur, la bibliothèque Questions santé ne se charge pas, la demande de réinitialisation de mot de passe ne peut pas être initiée, et les parcours demandant Turnstile ne peuvent pas être soumis. Les boutons bloqués sans jeton constituent un **comportement sûr**, mais ne rétablissent pas le service.

Le défaut d’actifs est également transversal : il ne se limite pas au logo. Les images principales de l’accueil et de réservation ne sont pas accessibles par l’hébergement Vercel actuel. L’expérience visuelle publique est donc sensiblement dégradée même sur les pages qui restent statiques.

## Contrôles réussis

| Domaine vérifié | Résultat confirmé | Limite du contrôle |
| --- | --- | --- |
| Tests applicatifs | **177 fichiers réussis, 361 tests réussis, 2 ignorés** | Les tests ignorés concernent uniquement une vérification externe Resend et une recette Turnstile active, volontairement non exécutées sans drapeau dédié |
| Types, build et budgets | TypeScript, build de production et budgets de performance réussis | Mesure de la version locale, pas du bundle Vercel actuellement servi |
| Régression visuelle | **42 scénarios desktop/mobile** validés sur l’application locale | Les références visuelles ne peuvent pas détecter la divergence d’hébergement externe |
| Langues et préférences | Sélecteur FR/EN, mode clair, lisibilité renforcée et mode OLED fonctionnels | Test réalisé sans action métier |
| Formulaire de contact | Nom, email, message et consentement requis ; téléphone optionnel | Aucun remplissage ni envoi n’a été réalisé |
| Accès admin anonyme | Aucune donnée exposée ; connexion administrateur requise | Aucune ouverture de session ou action admin effectuée |
| Comptes candidats | Activation d’email obligatoire avant connexion ; aucun compte actif verrouillé | Contrôle par agrégats et lecture de la règle serveur, sans identité consultée |
| Documents candidats | 4 documents acceptés ; 3 analyses terminées et 1 en revue humaine | Aucun fichier ouvert, téléchargé ou modifié |
| File d’analyse documentaire | 4 traitements terminés, aucun échec ni retard | État au moment du contrôle |
| Export Google Drive | 7 exports terminés ; connexion utilisée sans erreur enregistrée | Aucune exportation forcée pendant l’audit |
| Questions santé | 2 réponses envoyées, 1 demande soumise récemment, aucune publication observable par les agrégats | Aucun contenu médical ni donnée de contact lu |

## Éléments d’investigation à ne pas confondre avec une panne

La base confirme que les candidatures acceptées suivent une revue humaine et que les documents d’espace candidat restent dans le flux prévu. Le compte candidat non vérifié observé dans les agrégats ne constitue pas un contournement : le serveur refuse explicitement toute connexion en l’absence de vérification d’email.

Les 5 rendez-vous confirmés mais non payés doivent toutefois être rapprochés. Ce constat ne démontre pas seul une erreur Stripe — certains dossiers peuvent relever d’un traitement manuel — mais un rendez-vous passé dans cet état justifie une vérification opérationnelle.

Les recommandations purement esthétiques suivantes sont **des pistes d’amélioration**, non des défauts bloquants : mieux hiérarchiser la marque ABL et Hippocampus, renforcer le rythme « intake clinique » des longs formulaires, et utiliser l’accent doré avec davantage de parcimonie pour les informations de prestige.

## Réparation recommandée par ordre de dépendance

1. **Décider de l’origine de production.** Le choix est entre reconnecter le domaine personnalisé au déploiement Manus full-stack fonctionnel, ou conserver Vercel et y réparer l’exécution Express/tRPC, les variables d’environnement, la distribution des actifs et les règles de routage. Cette décision doit précéder toute correction de formulaire.
2. **Rétablir et vérifier l’API.** Les quatre lectures tRPC de contrôle doivent revenir en succès avant tout test utilisateur. Les journaux de production du déploiement retenu doivent être contrôlés au même moment.
3. **Rétablir les actifs `/manus-storage/`.** Vérifier systématiquement le logo, les visuels Accueil, Services, Contact, Réservation et VVIP sur desktop et mobile.
4. **Refaire la recette Turnstile sur le domaine réellement servi.** Elle doit obtenir un jeton avant d’autoriser les soumissions ; aucun formulaire réel n’est nécessaire pour confirmer l’apparition du widget et l’obtention du jeton.
5. **Recontrôler les parcours fonctionnels.** Témoignages, Questions santé, création/réinitialisation d’espace candidat, recrutement standard/VVIP, disponibilité de réservation et accès administrateur doivent alors être réévalués sans soumission réelle.
6. **Traiter les finitions.** Corriger le statut HTTP 404, les en-têtes de sécurité et la recherche, puis rapprocher les rendez-vous `confirmed/pending`.

## Actions explicitement exclues

| Action non effectuée | Motif |
| --- | --- |
| Envoi de formulaire, candidature, message de contact ou Question santé | Préserver les utilisateurs et ne créer aucune donnée métier |
| Paiement ou réservation effective | Éviter toute transaction, facture ou rendez-vous involontaire |
| Téléversement/téléchargement de CV ou document | Préserver les données personnelles et les objets de stockage |
| E-mail, SMS, invitation candidat ou réinitialisation réelle | Ne pas déclencher de communication ni modifier d’accès |
| Action admin, publication, suppression ou modification RGPD | Maintenir l’audit strictement en lecture seule |

## Références

[1]: https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/ "Cloudflare — Codes d’erreur Turnstile"
[2]: https://drahmedbenlallahom.com/ "Domaine public contrôlé"
[3]: https://drahmedbenlallahom.com/api/trpc/system.health "Endpoint tRPC de santé contrôlé"
[4]: https://drbenlallah-esc8d3hd.manus.space/api/trpc/auth.me "Endpoint Manus direct contrôlé"

> **État à la clôture :** audit terminé, aucun correctif appliqué. La priorité est de résoudre le déploiement/routage unique avant de traiter les anomalies secondaires.

## Complément de diagnostic de remédiation — 25 août 2026

Le projet Vercel qui sert `drahmedbenlallahom.com` a pu être identifié après connexion du propriétaire. Il est **déconnecté de Git** (« Connect Git Repository »), sa production a été créée il y a deux jours par `vercel deploy`, et l’observabilité remonte un taux d’erreur de fonction de **100 %**. Cette configuration explique que les checkpoints du dépôt ne soient pas automatiquement publiés sur Vercel et confirme que le runtime actuellement servi n’est pas synchronisé avec la branche `main` du dépôt.

Les journaux de runtime Vercel identifient la cause exacte des HTTP 500 : `api/index.js` tente d’importer `/var/task/server/_core/index`, fichier absent du bundle serverless. La fonction s’arrête donc avant l’initialisation d’Express et tRPC. La remédiation doit fournir un point d’entrée Vercel autonome, incluant le runtime serveur nécessaire, et relier le projet au dépôt pour éviter un nouveau décalage de version.

La source du déploiement confirme un ancien adaptateur `api/index.ts` minimal qui appelle `createApp()` depuis `../server/_core/index`. Il n’est plus présent dans le dépôt actuel, mais demeure dans l’archive Vercel. Le correctif sera conçu en conformité avec la documentation Vercel : une application Express doit être exportée par l’entrée de fonction et les fichiers de runtime doivent être inclus dans le bundle par analyse statique ou configuration explicite.

Le projet Vercel ne contient **aucune variable d’environnement**. Même après correction de son import, il ne disposerait donc ni de l’accès base de données, ni des clés de sécurité, ni des paramètres Turnstile, Stripe, Resend, stockage, OAuth et services de plateforme requis par l’application. Le rétablissement complet sur Vercel exige une migration contrôlée des variables et des intégrations ; la voie la plus sûre reste la remise en service de l’hébergement full-stack Manus, puis la bascule du domaine vers cette unique origine.

Une relecture des composants et de leurs tests corrige un point du rapport initial : le logo placé dans le bouton de retour Accueil et l’illustration de fond Services sont explicitement **décoratifs** (`alt=""`, et l’illustration est `aria-hidden`). Le bouton porte déjà un nom accessible. Ces deux absences de texte alternatif ne sont donc pas des défauts d’accessibilité et ne requièrent aucun changement de contenu.

## Nouvelle campagne d’audit Codex/Vercel — 29 août 2026

Le propriétaire indique que Codex et Vercel gèrent désormais le site. Le domaine `drahmedbenlallahom.com` répond actuellement depuis Vercel, tandis que `www` redirige vers le domaine racine. Les routes publiques contrôlées renvoient HTTP 200, y compris une route inconnue ; ce dernier point reste à confirmer visuellement et constitue potentiellement un défaut SEO si aucun écran 404 ni statut 404 n’est produit par la version active.

Les lectures tRPC publiques contrôlées (`testimonials.list`, `medicalQuestions.published` et `auth.me`) renvoient HTTP 200 avec des résultats vides ou `null`, sans erreur serveur. Cela confirme la disparition du HTTP 500 observé avant la migration. Les chemins `/manus-storage/booking-care-path-1280_c6d0ae6a.webp` et `/manus-storage/logo-abl_2afbc5e0.png` renvoient toutefois encore `index.html` avec `Content-Type: text/html`, et non une image : le défaut d’actifs est donc confirmé sur le domaine public actuel.

La version locale du dépôt contient désormais une migration d’authentification Clerk/Codex (`@clerk/express`, `@clerk/react`) et un point d’entrée Vercel (`server/vercelEntry.ts`). Après installation des dépendances déclarées, TypeScript ne signale plus d’erreur, mais le serveur local affiche l’absence de clé Clerk publique. Ce point est à distinguer d’une panne publique : la production Vercel répond, mais la configuration locale ne permet pas une recette authentifiée complète sans variable d’environnement.

Aucune soumission, création de compte, upload, paiement, email, modification DNS, action administrateur ou mutation de donnée n’a été exécutée pendant cette campagne.

### Contrôle visuel public — 29 août 2026

La page d’accueil Codex/Vercel affiche brièvement un écran « Loading your space », puis se stabilise correctement. Le rendu desktop est sombre, lisible et cohérent avec le système visuel ABL/Hippocampus ; la navigation, le bouton de contact, le bouton WhatsApp, le consentement cookies et les sections principales sont visibles. Le contenu initial est majoritairement en anglais alors que le titre SEO reste en français (« Dr. Ahmed Ben Lallahom | Anesthésie et Santé ») : ce mélange de langue doit être qualifié comme choix éditorial ou incohérence lors du contrôle multilingue.

La page publique utilise désormais des actifs `/assets/*.svg` (logo, illustrations) dans le bundle Vercel, contrairement aux chemins historiques `/manus-storage/`. Le test visuel n’a pas déclenché de formulaire ni d’action métier. Une vérification mobile et une inspection DOM des images restent nécessaires.

La page `/recruitment` est accessible sur Vercel et présente deux parcours distincts, international et VVIP/offshore, avec un positionnement « Medical & Allied Health ». Le lien vers `/recruitment/standard` navigue correctement, mais affiche d’abord l’écran de chargement ; sa stabilisation doit être surveillée avant de conclure sur le formulaire. Aucun champ n’a été rempli et aucun envoi n’a été déclenché.

Sur `/recruitment/standard`, le formulaire se stabilise et affiche les champs attendus, la liste des spécialités médicales et paramédicales, la recherche de pays, les langues professionnelles et le contrôle anti-bot. Le bouton d’envoi reste non utilisé. L’inspection DOM indique que les trois images `/assets/*.svg` sont chargées avec des dimensions naturelles non nulles et que le widget Turnstile n’est pas détecté dans ce navigateur de contrôle (`turnstile: false`). Ce dernier résultat est une limite de recette navigateur, pas encore une preuve de panne côté domaine ; il doit être recoupé avec les logs et une session utilisateur autorisée.

Le contrôle navigateur de `/recruitment/vvip-offshore` n’a pas fourni de rendu exploitable : après navigation, seuls les éléments flottants apparaissaient et la vue suivante a rencontré une indisponibilité du navigateur. Ce résultat ne suffit pas à qualifier la page comme défaillante ; une vérification HTTP et une nouvelle recette visuelle seront nécessaires.

Le contrôle HTTP de `/recruitment/vvip-offshore`, `/questions-anesthesie`, `/candidate/access`, `/booking` et `/search` renvoie HTTP 200 avec le shell applicatif. Le bundle public Vercel (`index-BSUGfnKW.js`, environ 433 Ko) contient les références à l’API tRPC, aux routes Questions santé et portail candidat, ainsi qu’au parcours VVIP. Il ne contient pas de référence littérale à `turnstile`, `medicalQuestions.published` ni `manus-storage`, ce qui suggère une implémentation ou un nommage différent de la version Manus historique ; cela doit être rapproché du dépôt Codex avant toute conclusion.

L’historique Git montre un commit `1e9e49f` intitulé « Fix Vercel runtime dependency bundling (#3) ». Il a modifié le script de build Vercel pour bundler l’entrée serverless avec esbuild, ajouté Clerk et Vercel Blob aux dépendances et ajusté des tests visuels. Le dépôt actuel contient donc déjà une tentative de migration vers une architecture Vercel/Codex ; cette campagne n’en modifie aucune partie. La synchronisation locale des dépendances a seulement rétabli les paquets déclarés pour permettre l’analyse ; aucun fichier applicatif n’a été changé.

### Contrôle agrégé des données — 29 août 2026

La base active contient notamment 18 candidatures `new`, 22 jobs CV `completed` et 4 `failed`, 4 documents candidats traités (`reviewed`) et 1 `needs_review`, ainsi que 4 jobs documentaires `completed`. Les Questions santé comptent 1 entrée `submitted` et 2 `answered`. Les rendez-vous agrégés comprennent 5 `pending/confirmed`, 1 `completed/confirmed` et 1 `pending/cancelled` ; la combinaison `pending/confirmed` doit être vérifiée métier avant toute conclusion sur la cohérence paiement–confirmation, sans modifier les lignes.

Les événements email comprennent 47 `email.sent`, 44 `email.delivered`, 10 `email.delivery_delayed`, 3 `email.bounced` et 1 `email.suppressed`. Les 4 jobs CV en échec et les événements de rebond/suppression sont des anomalies opérationnelles à examiner dans le dashboard, sans ouvrir le contenu ni relancer les traitements pendant l’audit. La table attendue `google_drive_exports` n’existe pas dans ce schéma ; seule `google_drive_connections` et les tables de campagne/email ont été trouvées, ce qui révèle un écart de nommage ou de modèle à documenter.

La table `google_drive_connections` contient une connexion, sans erreur enregistrée ; la dernière utilisation agrégée remonte au 22 août 2026. La structure conserve le refresh token chiffré, ses paramètres cryptographiques, les scopes et les dates d’utilisation. L’intégration paraît configurée au niveau base, mais la version Codex/Vercel devra être testée séparément en lecture seule ; aucun export ni rafraîchissement de jeton n’a été déclenché.

### Validation locale Codex — 29 août 2026

`pnpm check` passe sans erreur après installation des dépendances déclarées. La suite Vitest ne passe pas intégralement dans l’environnement local : 176 fichiers réussissent, 1 fichier échoue, 347 tests réussissent, 14 échouent et 2 sont ignorés. Les 14 échecs proviennent de `server/testimonials.test.ts`, où `getDb()` retourne `null` avant les lectures de la table `testimonials`. Il s’agit d’un défaut de prérequis/configuration de recette locale ou de disponibilité DB, pas d’une modification appliquée pendant cet audit. Les tests existants ne sont pas modifiés.

La base contrôlée contient 43 témoignages `approved`, alors que la lecture publique Vercel de `testimonials.list` renvoie actuellement une liste vide. Elle contient également 2 Questions santé `answered` et 1 `submitted`, tandis que `medicalQuestions.published` renvoie une liste vide. Cet écart est un **point critique à investiguer** : il peut provenir d’une base Vercel différente, d’un filtre de publication différent ou d’une migration de données incomplète. Aucun contenu n’a été modifié et aucun témoignage/question n’a été publié ou supprimé.

Les procédures administratives `adminSecurity.status` et `adminSecurity.events` renvoient HTTP 401 sans session, avec `x-clerk-auth-status: signed-out` et le message sûr « Please login (10001) ». La CSP, `X-Content-Type-Options`, `Permissions-Policy` et les autres en-têtes de défense sont présents sur ces réponses. Le contrôle confirme qu’aucune donnée administrative n’est exposée publiquement par ces endpoints.

### Contrôle responsive local — 29 août 2026

Les captures mobiles du dépôt local sur `/`, `/recruitment`, `/recruitment/standard`, `/questions-anesthesie` et `/candidate/access` affichent une erreur Clerk « Publishable key is missing » au lieu du rendu. Le contrôle responsive local est donc **non concluant** tant que la variable publique Clerk attendue n’est pas injectée dans le prévisualisateur. Cette anomalie concerne l’environnement de développement/reprise locale ; elle ne prouve pas une panne de la version Vercel, dont l’accueil public s’est rendu correctement.

### SEO du HTML initial — 29 août 2026

Une lecture brute des réponses HTML Vercel sur `/`, `/recruitment`, `/recruitment/standard`, `/questions-anesthesie`, `/legal` et `/gdpr` ne trouve aucune balise `<title>` ni métadonnée `description`, `canonical`, `og:title` ou `robots`. Le titre apparaît ensuite après exécution JavaScript dans le navigateur. Il s’agit d’un **défaut SEO/accessibilité potentiellement important** pour les robots, aperçus sociaux et navigateurs sans JavaScript ; il reste à distinguer d’une éventuelle stratégie SSR non observée dans cette version.

Le contrôle de la version Vercel active renvoie HTTP 200 pour `/route-inconnue-audit-20260829` au lieu d’un statut 404. La route affiche le shell SPA ; aucun statut 404 n’est donc exposé aux robots ou aux outils de supervision. Ce défaut est confirmé indépendamment de l’ancien déploiement et doit être priorisé avec la stratégie SEO du HTML initial.

### Build et dépendances — 29 août 2026

Le build de production passe : les bundles client et serveur sont générés, dont `api/index.js` à environ 9,5 Mo. `pnpm audit --prod --audit-level=high` ne signale aucune vulnérabilité connue. Le script affiche toutefois un avertissement : les champs `pnpm.overrides` et `pnpm.patchedDependencies` placés dans `package.json` ne sont plus lus par la version de pnpm utilisée ; ces règles doivent être déplacées vers la configuration pnpm attendue, mais aucune correction n’est appliquée pendant cet audit. Le poids élevé de la fonction Vercel est un risque de déploiement à surveiller, pas une panne confirmée.

Le contrôle direct des actifs confirme que `/assets/abl-logo.svg`, `/assets/medical-hero.svg` et `/assets/profile-placeholder.svg` répondent HTTP 200 avec un type MIME image et `nosniff`. Les anciens chemins `/manus-storage/logo-abl_2afbc5e0.png` et `/manus-storage/booking-care-path-1280_c6d0ae6a.webp` répondent encore HTTP 200 mais avec `Content-Type: text/html` et la taille du shell : ils sont fonctionnellement cassés si une page ou un ancien lien les référence. Les en-têtes actuels du domaine comprennent CSP, HSTS, `Permissions-Policy`, `Referrer-Policy` et `X-Content-Type-Options`.

### Fichiers SEO et actifs racine — 29 août 2026

`/robots.txt` et `/sitemap.xml` répondent correctement HTTP 200 et le robots.txt interdit les zones sensibles (`/admin`, `/candidate/`, `/api/`, etc.). En revanche, `/manifest.json` et `/favicon.ico` renvoient HTTP 200 avec `Content-Type: text/html` et le shell applicatif au lieu de leurs types attendus. Ces deux ressources sont donc confirmées comme incorrectement routées sur Vercel, ce qui peut dégrader l’installation PWA, l’icône d’onglet et certains contrôles SEO.

## Synthèse exécutive — version Codex/Vercel

| Priorité | Constat confirmé | Impact | Action recommandée, sans exécution pendant cet audit |
|---|---|---|---|
| P0 | La réponse HTML initiale des routes publiques ne contient pas de `title`, description, canonical ou Open Graph ; ces éléments apparaissent seulement après JavaScript. | Indexation, partage social et accessibilité dégradés pour les robots ou clients sans JavaScript. | Mettre en place un rendu ou une injection SEO côté serveur/edge, puis contrôler chaque route. |
| P0 | Une route inconnue renvoie HTTP 200 au lieu de HTTP 404. | Mauvais signal SEO et supervision ; les erreurs sont servies comme une page valide. | Ajouter une vraie réponse 404 et conserver l’écran graphique côté client. |
| P1 | `/manifest.json` et `/favicon.ico` renvoient le shell HTML au lieu de leurs types attendus. | Icône, manifest et éventuelle installation PWA incorrects. | Servir explicitement les fichiers statiques avec leurs MIME types. |
| P1 | Les anciens chemins `/manus-storage/*.png` et `.webp` renvoient le shell HTML. | Toute page ou ancien lien utilisant ces chemins affiche un actif cassé. | Cartographier les références historiques et migrer ou rediriger chaque actif. |
| P1 | La base contrôlée contient 43 témoignages approuvés et 2 Questions santé répondues, alors que les lectures publiques Vercel renvoient des listes vides. | Risque de perte de visibilité des contenus et de divergence de base ou de filtre de publication. | Comparer les variables DB et les filtres de publication Vercel, sans resynchronisation destructive. |
| P1 | Le dépôt local n’a pas de clé publique Clerk dans le prévisualisateur ; cinq captures mobiles montrent l’erreur Clerk au lieu du site. | Recette locale responsive et authentifiée impossible dans cet environnement. | Injecter la configuration de recette via le gestionnaire de secrets, puis refaire les tests. |
| P2 | Les tests locaux comptent 14 échecs dans `server/testimonials.test.ts` car `getDb()` vaut `null`; 176 fichiers réussissent, 347 tests réussissent et 2 sont ignorés. | La validation complète du dépôt n’est pas reproductible localement sans DB configurée. | Corriger le prérequis de test ou isoler explicitement les tests nécessitant une DB, sans données factices. |
| P2 | La connexion Google Drive est présente en base sans erreur enregistrée, mais la table historique `google_drive_exports` n’existe pas. | Suivi des exports possiblement différent entre le modèle attendu et la base active. | Cartographier le nom réel des jobs/export et vérifier le dashboard sans toucher aux fichiers. |
| P2 | Les événements email agrégés incluent 3 rebonds, 1 suppression et 10 retards de livraison. | Risque de délivrabilité pour certaines communications. | Examiner les événements dans l’outil d’email et la réputation du domaine, sans renvoi automatique. |
| P2 | Cinq rendez-vous sont `pending/confirmed` dans l’agrégat paiement/statut. | Possible incohérence paiement–confirmation à qualifier. | Réconcilier avec les événements Stripe en lecture seule avant toute action. |

### Contrôles réussis

Le domaine public répond sur les routes principales et les lectures publiques tRPC contrôlées ne renvoient plus HTTP 500. Les procédures administratives testées sans session renvoient HTTP 401 et n’exposent pas de données. Les en-têtes CSP, HSTS, `X-Content-Type-Options`, `Referrer-Policy` et `Permissions-Policy` sont présents. Les actifs `/assets/*.svg` utilisés par la version actuelle répondent avec un type MIME image correct. Le build de production réussit et l’audit de dépendances de production ne trouve aucune vulnérabilité connue.

### Limites et exclusions

Les formulaires de candidature, Questions santé, contact, réservation, paiement, activation, réinitialisation, upload CV, export Drive, envoi email/SMS et actions administrateur n’ont pas été soumis ou déclenchés. Aucun CV, document, témoignage, question ou rendez-vous n’a été créé, supprimé ou modifié. La recette responsive locale est non concluante tant que la clé publique Clerk n’est pas disponible ; la recette d’un compte utilisateur réel et la vérification des variables Vercel restent à faire par le propriétaire ou dans un environnement autorisé.

### Ordre de décision recommandé

La première décision est de confirmer que Vercel/Codex est bien la source de production définitive. Ensuite, il faut corriger le routage des fichiers statiques et du 404, restaurer les métadonnées SEO dans le HTML initial, puis vérifier que Vercel utilise la même base et les mêmes filtres de publication que l’environnement administré. Après seulement, les parcours Turnstile, candidature, Questions santé, portail candidat et paiement devront être testés avec les autorisations appropriées.

### Recontrôle public le 29 août 2026

Le domaine racine `drahmedbenlallahom.com` répond HTTP 200 et `www` redirige correctement vers le domaine racine. `auth.me` répond HTTP 200 avec une session absente (`null`). Les procédures `testimonials.list` et `medicalQuestions.published`, appelées avec l’entrée attendue `{}`, répondent désormais HTTP 200 mais renvoient chacune une liste vide. La précédente réponse HTTP 500 n’est donc plus observée sur le domaine public ; le point restant est la divergence de contenu avec les agrégats de base relevés pendant l’audit. L’origine directe Manus répond actuellement HTTP 500 sur la racine et ne doit pas être utilisée comme origine publique sans diagnostic séparé.
