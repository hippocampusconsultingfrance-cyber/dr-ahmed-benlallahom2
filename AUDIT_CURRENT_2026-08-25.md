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
| **P3** | Textes alternatifs incomplets | Deux images de l’accueil n’ont pas d’alternative textuelle : logo d’en-tête et illustration Services | Inspection DOM des six images rendues | Ajouter des alternatives pertinentes ou déclarer explicitement les images décoratives |
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
6. **Traiter les finitions.** Corriger le statut HTTP 404, les en-têtes de sécurité, la recherche et les deux alternatives textuelles, puis rapprocher les rendez-vous `confirmed/pending`.

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
