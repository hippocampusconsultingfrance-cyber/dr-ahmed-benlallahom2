# Constats techniques — lot P0/P1

**Date :** 21 août 2026

| Sujet | Constat vérifié | Décision de correction |
|---|---|---|
| Réservation | La création persiste immédiatement une réservation `pending` avec statut `confirmed`, avant la création de la session Stripe. | Introduire un statut de maintien temporaire, une expiration persistée et une libération idempotente. |
| Stripe Checkout | Le webhook vérifie un montant brut égal au tarif stocké alors que les codes promotionnels sont activés. | Désactiver les codes promotionnels tant qu’aucun modèle interne de remise contrôlée n’est déployé. |
| Expiration Stripe | Une session Checkout peut être configurée entre 30 minutes et 24 heures. [1] | Aligner le maintien temporaire sur une fenêtre de 30 minutes et libérer les sessions sans checkout via un job périodique idempotent. |
| Candidature publique | Le dépôt déclenche stockage, base, email, IA et Drive sans les protections appliquées au coffre candidat. | Valider Turnstile et limiter IP/email avant toute opération coûteuse ; rejeter les doublons connus. |
| Parcours VVIP | Le formulaire VVIP utilise la même route publique de candidature. | Il transmet le même jeton Turnstile afin que le contrôle serveur s’applique aux deux parcours. |
| Invitation | L’URL est construite depuis des en-têtes navigateur. | Utiliser exclusivement l’origine publique serveur fixe. |
| Corps HTTP | La limite globale est de 50 Mo alors que les fichiers passent déjà par Multer. | Abaisser les parsers JSON et URL-encoded à 1 Mo. |

## Référence

[1] [Stripe — Durée d’expiration des sessions Checkout](https://docs.stripe.com/api/checkout/sessions/create)

## Correctifs appliqués

| Correctif | Implémentation vérifiée |
|---|---|
| Créneau avant paiement | Les nouvelles réservations démarrent désormais à l’état `held`, avec une expiration de 30 minutes et une session Checkout créée dans le même parcours serveur. Aucun email ni facture n’est envoyé avant le webhook de paiement. |
| Confirmation et expiration Stripe | Le webhook fait passer un maintien payé à `confirmed` et efface son expiration. Un événement `checkout.session.expired` libère le créneau de façon idempotente. |
| Nettoyage automatique | Un endpoint cron authentifié libère les maintiens impayés arrivés à expiration ; il sera activé après publication. |
| Promotions | Les codes promotionnels Stripe sont désactivés sur la consultation tant qu’un modèle interne de remises, montant net et traçabilité n’est pas mis en place. |
| Candidatures publiques | Les parcours standard et VVIP transmettent Turnstile. Le serveur applique un quota persistant par IP/email, valide Turnstile avant stockage, bloque les CV déjà connus par checksum et limite la file d’analyse à 200 éléments actifs. |
| Liens candidats | Les invitations, vérifications et réinitialisations utilisent une origine publique fixe côté serveur, sans dépendre de `Origin`, `Referer` ou `Host`. |
| Corps HTTP | Les parsers JSON et URL-encoded globaux sont limités à 1 Mo ; les limites spécifiques des uploads Multer sont conservées. |

## Validation technique

La migration non destructive a été appliquée en trois opérations compatibles avec TiDB : extension de l’énumération, ajout de `hold_expires_at`, puis création de l’index composite. La validation complète a réussi : **161 fichiers de test, 335 tests réussis, 2 ignorés**, TypeScript valide et build de production réussi.

## Activation en production

La tâche planifiée `appointment-hold-cleanup` est active en production depuis le 21 août 2026. Son identifiant est `cTXxodMiJ5mAQYfWfkoonH`; elle appelle `POST /api/scheduled/appointment-hold-cleanup` toutes les cinq minutes. Le handler est authentifié, idempotent et ne modifie que les maintiens impayés expirés.
