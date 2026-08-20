# Protocole de validation graphique avant checkpoint

Avant chaque checkpoint qui modifie une interface publique, exécuter `pnpm validate:precheckpoint`. La commande lance notamment `pnpm test:visual`, vérifie les étalons visuels, le contrat de la matrice et la checklist de gouvernance graphique, puis contrôle TypeScript. Elle doit être complétée par une capture ciblée lorsqu’une page ou un composant a été modifié visuellement.

| Situation | Exigence avant checkpoint |
|---|---|
| Modification d’une page publique | `pnpm validate:precheckpoint` et capture de la page au viewport concerné. |
| Modification purement serveur ou documentaire | `pnpm check` et tests ciblés ; consigner pourquoi la capture n’est pas requise. |
| Mise à jour volontaire d’un étalon | Enregistrer les candidats, effectuer une revue humaine desktop/mobile, publier les étalons, puis exécuter `pnpm validate:precheckpoint`. |
| Écart visuel incompris | Ne pas publier ; analyser la cause avant de remplacer un étalon. |

> La validation automatisée ne remplace pas les contrôles externes identifiés dans `EXTERNAL_VALIDATION_REGISTER.md`, notamment sur appareil réel, lecteur d’écran ou client e-mail.
