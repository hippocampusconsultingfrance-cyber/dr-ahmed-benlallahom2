# Checklist de préproduction

Ce document accompagne toute évolution avant publication sur `drahmedbenlallahom.com`. Il ne remplace pas la revue clinique, juridique ou opérationnelle requise lorsqu’un contenu, une tarification ou une politique métier évolue.

| Domaine | Contrôle à exécuter | Preuve attendue | Statut |
|---|---|---|---|
| Compilation | Exécuter `pnpm test` puis `pnpm build`. | Suite de tests verte et build sans erreur TypeScript. | [ ] |
| Parcours publics | Vérifier accueil, réservation, recrutement standard, VVIP, Employeurs, FAQ, pages légales et 404 sur desktop et mobile. | Captures ou recette consignée ; aucune route publique inattendue. | [ ] |
| Réservation | Tester un créneau sans réaliser de paiement réel, puis vérifier date/heure, tarif, annulation et retour Stripe. | Session créée avec le bon montant ; aucun effet post-paiement avant confirmation Stripe. | [ ] |
| Emails | Vérifier le sujet, l’expéditeur, la réponse, le rendu du shell Hippocampus et les liens d’un échantillon transactionnel. | Réception contrôlée dans une boîte de test ; aucun lien cassé. | [ ] |
| Recrutement | Contrôler consentement, revue humaine, absence de décision automatisée, filtres et désinscription. | Données fictives uniquement ; trace d’audit disponible. | [ ] |
| Portail candidat | Vérifier login, MFA administrateur, activation email, protection anti-bot, dépôt et téléchargement contrôlé. | Compte de test et document fictif uniquement. | [ ] |
| Confidentialité | Revoir bandeau cookies, préférences persistantes, absence d’analytique sans consentement et pages RGPD. | Test sans consentement ; script analytique absent du HTML initial. | [ ] |
| Accessibilité | Vérifier navigation clavier, focus, lien d’évitement, taille tactile, contraste et mouvement réduit. | Test clavier et capture mobile ; aucun élément interactif inaccessible. | [ ] |
| Référencement | Vérifier titre, description, canonical, sitemap, robots et `noindex` des parcours privés. | Lecture du HTML rendu et contrôle du sitemap publié. | [ ] |
| Résilience | Vérifier `/error`, `/maintenance`, réponse 404 et en-têtes de sécurité. | Pages sans détail technique ; codes HTTP cohérents. | [ ] |

> Toute anomalie P0 ou P1 bloque la publication. Les vérifications nécessitant une session, une boîte mail ou un paiement doivent utiliser des données de recette et être consignées dans le journal d’audit.

## Décision de publication

| Décision | Conditions | Responsable | Date |
|---|---|---|---|
| Publication autorisée | Toutes les lignes applicables sont validées, ou une dérogation est documentée avec son risque et sa date de correction. |  |  |
| Publication bloquée | Une anomalie critique, une fuite de données, un parcours de paiement incohérent ou une régression d’accès est constaté. |  |  |
