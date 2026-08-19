# Checklist de validation manuelle

Cette checklist complète les contrôles automatisés et visuels déjà réalisés. Elle se concentre sur les tests qui nécessitent un navigateur, un système d’exploitation ou une technologie d’assistance spécifique. Les essais doivent être effectués sur le domaine publié `https://drahmedbenlallahom.com`.

| Contrôle | Procédure concise | Résultat attendu |
|---|---|---|
| Clavier seul | Utiliser uniquement `Tab`, `Maj+Tab`, `Entrée`, les flèches et `Échap` sur l’accueil, la réservation, le formulaire RGPD, les pages recrutement et l’accès candidat. | Le focus reste visible, l’ordre est cohérent, les menus se ferment avec `Échap` et aucune action ne nécessite la souris. |
| Lecteur d’écran | Tester les mêmes parcours avec NVDA + Chrome sous Windows ou VoiceOver + Safari sous macOS/iOS. | Les titres, libellés, erreurs, régions d’état et boutons sont annoncés de manière intelligible et sans répétition. |
| Zoom natif 200 % | Régler le navigateur à 200 %, puis consulter les pages d’accueil, réservation, RGPD, recrutement, employeurs et FAQ. | Pas de défilement horizontal inutile, pas de texte tronqué, toutes les actions restent atteignables. |
| Safari et Firefox | Rejouer l’ouverture des menus, le changement de langue, la réservation jusqu’au bouton de paiement et les formulaires publics. | Le rendu, les contrôles et les retours de validation restent fonctionnels. |
| Contraste réel | Vérifier les textes secondaires, messages d’erreur, focus et boutons sur écran habituel, en thèmes sombre et clair. | Les informations essentielles restent lisibles sans dépendre de la couleur seule. |
| Paiement réel | Utiliser un créneau de test et une carte Stripe de test sur le domaine publié, sans soumettre de données médicales réelles. | Redirection Stripe, confirmation, email et facture correspondent au statut de paiement. |
| Administration | Se connecter avec le compte administrateur, passer la validation MFA et vérifier les onglets prioritaires sur mobile. | Aucune donnée n’est affichée avant MFA ; les actions et tableaux restent utilisables après validation. |

> Ne saisissez jamais de données médicales, documents ou identifiants réels lors des tests. Les contrôles doivent être interrompus immédiatement en cas d’anomalie de confidentialité, d’accès inattendu ou de paiement non souhaité.

## Traçabilité recommandée

Pour chaque contrôle, conserver la date, le navigateur, l’appareil, la page concernée, le résultat et, en cas d’écart, une capture d’écran non sensible. Les anomalies doivent être reproduites une seconde fois avant toute conclusion.
