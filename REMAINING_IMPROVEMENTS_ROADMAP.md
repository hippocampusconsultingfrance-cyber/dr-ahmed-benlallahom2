# Feuille de route des améliorations restantes

Les tâches ouvertes historiques regroupent à la fois des améliorations concrètes, des revues annuelles à programmer et des validations qui demandent un appareil ou une session administrateur réelle. Cette feuille de route les transforme en lots exécutables afin de poursuivre sans confondre une fonctionnalité à développer avec un contrôle périodique.

| Priorité | Lot | Périmètre | Dépendance ou limite |
|---|---|---|---|
| 1 | Robustesse opérationnelle | Revue des parcours administratifs denses, contrôles de file, gestion des erreurs et supervision de production. | Certains écrans complets exigent une session administrateur et MFA. |
| 2 | Accessibilité et interface | Vérification mobile, zoom élevé, clavier, textes longs en DE/ZH, contrastes et cohérence des contrôles partagés. | Les lecteurs d’écran et Safari/Firefox nécessitent une validation manuelle complémentaire. |
| 3 | Localisation et contenu | Élimination des derniers libellés publics codés en dur, contrôles des traductions et révision des contenus vérifiables. | Toute nouvelle publication médicale doit reposer sur une source validée. |
| 4 | Production, SEO et conformité | Contrôles de routes, ressources SEO, en-têtes, formulaires, emails et traçabilité documentaire. | Google Search Console et l’indexation dépendent d’actions et délais externes. |
| 5 | Revues périodiques | Réécriture des nombreuses tâches annuelles sous forme de calendrier de contrôle plutôt que de développements ponctuels. | Ces revues ne peuvent pas être « terminées » une fois pour toutes. |

> Le moteur antivirus dédié reste hors périmètre tant que l’hébergement actuel est conservé. Les contrôles de signature, format, taille, contenu actif et quarantaine restent en service.

## Ordre d’exécution

Les lots 1 et 2 sont traités en premier, car ils protègent les parcours de données sensibles et l’utilisation effective du site. Le lot 3 suit pour consolider les quatre langues actives. Le lot 4 est rejoué à chaque publication importante. Le lot 5 est documenté séparément afin de ne pas bloquer la clôture fonctionnelle sur des actions intrinsèquement récurrentes.

## Préconditions externes et validations manuelles

| Sujet | État actuel | Action ou prérequis restant |
|---|---|---|
| Antivirus documentaire dédié | Quarantaine et validation structurelle actives ; analyse antivirus dédiée non activée. | Nécessite l’évolution vers un environnement d’hébergement compatible avec un scanner privé et persistant. |
| SMS de réservation | Les emails transactionnels sont actifs ; aucun fournisseur SMS dédié n’est configuré. | Fournir puis configurer les identifiants du prestataire SMS retenu avant toute promesse de canal SMS. |
| Lecteur d’écran et navigateurs alternatifs | Tests de code, clavier, zoom et captures réalisés. | Rejouer la checklist avec NVDA/VoiceOver et Safari/Firefox sur appareils réels. |
| Paiement, facture et rappels | Les parcours automatisés sont testés sans transaction réelle. | Utiliser le domaine publié, un créneau de test et les données Stripe de test sans information médicale réelle. |
| Email client | Les flux et l’authentification du domaine sont vérifiés. | Contrôler visuellement le rendu dans Gmail, Outlook et Apple Mail avec une boîte de test. |
| Google Search Console | Sitemap et directives d’exploration sont publiés. | Soumettre et contrôler l’indexation depuis le compte Google du propriétaire. |
| Visuels et droits d’utilisation | Les alternatives textuelles sont contrôlées. | Conserver les preuves de licences ou d’autorisations pour chaque nouveau visuel externe avant publication. |

> Les vérifications de cette table ne sont pas des défauts de code. Elles requièrent volontairement un fournisseur externe, un appareil spécifique ou une décision d’exploitation afin de ne pas simuler un contrôle qui doit rester réel.
