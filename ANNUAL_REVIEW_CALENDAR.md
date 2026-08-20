# Calendrier de revue graphique 2026–2027

La revue graphique trimestrielle complète les contrôles automatiques et ne remplace pas les validations sur appareils réels ni les preuves de droits de tiers. Toute modification d’une illustration, d’une charte, d’une page critique ou d’un parcours de paiement déclenche également une revue anticipée avant publication.

| Période | Revue à conduire | Preuves à conserver | Responsable |
|---|---|---|---|
| T1 — janvier | Contrôler l’accueil, la réservation, le recrutement et les pages légales en bureau/mobile ; vérifier la cohérence de marque. | Résultat `pnpm test:visual`, captures validées et éventuels écarts consignés. | Responsable éditorial et technique. |
| T2 — avril | Revoir les nouvelles pages, les formats mobiles, les variantes DE/ZH et les alternatives textuelles. | Journal d’audit visuel, état des traductions et liste des corrections. | Responsable éditorial et technique. |
| T3 — juillet | Vérifier les actifs récemment ajoutés, leurs droits, leur poids et les états de chargement. | `VISUAL_ASSET_RIGHTS_REGISTER.md`, analyse des assets et résultat de test. | Responsable éditorial. |
| T4 — octobre | Réaliser la revue annuelle préparatoire : charte, contraste, régression visuelle, parcours sensibles et retrait des actifs obsolètes. | Bilan annuel, registre des risques et décisions de correction. | Responsable éditorial et technique. |

## Portée annuelle à vérifier

| Domaine | Contrôles annuels préparés |
|---|---|
| Contenus et identité | Traductions, identité visuelle, marque Hippocampus, contenu médical, sources, ressources et réseaux sociaux. |
| Accessibilité et UX | Lecteur d’écran, clavier, zoom, contraste, dette UX, navigation et retours utilisateurs consentis. |
| Conformité | Droits sur visuels et logos, pages légales/RGPD, modèles d’e-mails et factures. |
| Parcours et opérations | Réservation, tarifs et politiques, dashboard, outils administrateur, pages 404/maintenance/erreur. |
| Technique et visibilité | Domaines, certificats, favicons, données structurées, métadonnées sociales, sitemap, liens internes, composants UI et dépendances. |
| Sobriété | Poids des images, animations et ressources de contenu téléchargeables. |

> Un écart P0/P1 — contenu illisible, élément interactif masqué, divulgation de donnée, visuel sans droit vérifiable ou dégradation majeure d’un parcours — bloque la publication jusqu’à correction ou dérogation écrite et datée.
