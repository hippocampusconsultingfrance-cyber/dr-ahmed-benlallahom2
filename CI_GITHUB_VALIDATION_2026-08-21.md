# Validation de l’intégration continue GitHub

**Date de validation :** 21 août 2026  
**Dépôt :** `hippocampusconsultingfrance-cyber/dr-ahmed-benlallahom2`  
**Workflow :** `Quality and security checks`

## Résultat vérifié

Le workflow GitHub a été exécuté avec succès sur le commit `204f1242`. Les deux jobs ont terminé avec le statut **success** : le contrôle TypeScript et le profil de tests CI d’une part, ainsi que l’audit des dépendances de production d’autre part.

| Contrôle | Exécution GitHub | Portée |
|---|---|---|
| Installation figée | Réussie | `pnpm install --frozen-lockfile` garantit l’utilisation du lockfile versionné. |
| Typage TypeScript | Réussi | `pnpm check` sans erreur. |
| Tests CI reproductibles | Réussis | 310 tests, 2 ignorés, avec un service MySQL temporaire et des variables de test inertes. |
| Audit de dépendances | Réussi | `pnpm audit --prod --audit-level=high` sans vulnérabilité connue à ce niveau. |

## Protection des secrets et des données

La CI ne reçoit **aucune clé de production**, aucune donnée candidate, aucun CV, aucune facture et aucune donnée de rendez-vous réelle. Les clés de paiement, email, chiffrement et anti-bot utilisées dans le workflow sont des valeurs de test non fonctionnelles. La base MySQL de CI est éphémère et supprimée par GitHub après le job.

> Les recettes de production qui nécessitent des comptes autorisés, des données réelles ou des appels externes restent volontairement séparées de la CI publique : Google Drive OAuth réel, envoi Resend réel, validation externe Turnstile et vérifications de témoignages en base de production.

## Utilisation courante

Chaque push ou pull request vers `main` déclenche automatiquement la vérification. Pour reproduire le profil CI localement avec des variables de test, exécuter `pnpm test:ci`; pour la suite complète dans l’environnement de projet, exécuter `pnpm test`.

Les recettes externes doivent continuer d’être réalisées de manière contrôlée, sur des comptes de test autorisés et sans insérer de données fictives présentées comme réelles.

