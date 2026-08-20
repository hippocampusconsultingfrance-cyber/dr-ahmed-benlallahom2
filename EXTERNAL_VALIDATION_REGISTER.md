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

## Règle de clôture

Une absence d’erreur dans les tests unitaires, TypeScript ou les captures automatisées ne remplace jamais la preuve externe demandée ci-dessus. En cas de doute, le contrôle reste « À réaliser ».
