# Avis sur l’audit externe du code

**Évalué le :** 20 août 2026  
**Périmètre :** lecture de l’audit transmis, vérification ciblée du dépôt actuel et contrôles TypeScript/tests non destructifs.

## Conclusion

L’audit est **sérieux, utile et globalement juste**. Il ne relève pas de vulnérabilité critique ; il confirme un socle de sécurité déjà robuste, particulièrement pour l’authentification candidat, le chiffrement des documents, la protection anti-bot, le contrôle d’accès administrateur et les contrôles Stripe/Resend.

Ses recommandations les plus importantes concernent le **webhook Stripe**. Elles doivent être traitées avant toute prochaine évolution du paiement, car elles touchent la fiabilité d’un paiement confirmé et la divulgation de détails d’erreur, non pas parce que le site est actuellement exposé à une faille critique.

## Constats vérifiés dans le code actuel

| Sujet de l’audit | Vérification | Avis |
|---|---|---|
| Bypass `evt_test_` dans le webhook Stripe | Présent dans `server/_core/index.ts`, lignes 161–163 | À corriger en priorité : le chemin doit être absent en production. |
| Erreurs Stripe retournées au client | Chaînes d’erreur détaillées et exception brute présentes aux lignes 178–202 et 251–253 | À corriger en priorité : journaliser côté serveur, répondre par un message générique. |
| Échec métier avalé après paiement | Le `catch` des lignes 220–222 écrit seulement dans la console, puis le webhook répond positivement | À corriger en priorité : retourner un 5xx ou persister un événement idempotent pour permettre le rejeu Stripe. |
| Comparaison et compteur MFA | Comparaison directe du hash et incrément non atomique dans `server/adminMfa.ts`, lignes 57–58 | Recommandation valide, effort faible. |
| CSP et HTTPS | CSP présente mais avec `unsafe-inline`; pas de HSTS applicatif explicite; `trust proxy` non visible | Durcissement pertinent, à traiter après Stripe/MFA. |
| Validation des variables d’environnement | `server/_core/env.ts` prévoit des chaînes vides par défaut | Recommandation valide : ajouter une validation de démarrage pour les secrets critiques. |
| CI GitHub | Aucun workflow `.github/workflows` détecté | Recommandation valide et rentable. |
| Licence et fichiers legacy | Licence `MIT`, `BookingPage-old.tsx` présent; fichiers `__manus__` présents | Licence et page legacy à corriger; les fichiers `__manus__` doivent être vérifiés avant suppression, car ils peuvent être requis par la plateforme. |

## Contrôles complémentaires effectués

Le contrôle TypeScript s’est terminé sans erreur. Quatre fichiers de tests ciblés ont également réussi : protections des en-têtes, secret candidat, cycle Stripe et contrôle d’accès aux actions administratives de recrutement, soit **6 tests réussis**.

## Priorités recommandées

| Priorité | Travail | Motif |
|---|---|---|
| P0 | Corriger le webhook Stripe : supprimer le bypass de production, masquer les erreurs, assurer le rejeu après échec métier | Évite qu’un paiement valide soit accepté sans confirmation durable du rendez-vous. |
| P0 | Validation stricte des secrets et URL critiques au démarrage | Empêche un déploiement partiellement configuré. |
| P1 | Rendre les tentatives MFA atomiques et employer une comparaison en temps constant | Renforce la défense contre les essais concurrents. |
| P1 | Ajouter une CI GitHub : TypeScript, tests, audit des dépendances | Empêche les régressions lors de chaque modification future. |
| P2 | Logger structuré avec masquage des identifiants, HSTS et CSP à nonces | Améliore la traçabilité et le durcissement de production. |
| P3 | Réorganiser les gros modules, supprimer la page legacy, déplacer les audits dans `docs/`, passer la licence en propriétaire | Réduit la dette technique et l’ambiguïté juridique. |

## Décision conseillée

Le lot **P0 + P1** a été mis en œuvre le 20 août 2026 sans modifier les parcours visuels. Les actions P2 et P3 peuvent être planifiées ensuite. Avant toute suppression, les artefacts générés par la plateforme doivent être identifiés comme requis ou non.

## Remédiations appliquées après l’évaluation

| Remédiation | Résultat |
|---|---|
| Webhook Stripe | Le bypass `evt_test_` a été supprimé. Les erreurs de signature ou de données deviennent génériques côté public. Un échec de traitement interne renvoie désormais un 5xx afin que Stripe rejoue l’événement ; la file de confirmation/facture est réenfilée de façon idempotente lors d’un rejeu. |
| Configuration de production | Les secrets et paramètres critiques sont validés au démarrage en environnement de production. Un déploiement incomplet échoue immédiatement avec la liste des variables manquantes. |
| MFA administrateur | La comparaison de hash utilise une comparaison à temps constant ; l’incrément des tentatives est conditionnel et atomique. |
| En-têtes | `trust proxy` et HSTS sont définis explicitement ; la CSP existante est conservée, avec une évolution vers des nonces à planifier. |
| CI GitHub | Un workflow exécute TypeScript et la suite Vitest à chaque push/pull request sur `main`. L’audit des dépendances est publié de façon non bloquante pendant la phase de maintenance. |
| Dépendances | Axios, Drizzle ORM, Express et Nanoid ont été mis à jour vers des versions corrigées compatibles. Streamdown a été migré vers la v2 ; Recharts conserve son API v2 et utilise Lodash 4.18.1 corrigé. L’audit final ne détecte **aucune vulnérabilité connue** dans les dépendances de production. |

La validation finale a réussi : **329 tests réussis, 2 ignorés**, TypeScript valide, build de production réussi et audit de dépendances de production sans vulnérabilité connue.
