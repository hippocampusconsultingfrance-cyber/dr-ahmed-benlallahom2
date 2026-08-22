# Audit final A à Z — Site Dr Ahmed Ben Lallahom / Hippocampus Consulting

**Date de l’audit :** 22 août 2026  
**Nature :** audit de production et de code, non destructif  
**Décision appliquée :** **aucune correction fonctionnelle, configuration externe ou donnée métier n’a été modifiée dans le cadre de cet audit.**

> Ce rapport distingue les anomalies actuellement confirmées, les éléments non bloquants à surveiller et les limites qui exigent une action extérieure. Il respecte la consigne de ne pas envoyer d’email, de ne soumettre aucun formulaire, de ne réaliser aucun paiement, de ne déposer aucun document et de ne pas accéder à l’administration authentifiée.

## 1. Périmètre et méthode

L’audit a combiné des contrôles automatisés, des vérifications de routes et de protections en production, une inspection du DOM des formulaires publics, une lecture ciblée du code de sécurité et de traitement documentaire, ainsi qu’une consultation agrégée et non nominative des files de traitement. Les interactions à effet de bord ont été exclues.

| Domaine contrôlé | Méthode appliquée | Résultat synthétique |
|---|---|---|
| Qualité de construction | Tests, vérification TypeScript et build de production | **Conforme** : 171 fichiers de test, 350 tests réussis, 2 ignorés ; build réussi. |
| Dépendances | Audit des seules dépendances de production | **Conforme au seuil contrôlé** : aucune vulnérabilité connue de niveau `high` ou supérieur. |
| Routes publiques | Requêtes HTTP de production et rendu navigateur | **Conforme** sur les routes prioritaires contrôlées, toutes en HTTP 200. |
| Accès non authentifié | Navigation publique vers `/admin` | **Conforme** : écran de connexion requis, aucune donnée d’administration exposée. |
| Sécurité HTTP | Inspection des en-têtes de production | **Conforme** : HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy` et `Permissions-Policy` présents. |
| Parcours publics sensibles | Inspection visuelle et DOM, sans saisie ni soumission | **Anomalie P1 confirmée** sur le contrôle Turnstile de trois formulaires publics. |
| Traitement asynchrone des CV et documents | Lecture du code, de la planification et d’agrégats de statut | **Fonctionnel à l’instant contrôlé** ; des traces d’échecs historiques sont à conserver sous surveillance. |
| Régression visuelle | Comparaison pixel-à-pixel et examen manuel VVIP desktop | **Dérive d’étalon non bloquante**, à valider avant remplacement de la référence. |

## 2. Anomalies confirmées nécessitant une décision

### P1 — Le contrôle anti-bot bloque vraisemblablement trois parcours publics

Le widget Cloudflare Turnstile ne se rend pas correctement dans trois formulaires publics contrôlés sur le domaine de production : **Questions santé**, **candidature internationale standard** et **candidature Missions VVIP & Offshore**. Dans chaque cas, le conteneur anti-bot est présent dans le DOM, mais aucune iframe provenant de `challenges.cloudflare.com` n’est créée après attente. Le bouton de soumission reste actif alors que le serveur exige un jeton Turnstile.

| Parcours | État du widget observé | Conséquence probable |
|---|---|---|
| `/questions-anesthesie` | Conteneur présent, 0 iframe Turnstile | La question est rejetée faute de jeton. |
| `/recruitment/standard` | Conteneur présent, 0 iframe Turnstile | La candidature standard est rejetée faute de jeton. |
| `/recruitment/vvip-offshore` | Conteneur présent, 0 iframe Turnstile | La candidature VVIP est rejetée faute de jeton. |
| `/candidate/access` en mode création | Iframe Turnstile bien affichée | Le problème ne constitue pas une panne générale de tout le portail candidat. |

Les journaux observés signalent le code `110200`. La documentation officielle Cloudflare l’associe à un **domaine non autorisé** et recommande d’ajouter le domaine courant dans la gestion des noms d’hôte de la clé. [1]

**Impact.** Les trois parcours atteints peuvent donner au visiteur l’impression qu’il peut envoyer le formulaire, mais l’exigence serveur de jeton empêche vraisemblablement toute finalisation. Cette anomalie affecte la collecte de candidatures et le service gratuit Questions santé ; elle est donc classée **P1**.

**Cause exacte à confirmer.** L’indice principal est la configuration des domaines autorisés ou l’association de la clé publique active ; toutefois, le fait que l’inscription au portail candidat fonctionne avec le même composant impose de comparer la clé effectivement livrée et le cycle de rendu avant toute conclusion définitive. L’audit n’a pas modifié le tableau de bord Cloudflare ni la configuration des secrets.

**Correction proposée, si vous la choisissez.** Vérifier la clé réellement utilisée par chaque build, autoriser explicitement `drahmedbenlallahom.com` et `www.drahmedbenlallahom.com` dans Cloudflare Turnstile, puis traiter le domaine Manus direct selon votre politique de test. Côté interface, il est également recommandé de désactiver la soumission tant qu’aucun jeton n’est disponible et d’afficher immédiatement une erreur exploitable. Une soumission contrôlée avec une identité de test non sensible ne serait effectuée qu’après votre autorisation expresse.

### P1 — L’effacement manuel d’une candidature ne détruit pas physiquement son objet stocké

La procédure d’administration `recruitment.erase` journalise l’action puis supprime la ligne de candidature en base. Le code documente explicitement qu’aucun endpoint de suppression d’objet n’est utilisé ; l’objet privé devient donc inaccessible depuis l’application, mais il peut rester dans le stockage privé tant que la politique de rétention du fournisseur ne l’a pas supprimé.

**Impact.** Il ne s’agit pas d’une exposition publique du CV : la référence applicative disparaît et les objets restent privés. En revanche, une demande d’effacement réellement exécutée ne possède pas encore de preuve de suppression physique de l’objet, ce qui constitue un écart significatif de gouvernance RGPD pour des documents professionnels sensibles. Cette anomalie est classée **P1** car elle concerne la capacité à honorer et prouver un effacement manuel.

**Correction proposée, compatible avec votre contrainte de conservation.** Il ne faut pas instaurer de suppression automatique des CV. La correction doit être limitée au cas où un administrateur exécute un effacement RGPD validé : suppression de l’objet privé, conservation d’une preuve d’audit minimisée, gestion d’échec sans effacer prématurément la ligne métier, puis test avec un fichier non sensible. Les rappels de fin de rétention restent inchangés.

## 3. Éléments non bloquants à surveiller

### P3 — Étalon de régression visuelle VVIP devenu obsolète ou à revalider

Le scénario `vvip-offshore-desktop` dépasse son seuil de différence visuelle : **2,16 %** contre **0,80 %** autorisé. L’examen manuel de la capture courante et de l’étalon montre principalement un décalage vertical de la zone de titre à gauche. L’en-tête, le panneau de confidentialité, les champs visibles et les commandes restent lisibles, alignés et utilisables.

> Il s’agit d’une **dérive de référence à revalider**, et non d’une rupture fonctionnelle ou d’un défaut visuel confirmé.

L’étalon ne doit pas être remplacé automatiquement. Après la correction P1 éventuelle, une validation éditoriale rapide permettra soit de conserver le rendu actuel comme référence, soit de demander un ajustement visuel précis.

### P3 — Traces de jobs CV échoués, sans candidature active actuellement bloquée

La file CV contient quatre jobs historiques marqués `failed`, avec l’erreur `Cannot read properties of undefined (reading '0')`, datée du 17 août. Toutefois, les candidatures associées sont aujourd’hui toutes en état `needs_review`, et aucune candidature n’est actuellement en état `failed`, `queued`, `extracting` ou `analyzing` dans l’agrégat contrôlé. Les exécutions périodiques récentes de traitement et d’export Drive sont actives et répondent avec succès.

**Conclusion.** Il ne s’agit pas d’un blocage de candidature actif à ce jour. Il convient néanmoins de conserver ces erreurs dans le journal, d’identifier leur origine lors d’une maintenance ultérieure et de vérifier que l’interface d’administration permet bien de relancer les analyses lorsque nécessaire. Aucune relance ni modification de données n’a été lancée durant cet audit.

### P3 — Hygiène de migration à clarifier, sans dérive de table détectée

La comparaison entre les tables déclarées dans Drizzle et les tables déployées ne révèle pas de table métier manquante. La configuration Drizzle utilise `./drizzle` comme dossier de sortie et les migrations effectives s’y trouvent. Le sous-dossier `drizzle/migrations/` contient néanmoins trois fichiers historiques qui ne correspondent pas au dossier déclaré dans la configuration.

**Impact.** Ce n’est pas un défaut fonctionnel de production, mais une ambiguïté de maintenance susceptible d’induire une mauvaise procédure lors d’une future migration. Une harmonisation documentaire ou structurelle est recommandée lors d’un lot de maintenance, sans toucher à la base en production tant qu’une migration vérifiée n’est pas préparée.

## 4. Limites et prérequis externes — non classés comme bugs du code

| Sujet | État constaté | Action nécessaire |
|---|---|---|
| Antivirus dédié | Les contrôles actuels vérifient signature, type, taille, contenu PDF/DOCX actif et checksum ; ils ne constituent pas un antivirus. | Choisir un service ou une infrastructure compatible avec l’hébergement pour une analyse antivirus avant promotion définitive. |
| Cloudflare Turnstile | L’accès de configuration Cloudflare est requis pour autoriser les noms d’hôte ou comparer les clés. | Intervention de configuration après votre accord. |
| Test de soumission réelle | Non exécuté afin de ne créer ni candidature, ni question médicale, ni email de test. | Autorisation explicite et identité de test non sensible. |
| Paiement Stripe et facture | Non exécutés afin de ne déclencher aucun paiement ni email de facture. | Test transactionnel contrôlé, uniquement avec votre accord. |
| Email, SMS et rendu client | Les envois réels et clients Gmail/Outlook/Apple Mail n’ont pas été sollicités. | Boîtes de test et destinataires autorisés. |
| Accessibilité assistive et appareils réels | Les garde-fous applicatifs et captures ont été revus ; la validation NVDA, VoiceOver, TalkBack et appareils physiques reste externe. | Recette humaine documentée sur appareils et navigateurs ciblés. |

## 5. Contrôles positifs validés

Le périmètre ci-dessous ne présente pas d’erreur active dans les tests effectués.

| Élément validé | Résultat |
|---|---|
| Build, TypeScript et tests | Build de production réussi ; 350 tests réussis, 2 ignorés. |
| Dépendances de production | `pnpm audit --prod --audit-level high` ne remonte aucune vulnérabilité connue. |
| Routes publiques essentielles | Les routes d’accueil, Questions santé, réservation, recrutement, recrutement standard, VVIP, employeurs, accès candidat, FAQ, légales et administration retournent HTTP 200. |
| Protection de l’administration | Une session non authentifiée ne révèle aucune donnée métier. |
| Logs de production actuels | Aucun crash runtime actif ; les entrées récentes reflètent des accès d’audit non authentifiés et les contrôles planifiés attendus. |
| Planification | Les sept tâches Heartbeat recensées sont activées ; la file d’analyse CV, la file de documents candidats, les rappels et le traitement de réservation ont des exécutions récentes réussies. |
| Traitement des dossiers | Les 17 candidatures actives agrégées sont à l’état `needs_review`, cohérent avec une revue humaine ; aucun état d’analyse actuellement bloqué n’a été observé. |
| Sécurité documentaire applicative | Chiffrement AES-256-GCM, contrôles de signature et de type, quarantaine, limites de taille, journalisation et files persistantes sont présents dans les parcours examinés. |
| Questions santé | Les avertissements d’urgence, les trois consentements obligatoires, la validation humaine et la séparation des informations privées/publicables sont présents. |
| Navigation et SEO de Questions santé | La route publique est à nouveau enregistrée et répond correctement ; aucun retour à l’ancien incident de route de maintenance n’a été reproduit. |

## 6. Ce qui n’a volontairement pas été testé

L’audit n’a pas créé de compte candidat, n’a pas soumis de formulaire, n’a pas importé de CV ou de document, n’a pas consulté de fiche d’administration authentifiée, n’a pas lancé de MFA, n’a pas envoyé d’email ni de campagne, n’a pas publié ou dépublié de question santé, n’a pas déclenché de paiement et n’a pas effectué de suppression de donnée. Ces exclusions protègent les données personnelles et évitent toute action irréversible ou communication extérieure non autorisée.

## 7. Décisions de correction proposées

| Choix | Contenu du lot | Priorité | Risque opérationnel | Validation prévue |
|---|---|---:|---|---|
| **1** | Réparer Turnstile sur Questions santé et les deux recrutements publics ; rendre le bouton inactif sans jeton et afficher une erreur claire. | P1 | Faible à modéré ; nécessite accès Cloudflare. | Rendu widget sur les trois pages puis test de soumission contrôlé uniquement si autorisé. |
| **2** | Ajouter la suppression physique manuelle des objets lors d’un effacement RGPD, avec preuve d’audit et stratégie d’échec sûre. | P1 | Modéré ; touche un traitement destructif manuel. | Tests automatisés et essai exclusivement avec fichier non sensible. |
| **3** | Revalider ou ajuster le rendu VVIP desktop, puis mettre à jour l’étalon visuel seulement après validation. | P3 | Faible. | Capture desktop et mobile, comparaison de référence. |
| **4** | Nettoyer/documenter la structure de migrations Drizzle afin d’éviter les erreurs de maintenance future. | P3 | Faible si documentaire ; modéré si migration ultérieure. | Vérification de génération de migration et revue de schéma sans altérer les données. |
| **5** | Étudier l’intégration d’un antivirus dédié compatible avec l’hébergement. | Pré-requis externe | Dépend de la solution et du coût retenus. | Test de fichier contrôlé, politique de quarantaine et journalisation. |

Vous pouvez répondre simplement : **« corrige 1 »**, **« corrige 1 et 2 »**, ou indiquer un autre ordre. Aucun correctif n’a été appliqué avant votre décision.

## Références

[1] [Cloudflare — Codes d’erreur client Turnstile](https://developers.cloudflare.com/turnstile/troubleshooting/client-side-errors/error-codes/)
