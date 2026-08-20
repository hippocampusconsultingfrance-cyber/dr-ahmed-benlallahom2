# Régression visuelle automatisée

## Périmètre

Le contrôle `pnpm test:visual` compare le premier viewport des routes publiques prioritaires à des étalons approuvés. Chaque scénario est déterministe : français, thème sombre, consentement essentiel enregistré, mouvement réduit, fuseau Europe/Paris et facteur d’échelle égal à un.

| Route | Bureau | Mobile | Objectif |
|---|---:|---:|---|
| `/` | 1280 × 720 | 375 × 812 | Hiérarchie de l’accueil, navigation et CTA. |
| `/booking` | 1280 × 720 | 375 × 812 | Parcours de réservation avant paiement. |
| `/recruitment` | 1280 × 720 | 375 × 812 | Accès aux parcours de recrutement. |
| `/employers` | 1280 × 720 | 375 × 812 | Formulaire et repères de la page Employeurs. |
| `/resources` | 1280 × 720 | 375 × 812 | Recherche, filtres et cartes institutionnelles. |
| `/press` | 1280 × 720 | 375 × 812 | Dossier institutionnel, transparence des publications et accès contact. |
| `/gdpr` | 1280 × 720 | 375 × 812 | Parcours de droits, consentement et mise en page du formulaire. |
| `/booking/confirmation?status=success` | 1280 × 720 | 375 × 812 | Confirmation non indexée, référence de suivi de démonstration et statut sécurisé de livraison de facture. |

En complément, la matrice comprend quatre contrôles de texte long : Réservation en allemand et chinois sur bureau, ainsi que Ressources en allemand et chinois sur mobile. Ils ciblent les libellés les plus susceptibles de s’étendre, tout en conservant les tests Unicode unitaires des contrôles compacts.

Les étalons PNG sont stockés hors du dépôt dans le stockage statique du projet. Ils ne sont donc ni livrés au navigateur comme des assets de production, ni dupliqués dans l’arborescence applicative.

## Exécution et mise à jour

Exécuter `pnpm test:visual` après le serveur local et avant une publication qui modifie une route couverte. Le contrôle échoue si l’étalon devient inaccessible, si la taille de capture change ou si la différence de pixels dépasse 0,8 %.

L’enregistrement `pnpm test:visual:record` ne crée que des candidats étalons dans `/home/ubuntu/webdev-static-assets/visual-regression`. Après une revue humaine desktop/mobile, ces fichiers doivent être publiés dans le stockage statique puis leurs URL mises à jour dans `scripts/visual-regression.mjs`. Il ne faut jamais remplacer un étalon pour faire taire une différence non comprise.

## Limites assumées

Ce contrôle ne simule ni paiement, ni e-mail, ni session administrateur, ni donnée candidat. Il complète les tests fonctionnels et les captures de page entière ; la checklist préproduction reste obligatoire pour les contrôles de contenus longs, technologies d’assistance et états nécessitant une session autorisée.
