# Régression visuelle des routes publiques

Le contrôle `pnpm test:visual` compare 40 captures de premier viewport à leurs étalons validés. Chaque scénario fixe le thème sombre, le fuseau Europe/Paris, le mouvement réduit et le consentement aux seuls cookies essentiels. Le français est utilisé par défaut ; quatre scénarios ciblent volontairement l’allemand et le chinois afin de surveiller les libellés à risque de débordement.

| Groupe de routes | Bureau | Mobile | Exemples couverts |
|---|---:|---:|---|
| Consultation et droits | 1280 × 720 | 375 × 812 | Réservation, confirmation, RGPD, Mentions légales. |
| Recrutement | 1280 × 720 | 375 × 812 | Hub, parcours standard, VVIP/offshore, désinscription. |
| Informations publiques | 1280 × 720 | 375 × 812 | Accueil, Employeurs, Pourquoi Hippocampus, venture, FAQ et recherche. |
| Ressources institutionnelles | 1280 × 720 | 375 × 812 | Recherche, filtres, liens OMS/HAS/ECDC et message d’orientation non urgent. |
| Résilience | 1280 × 720 | 375 × 812 | Témoignages, 404 et page d’erreur de service. |
| Longueurs multilingues | 1280 × 720 | 375 × 812 | Réservation DE/ZH, candidature standard DE et brief employeur ZH. |

Les PNG de référence restent hors du dépôt, dans le stockage statique privé du projet. Pour une évolution visuelle légitime, enregistrer d’abord les candidats avec `pnpm test:visual:record`, les examiner sur les deux formats, les publier avec le stockage du projet, puis mettre à jour les URL du script. Un étalon ne doit jamais être remplacé simplement pour masquer une différence non comprise.
