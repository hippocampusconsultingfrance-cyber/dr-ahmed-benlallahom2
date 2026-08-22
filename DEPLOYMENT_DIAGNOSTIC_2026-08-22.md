# Diagnostic de déploiement — 22 août 2026

## Résultat

L’échec signalé ne se reproduit plus. La construction de production s’est terminée avec succès, le serveur a redémarré sans erreur d’import et la page publique a été vérifiée sur `https://drahmedbenlallahom.com/?v=1c4bcadc`.

Le chargement initial a affiché l’écran de préparation habituel, puis l’intégralité de la page d’accueil a été rendue : navigation, contenu et accès **Questions santé** étaient disponibles.

## Cause qualifiée

Un journal historique contenait une erreur d’import sur `sendMedicalQuestionResponseEmail`, apparue avant que l’export du module de notifications soit ajouté. Dans l’état actuel du code, cet export existe bien, la compilation de production passe et le runtime démarre correctement. La publication `1c4bcadc` a donc été relancée depuis un état source sain.

## Contrôles effectués

| Contrôle | Résultat |
|---|---|
| `pnpm build` | Réussi |
| Import `sendMedicalQuestionResponseEmail` | Disponible dans `server/_core/notifications.ts` |
| Redémarrage du serveur | Réussi |
| Chargement de la page publique | Réussi |

## Incident de maintenance observé après publication

Après la publication suivante, le 22 août 2026, les deux domaines `drbenlallah-esc8d3hd.manus.space` et `drahmedbenlallahom.com` ont servi la même page générique **« Site under maintenance »** sur la route Questions santé. L’incident concerne donc la publication/instance de production elle-même et non le DNS du domaine personnalisé ni le routage de cette page.
