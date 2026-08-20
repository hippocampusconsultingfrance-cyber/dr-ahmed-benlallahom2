# Preuve de test de candidature en production — 20 août 2026

## Objet et périmètre

Ce test de production a été exécuté après autorisation explicite du propriétaire du site. Il a utilisé un CV PDF exclusivement fictif et non sensible. Le document ne contenait aucune donnée d’une personne réelle, aucune donnée de santé, aucun identifiant officiel ni coordonnée exploitable.

## Résultat vérifié

| Contrôle | Résultat | Preuve technique |
|---|---|---|
| Réception de la candidature | Réussi | Candidature `id=210001` créée avec un identifiant de suivi distinct. |
| Mise en quarantaine initiale | Réussi | `file_validation_status=quarantined` avant traitement. |
| Validation du fichier | Réussi | `file_validation_status=accepted` après contrôle technique. |
| Extraction du PDF | Réussi | `extraction_method=pdf_text`. |
| Analyse asynchrone | Réussi | `analysis_status=needs_review`, `analysis_attempts=1`, modèle `gemini-3-flash-preview`. |
| File de traitement | Réussi | Job `analyze_cv` terminé avec `job_status=completed`, débuté à 08:15:33 UTC et finalisé à 08:15:49 UTC. |
| Conservation du document | Vérifiée | Aucun mécanisme de suppression automatique n’a été déclenché ; le document reste soumis aux règles de conservation manuelle/GDPR du site. |

## Traçabilité

> La trace opérationnelle de ce test repose sur la candidature, son job de traitement persistant et les horodatages associés. Aucun enregistrement n’a été créé dans `recruitment_audit_logs`, cette table étant réservée aux actions administratives sensibles ; l’absence d’entrée a été vérifiée et ne constitue pas une suppression de trace de traitement.

Le worker de recrutement a été réinitialisé de manière contrôlée pendant l’essai (pause puis reprise, sans changement d’intervalle). Son exécution planifiée suivante a traité la candidature avec succès. Une tentative de rafraîchissement direct de la planification a échoué par expiration de délai côté planificateur ; la reprise contrôlée a restauré l’exécution normale.

## Conclusion

Le flux de dépôt PDF fictif, mise en quarantaine, validation technique, extraction, analyse IA et passage en revue humaine est fonctionnel en production. Aucun contenu personnel réel n’a été utilisé pour cette vérification.
