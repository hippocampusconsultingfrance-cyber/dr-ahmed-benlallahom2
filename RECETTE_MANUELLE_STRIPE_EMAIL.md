# Recette manuelle non destructive — Stripe et emails

## Objectif et précautions

Cette recette vérifie, sur le **domaine publié** `https://drahmedbenlallahom.com`, le paiement de réservation, la création de facture et la délivrance des emails transactionnels. Utilisez un créneau de test et une adresse email que vous contrôlez. Ne saisissez jamais de données de santé réelles et ne réalisez aucun envoi de campagne de masse pendant cette vérification.

> Les confirmations et les factures sont désormais mises en file après le paiement puis reprises automatiquement, au plus tard dans les cinq minutes. Il est normal que l’email n’arrive pas instantanément.

| Élément | Valeur de test |
|---|---|
| Environnement | Domaine public, jamais l’aperçu de développement |
| Carte Stripe de test | `4242 4242 4242 4242` |
| Date d’expiration | Toute date future |
| CVC | Trois chiffres quelconques |
| Code postal | Toute valeur valide pour le pays choisi |
| Données personnelles | Email de test et identité fictive uniquement |

## Parcours de réservation et paiement

1. Ouvrez `https://drahmedbenlallahom.com/booking` dans une fenêtre privée. Sélectionnez un créneau disponible, renseignez une identité fictive et une adresse email de test, puis ajoutez une courte demande de conseil en santé ne contenant aucune donnée clinique réelle.
2. Vérifiez que le tarif affiché correspond à l’horaire choisi : **100 €** entre 08:00 et 18:00, **150 €** entre 18:00 et 08:00. Passez au paiement.
3. Sur la page Stripe, utilisez la carte de test indiquée ci-dessus. Après confirmation, vous devez revenir vers la page de succès du site. Ne fermez pas l’onglet avant la redirection.
4. Dans l’administration, vérifiez qu’une seule réservation est créée pour le créneau, avec un paiement confirmé. Cette vérification est importante pour confirmer le verrou anti-double réservation.
5. Attendez jusqu’à cinq minutes. Contrôlez la boîte de réception et le dossier indésirable de l’adresse de test : l’email doit récapituler la demande, le créneau et le lien Google Meet. Vérifiez que l’expéditeur est `recrutement@drahmedbenlallahom.com` et que la réponse est dirigée vers `hippocampusconsultingfrance@gmail.com` lorsque le message concerne Hippocampus Consulting.
6. Ouvrez le lien de facture fourni dans l’email, si présent, et vérifiez le montant, la date, la référence de réservation et l’adresse email de test. Ne transmettez pas ce lien : il relève de la réservation test.

## Contrôles de reprise et d’échec

Si l’email ou la facture n’est pas reçu dans les cinq minutes, ne recréez pas immédiatement une seconde réservation. Recherchez d’abord la réservation dans l’administration et vérifiez les tâches post-paiement. La tâche `appointment-fulfillment` relance les confirmations et factures échouées toutes les cinq minutes.

| Situation constatée | Contrôle à effectuer | Action sûre |
|---|---|---|
| Paiement validé, email absent | Vérifier les spams et le statut de la réservation | Attendre le prochain passage de la file ; ne pas payer une seconde fois |
| Facture absente, email reçu | Vérifier la file post-paiement et l’adresse email de test | Déclencher une reprise administrative seulement après vérification |
| Retour Stripe interrompu | Vérifier le paiement dans Stripe puis la réservation dans l’administration | Laisser le webhook et la file reprendre le traitement |
| Double réservation suspectée | Rechercher le même créneau dans l’administration | Ne pas supprimer de données ; documenter l’heure et les références |

## Contrôle de délivrabilité des emails

Réception ne signifie pas nécessairement délivrabilité optimale. Après la recette, vérifiez dans Resend le statut de livraison du message de test et, si un message est placé dans les indésirables, contrôlez l’alignement de l’expéditeur avec le domaine `drahmedbenlallahom.com`. Les enregistrements SPF, DKIM et DMARC doivent rester actifs. N’envoyez pas de campagne de test à des candidats réels sans leur consentement.

## Validation WAF du portail candidat

Les étapes de configuration Cloudflare sont décrites dans [CANDIDATE_PORTAL_WAF.md](./CANDIDATE_PORTAL_WAF.md). Après activation, testez une connexion candidate normale et un dépôt normal, puis vérifiez que les chemins suivants restent accessibles : `/api/stripe/webhook` et `/api/scheduled/*`. La règle ne doit jamais bloquer le traitement planifié des documents ni les notifications post-paiement.

## Trace de recette

Conservez, dans un registre interne, la date de la recette, l’URL utilisée, l’identifiant Stripe du paiement de test, la référence de réservation, le délai d’email constaté et le résultat de la facture. Cette trace permet de diagnostiquer un incident sans conserver de données médicales.
