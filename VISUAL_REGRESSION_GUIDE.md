# Régression visuelle des routes publiques

> Depuis CODE-22, `pnpm test:visual` lance les contrôles des pages publiques dans un vrai navigateur (`client/src/publicPages.browser.test.ts` : mise en page, focus, contrastes mesurés et axe-core), qui ne dépendent d’aucun stockage extérieur et tournent en CI. La comparaison de captures décrite ici reste un outil manuel : `node scripts/visual-regression.mjs`, et `VISUAL_BASELINE_MODE=record node scripts/visual-regression.mjs` pour enregistrer les candidats.

Le contrôle `node scripts/visual-regression.mjs` compare 42 captures de premier viewport à leurs étalons validés. Chaque scénario fixe le thème sombre, le fuseau Europe/Paris, le mouvement réduit et le consentement aux seuls cookies essentiels. Le français est utilisé par défaut ; quatre scénarios ciblent volontairement l’allemand et le chinois afin de surveiller les libellés à risque de débordement.

| Groupe de routes             |     Bureau |    Mobile | Exemples couverts                                                           |
| ---------------------------- | ---------: | --------: | --------------------------------------------------------------------------- |
| Consultation et droits       | 1280 × 720 | 375 × 812 | Réservation, confirmation, RGPD, Mentions légales.                          |
| Recrutement                  | 1280 × 720 | 375 × 812 | Hub, parcours standard, VVIP/offshore, désinscription.                      |
| Informations publiques       | 1280 × 720 | 375 × 812 | Accueil, Employeurs, Pourquoi Hippocampus, venture, FAQ et recherche.       |
| Ressources institutionnelles | 1280 × 720 | 375 × 812 | Recherche, filtres, liens OMS/HAS/ECDC et message d’orientation non urgent. |
| Presse institutionnelle      | 1280 × 720 | 375 × 812 | Contenu vérifiable, absence de publication tierce et contact éditorial.     |
| Résilience                   | 1280 × 720 | 375 × 812 | Témoignages, 404 et page d’erreur de service.                               |
| Longueurs multilingues       | 1280 × 720 | 375 × 812 | Réservation DE/ZH, candidature standard DE et brief employeur ZH.           |

Les PNG de référence restent hors du dépôt, dans le stockage statique privé du projet (celui de l’ancien hébergeur Manus). Le serveur n’expose plus ce stockage : le script demande lui-même à Forge une URL signée pour chaque étalon, donc `node scripts/visual-regression.mjs` exige `BUILT_IN_FORGE_API_URL` et `BUILT_IN_FORGE_API_KEY` dans le `.env` local. Pour une évolution visuelle légitime, enregistrer d’abord les candidats avec `VISUAL_BASELINE_MODE=record node scripts/visual-regression.mjs`, les examiner sur les deux formats, les publier avec le stockage du projet, puis mettre à jour les clés du script (`baselineKeys`). Un étalon ne doit jamais être remplacé simplement pour masquer une différence non comprise.
