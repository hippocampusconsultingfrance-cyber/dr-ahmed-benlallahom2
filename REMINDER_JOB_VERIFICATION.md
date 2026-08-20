# Vérification interne des rappels de rendez-vous

Le 20 août 2026, la tâche planifiée `appointment-reminder-24h` a été contrôlée dans la liste des tâches du projet. Elle est activée, appelle `/api/scheduled/reminder` toutes les heures (`0 0 * * * *`, UTC) et dispose d’exécutions réussies avec une réponse structurée `{"ok":true,"reminded":0}` lorsqu’aucun rendez-vous admissible n’est présent.

Cette vérification confirme la configuration, l’activation et l’exécution technique du traitement. Elle ne simule pas de rendez-vous ni n’envoie de notification de test. La réception réelle sur desktop et mobile exige un rendez-vous de test explicitement autorisé et reste à documenter dans `EXTERNAL_VALIDATION_REGISTER.md`.

> Aucune donnée de patient, adresse de destinataire ou notification réelle n’a été créée pour ce contrôle.
