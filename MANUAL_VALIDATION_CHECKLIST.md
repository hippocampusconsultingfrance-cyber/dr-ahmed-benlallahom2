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

## Correspondance avec les contrôles automatisés

| Contrôle manuel | Garanties déjà automatisées | Ce qui reste impérativement à constater sur un appareil réel |
|---|---|---|
| Clavier seul | Navigation, carrousel, dialogues et consentement cookies disposent de tests de touches et de restitution du focus. | L’ordre de tabulation entre composants réels, l’indicateur visible et l’absence de piège de focus. |
| Lecteur d’écran | Les libellés, alternatives, régions d’état et titres sont couverts par des tests de structure. | La qualité effective des annonces et les répétitions propres au lecteur d’écran et au navigateur. |
| Zoom et contraste | Les tokens de thème sont testés pour le contraste AA ; les conteneurs et grilles critiques sont contrôlés. | Le reflow à 200 %, les préférences utilisateur et la perception sur écran réel. |
| Mobile administratif | Les actions du tableau Candidatures et de la revue documentaire disposent de contraintes tactiles et de rupture de texte testées. | La précision tactile, l’usage du clavier virtuel et le comportement sur le matériel cible. |
| Paiement | Les états de réservation et de confirmation sont couverts sans transaction réelle. | Le flux Stripe, l’e-mail, la facture et l’annulation avec carte de test sur le domaine publié. |

> Ne saisissez jamais de données médicales, documents ou identifiants réels lors des tests. Les contrôles doivent être interrompus immédiatement en cas d’anomalie de confidentialité, d’accès inattendu ou de paiement non souhaité.

## Traçabilité recommandée

Pour chaque contrôle, conserver la date, le navigateur, l’appareil, la page concernée, le résultat et, en cas d’écart, une capture d’écran non sensible. Les anomalies doivent être reproduites une seconde fois avant toute conclusion.

## Compatibilité multi-navigateurs

Le contrôle automatisé disponible dans l’environnement utilise Chromium et couvre les routes publiques prioritaires, leurs formats desktop/mobile, ainsi que des scénarios allemands et chinois. Firefox et Safari ne sont pas présents dans cet environnement ; une validation réelle est requise avant de déclarer une compatibilité complète.

| Navigateur | Statut automatisé | Recette à effectuer sur le domaine publié | Priorité |
|---|---|---|---|
| Chrome / Chromium récent | Couvert par la régression visuelle automatisée et les tests fonctionnels locaux. | Rejouer au minimum réservation, RGPD, recrutement et Ressources après une évolution majeure. | Haute |
| Firefox récent | Non disponible localement. | Vérifier menu, langue, thème, formulaires, validation et absence de débordement à 200 %. | Haute |
| Safari macOS / iOS récent | Non disponible localement et nécessite un appareil Apple. | Vérifier navigation, clavier/VoiceOver, paiement de test, formulaires et comportement tactile. | Haute |

> L’absence de Firefox ou Safari local ne constitue pas une validation négative : elle impose une recette complémentaire documentée. Une anomalie spécifique à un navigateur doit être consignée avec sa version et son système d’exploitation avant correction.

## Statut de suivi

La localisation des parcours publics et administratifs a été vérifiée par compilation et tests automatisés. Les vérifications d’accessibilité et de rendu qui dépendent d’un navigateur réel, d’un système d’assistance ou d’un moyen de paiement restent volontairement consignées dans cette checklist : elles ne sont ni simulées ni déclarées exécutées par le projet. Cette tâche de développement est donc clôturée comme **documentée**, avec exécution opérationnelle à réaliser sur le domaine publié.
