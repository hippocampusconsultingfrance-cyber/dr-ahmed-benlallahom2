# Registre des validations externes

**Statut au 20 août 2026.** Les contrôles ci-dessous ne peuvent pas être remplacés par une capture statique, un test unitaire ou une simulation locale. Ils restent ouverts jusqu’à l’archivage de la preuve indiquée. Ce registre évite de les déclarer réalisés par erreur.

| Contrôle | Dépendance externe | Procédure sûre | Preuve attendue | Statut |
|---|---|---|---|---|
| Lecteur d’écran | NVDA, VoiceOver ou TalkBack sur appareil réel. | Rejouer navigation, formulaires, dialogue cookies et réservation sans soumettre de donnée sensible. | Navigateur, OS, lecteur d’écran, date, résultat et anomalie éventuelle. | À réaliser. |
| Clavier seul et zoom 200 % | Navigateur réel avec zoom natif. | Vérifier ordre de focus, Échap, focus visible, absence de perte d’action et débordement sur les pages modifiées. | Capture et résultat par navigateur. | À réaliser. |
| Safari et Firefox | Appareils compatibles non présents dans l’environnement. | Rejouer navigation, formulaires, langue, thème, cookies et pages publiques prioritaires sur le domaine publié. | Version navigateur/OS, routes, captures et anomalies. | À réaliser. |
| E-mails HTML | Boîtes Gmail, Outlook et Apple Mail. | Utiliser un destinataire de test autorisé ; ne pas inclure de document réel ni de donnée de santé. | Capture de chaque client, objet, expéditeur, rendu mobile/desktop et résultat spam. | À réaliser. |
| Rappel de rendez-vous | Rendez-vous de recette confirmé et boîte e-mail de test. | Utiliser un créneau et un paiement de test explicitement autorisés ; vérifier une seule réception sans créer de doublon. | Identifiant de recette, horodatage, reçu et résultat sur desktop/mobile. | À réaliser. |
| Dashboard sur mobile/tablette | Session administrateur et MFA autorisés. | Ouvrir une session de recette ; vérifier les onglets denses sans consulter ni exporter de données inutiles. | Taille d’écran, onglets contrôlés, captures non sensibles et anomalies. | À réaliser. |
| Droits des tiers | Autorisations du titulaire d’image, marque ou témoignage. | Archiver le consentement ou la licence avec la référence de l’actif dans le registre de droits. | Accord écrit, portée, territoire, durée et canal. | À réaliser. |
| Page Partenaires | Autorisation écrite de chaque organisation citée. | N’ajouter une carte, un logo ou un lien partenaire qu’après validation de l’organisation concernée. | Accord explicite et version approuvée du logo/contenu. | À réaliser. |
| Revue UX fondée sur l’usage | Retours réels de visiteurs ou d’utilisateurs autorisés. | Recueillir des commentaires consentis, anonymiser les enseignements et prioriser les écarts récurrents. | Synthèse anonymisée, décision et date de revue. | À réaliser. |

## Règle de clôture

Un item peut passer à « réalisé » uniquement lorsque sa preuve est rattachée à une version ou à un journal daté. Une simple absence d’erreur lors des contrôles automatisés ne clôt pas un contrôle externe.
