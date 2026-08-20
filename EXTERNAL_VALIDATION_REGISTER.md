# Registre des validations externes

Ce registre distingue les contrôles réalisables automatiquement de ceux qui exigent un appareil réel, un client tiers, une boîte de réception autorisée ou une session d’administration. Il évite qu’un test local soit présenté comme une validation d’usage réelle.

> Une ligne documentée dans `todo.md` signifie que son protocole existe. Elle ne peut être considérée comme validée opérationnellement qu’après ajout de la date, de la version, du responsable et de la preuve dans ce registre.

| Contrôle | Prérequis | Preuve minimale à archiver | Statut |
|---|---|---|---|
| Dashboard mobile/tablette | Compte administrateur, MFA, appareil réel 375 px et tablette. | Captures des onglets, liste d’éventuels débordements et version contrôlée. | À réaliser. |
| Navigation clavier et lecteur d’écran | NVDA, VoiceOver ou TalkBack sur navigateur compatible. | Parcours, technologie utilisée, écarts et corrections. | À réaliser. |
| Zoom et contraste en usage réel | Navigateur bureau à 200 %, thème clair et sombre. | Captures des pages modifiées et résultat du contrôle de contraste. | À réaliser. |
| E-mails transactionnels | Boîtes de test Gmail, Outlook et Apple Mail. | Source du message, rendus, clients et écarts constatés. | À réaliser. |
| Rappels de rendez-vous | Rendez-vous de test explicitement autorisé. | Horodatage de planification, réception et appareil destinataire. | À réaliser. |
| Compatibilité navigateur | Chrome, Firefox et Safari compatibles. | Versions, routes contrôlées et anomalies éventuelles. | À réaliser. |
| Visuels médicaux authentiques | Actifs fournis avec autorisation écrite ou licence vérifiable, texte alternatif contextualisé. | Fichier source, licence/autorisation, date et entrée correspondante dans `VISUAL_ASSET_RIGHTS_REGISTER.md`. | À réaliser. |
| Prévisualisation de facture dans l’espace client | Décision de confidentialité, parcours d’authentification client et validation de la rétention des documents. | Décision écrite, contrôle d’accès, capture non sensible et test d’absence de lien public. | À réaliser. |
| Notifications SMS | Prestataire choisi, clés de production configurées de manière sécurisée et numéros de test autorisés. | Référence de configuration, journal de livraison et résultat de réception sur un appareil autorisé. | À réaliser. |
| Dépôt de candidature de production | Document PDF/DOCX fictif ou non sensible et autorisation explicite de soumettre le test. | Horodatage, identifiant de candidature, statut de traitement et aucune donnée sensible dans les preuves. | À réaliser. |
| Antivirus du coffre candidat | Choix d’un moteur antivirus et hébergement compatible avec un service persistant. | Décision d’architecture, test de fichier de contrôle sans malware réel et journal de quarantaine. | À réaliser — nécessite un hébergement réservé. |

## Recette de navigation clavier

Les tests automatisés couvrent le cycle du menu de langue, la fermeture avec Échap et les dialogues. La recette sur navigateur réel doit compléter ces garde-fous en vérifiant, sans souris, le lien d’évitement, l’ordre de tabulation de la navigation, l’ouverture/fermeture des menus, les préférences de consentement, les formulaires Contact/RGPD/Réservation, les messages d’erreur et le retour de focus après une fenêtre modale. Consigner le navigateur, le système, la route, la version et toute anomalie avant de marquer le contrôle comme réalisé.

## Recette de zoom à 200 %

Les garde-fous automatisés vérifient les gouttières de la grille publique, les wrappers centrés et le mode Lisibilité renforcée. Sur un navigateur réel de bureau, régler le zoom à 200 % et contrôler l’accueil, la réservation, les ressources, la presse, les mentions légales et le recrutement. Vérifier l’absence de défilement horizontal, la lisibilité des CTA, l’accès aux formulaires, les menus et le bandeau cookies. Consigner le navigateur, le système, les captures, les routes et toute correction avant de passer le statut à « Réalisé ».

## Recette lecteur d’écran

Les garde-fous de code vérifient la cible `main-content` du lien d’évitement, les messages d’alerte et les étiquettes de champs. La validation réelle doit être menée avec NVDA, VoiceOver ou TalkBack sur un navigateur compatible. Contrôler l’annonce du titre de page, le lien d’évitement, les régions de navigation, les titres, les CTA, les erreurs des formulaires Contact/RGPD/Réservation, le coffre candidat et les fenêtres modales. Archiver l’outil, la version, le navigateur, les routes, les annonces observées et les corrections avant de passer le statut à « Réalisé ».

## Règle de clôture

Une absence d’erreur dans les tests unitaires, TypeScript ou les captures automatisées ne remplace jamais la preuve externe demandée ci-dessus. En cas de doute, le contrôle reste « À réaliser ».
