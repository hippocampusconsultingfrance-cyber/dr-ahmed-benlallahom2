# Constats visuels vérifiables — Audit public

Les constatations ci-dessous proviennent des captures du serveur de prévisualisation réalisées le 18 août 2026 sur les parcours publics.

| Priorité | Parcours | Constat vérifié | Impact | Correction proposée |
|---|---|---|---|---|
| P0 | `/why-hippocampus` | La route affiche la page 404 au lieu de la présentation employeurs. | Perte directe d’un parcours de conversion B2B. | Restaurer et enregistrer la route avec son composant, puis ajouter un test de route. |
| P1 | `/recruitment` | La carte VVIP mentionne encore « résidences de prestige ». | Incohérence avec la demande de suppression de ce positionnement. | Remplacer par une formulation neutre portant sur environnements critiques, industriels et offshore. |
| P1 | `/recruitment/standard` | Les langues professionnelles affichées restent sous forme de texte et non de cases à cocher sur la version examinée. | Écart avec le besoin de sélection structurée des langues. | Vérifier le composant réellement routé, le redéployer puis couvrir le contrôle par test. |
| P1 | `/booking` | Le contrôle date/heure affiche le format système `mm/dd/yyyy` alors que le site est en français. | Risque de confusion et d’erreur de réservation. | Remplacer par un sélecteur localisé FR ou un libellé de format explicite. |
| P2 | `/candidate/access` | Le parcours de connexion est lisible et le message sur l’accès privé est clair. | Aucun défaut bloquant visible. | Compléter le test après inscription : activation email, Turnstile et coffre. |

> Cette note couvre seulement les constats directement visibles. Les tests métier, sécurité, APIs, tâches planifiées et emails sont vérifiés séparément dans l’audit global.

## Vérifications techniques complémentaires

| Priorité | Domaine | Constat vérifié | Preuve | Recommandation |
|---|---|---|---|---|
| P0 | Parcours Employeurs | La route `/why-hippocampus` est absente de `App.tsx`, malgré l’existence de la page annoncée. | Le routeur passe de `/employers` directement à `/admin`; la capture rend 404. | Réenregistrer la route et ajouter un contrôle automatisé de toutes les routes publiques. |
| P1 | En-têtes HTTP | La production sert HSTS et `X-Content-Type-Options`, mais pas de CSP, `frame-ancestors`, `Referrer-Policy` ni `Permissions-Policy` visibles. | Réponse `HEAD` du domaine public. | Ajouter des en-têtes de défense en profondeur, après inventaire des origines nécessaires à Stripe, Resend, Turnstile et aux assets. |
| P1 | Sitemap | Le sitemap ne référence ni les pages de recrutement détaillées, ni Employeurs, ni la méthode Hippocampus. | Contrôle direct de `/sitemap.xml`. | Ajouter les pages publiques indexables au sitemap, après correction de la route de méthode. |
| P1 | SEO des sous-pages | Les métadonnées sont principalement pilotées côté React; les réponses HTML initiales des sous-pages restent celles de l’accueil dans un rendu SPA. | Le HTML servi contient les balises de la page d’accueil; `SEOHead` opère côté navigateur. | Pré-rendre les balises stratégiques côté serveur ou générer des entrées HTML par route pour les crawlers sociaux. |
| P1 | Données opérationnelles | Quatre jobs CV historiques sont en échec avec `Cannot read properties of undefined (reading '0')`; aucun job CV ou document n’est actuellement actif ou bloqué. | Agrégats de la file de jobs en base. | Conserver les gardes déjà ajoutées, afficher une action de reprise et documenter les anciens échecs. |
| P1 | Couverture des tests | La suite compte 105 tests réussis et 1 ignoré, mais aucun test intégré dédié au parcours d’activation candidat ni au dépôt chiffré/Turnstile complet. | Inventaire des fichiers `*.test.ts`. | Ajouter un test de parcours candidat avec mocks Turnstile et stockage, ainsi que des tests de régression de routes. |
| P2 | Performance | Les pages publiques se servent correctement mais les premiers temps de réponse sont de l’ordre de 2 à 6 secondes; `/recruitment/standard` a dépassé 12 secondes pendant la sonde. | Mesure HTTP depuis le domaine public. | Mesurer depuis plusieurs régions, optimiser les bundles et vérifier l’effet de démarrage à froid avant de fixer un objectif de performance. |
| Conforme | Contrôles d’accès | Les endpoints de dépôt candidat et téléchargement administratif refusent l’accès sans session; le webhook Stripe sans signature retourne 400. | Sondes HTTP non authentifiées. | Maintenir ces tests de sécurité en CI. |
| Conforme | Automatisation | Les files CV et documents ne présentent aucun job actuellement en attente, exécution ou reprise. | Requête d’état opérationnel. | Poursuivre la surveillance quotidienne et la revue des jobs en échec historiques. |
