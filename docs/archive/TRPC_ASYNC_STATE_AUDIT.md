# Audit des états asynchrones tRPC critiques

Cet audit cible les parcours où une réponse asynchrone conditionne une action sensible : réservation avec paiement et espace candidat avec documents protégés. Il ne remplace pas les tests d’intégration serveur ni les contrôles d’accès administratifs.

| Parcours | Chargement | Erreur | État vide ou sûr | Action bloquée |
|---|---|---|---|---|
| Réservation | Disponibilité signalée et squelette de prix. | Message localisé, sans détail technique. | Créneau non confirmé traité comme indisponible. | Paiement désactivé tant que disponibilité ou prix ne sont pas confirmés. |
| Coffre candidat | Squelette pendant la requête de documents et sessions. | Panne de chargement du coffre distincte, sans détail interne, avec action de nouvelle tentative. | Message dédié lorsque le coffre ne contient aucun document. | Les mutations d’envoi et de session exposent leur état occupé. |
| Vérification e-mail candidat | État de vérification avec squelette. | Branche générique de lien invalide ou expiré. | Confirmation explicite en cas de succès. | Le flux n’expose pas de détail interne. |

> Les libellés d’échec conservent un niveau d’information utile à l’utilisateur sans divulguer une erreur serveur, un identifiant de dossier, un document ou un état de paiement sensible.
