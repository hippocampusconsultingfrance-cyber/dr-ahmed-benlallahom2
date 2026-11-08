# Bilan de réalisation — audit backend CV et candidatures

**Date de vérification :** 17 août 2026  
**Référence :** `AUDIT_BACKEND_CV_CANDIDATURES_2026-08-17.md`  
**Version vérifiée :** `55c22233`

## Conclusion

Les **dix recommandations ont toutes été prises en compte**, mais elles ne sont pas toutes intégralement closes. Cinq recommandations sont **réalisées**, et cinq sont **partiellement réalisées** car elles demandent encore soit une capacité de plateforme non disponible, soit une industrialisation complémentaire. Aucun point n’a été ignoré.

| # | Recommandation de l’audit | État | Vérification actuelle | Écart ou prochaine étape |
|---:|---|---|---|---|
| 1 | Schéma Drizzle conforme et migration vérifiée | **Réalisé** | Les champs de disponibilité, mobilité, certifications, pipeline, quarantaine, structures normalisées, briefs et associations mission–candidat figurent dans le schéma et les migrations additives ont été appliquées. | Conserver une discipline migration-first pour les évolutions futures. |
| 2 | Suppression d’objet privé et preuve de purge | **Partiel** | À l’expiration, la référence privée est remplacée par `retired/<trackingId>`, le téléchargement est bloqué et l’audit trail conserve un horodatage. | L’interface de stockage disponible ne propose pas de suppression physique d’objet. Une API de suppression S3/stockage est nécessaire pour clôturer ce point entièrement. |
| 3 | File de jobs persistante avec reprises | **Réalisé** | La table `cv_processing_jobs`, le worker idempotent et les reprises exponentielles plafonnées sont actifs ; le job planifié s’exécute toutes les cinq minutes. | Ajouter plus tard métriques, alertes de seuil et tableau de bord de débit. |
| 4 | Statut d’analyse distinct de la candidature | **Réalisé** | `analysisStatus` couvre notamment `queued`, `extracting`, `analyzing`, `completed`, `needs_review` et `failed`, distinct du statut métier de candidature. | Éventuellement ajouter les sous-états `received`, `validated` et `deleted` dans une itération ultérieure. |
| 5 | Quarantaine et validation technique avant analyse | **Partiel** | Les fichiers sont placés en zone privée de quarantaine et contrôlés par extension, MIME, signature binaire, taille et cohérence DOCX avant promotion. | Anti-malware dédié, détection des PDF chiffrés/corrompus et limites de pages complètes restent à ajouter. |
| 6 | Métadonnées d’extraction et de modèle reproductibles | **Partiel** | Le pipeline conserve checksum, méthode d’extraction, statut, erreurs, tentatives, modèle et version de prompt. | Ajouter niveau de confiance OCR, total réel de pages, version OCR et avertissements d’extraction détaillés. |
| 7 | Disponibilité, mobilité et certifications dans la fiche et les filtres | **Réalisé** | Les champs sont stockés, restitués dans le dashboard et utilisés par les filtres administratifs. | Ajouter une visualisation de détail plus riche si nécessaire. |
| 8 | Normalisation des certifications, langues et expériences | **Partiel** | L’analyse conserve des structures JSON normalisées, les certifications/langues sont filtrables et les expériences distinguent les formes d’exercice. | Migrer ultérieurement vers des tables relationnelles, niveaux de langue contrôlés et index SQL dédiés pour les très grands volumes. |
| 9 | Dashboard briefs Employeurs et association mission–candidats | **Réalisé** | L’onglet **Missions** présente les briefs, propose une shortlist explicable et permet l’association contrôlée candidat–mission. | Ajouter notes sécurisées, historique commercial, SLA et suivi de communication. |
| 10 | Tests d’intégration succès/échecs/accès | **Partiel** | Les contrôles couvrent validation réussie/échouée, règles de reprise, analyse nécessitant revue, rétention, matching, accès admin refusé et rejets HTTP sûrs. La suite compte 81 tests passants et 1 ignoré. | Ajouter de vrais tests bout en bout isolés pour l’OCR réel, l’échec LLM, les notifications externes et le stockage de production. |

## Contrôles d’exploitation confirmés

Le worker `recruitment-processing-every-5-minutes` a exécuté plusieurs passages avec un code HTTP `200`; les passages vérifiés n’avaient aucun CV en attente, ce qui explique le résultat `processed: 0`. Le job de rétention quotidien est également planifié pour 03:00 UTC.

> Le score de matching et les analyses IA restent des aides à la revue humaine. Le module ne doit pas prendre de décision automatisée de recrutement.

## Priorités restantes

La priorité technique la plus importante est d’obtenir une capacité de **suppression physique d’objet** dans le stockage afin de compléter la purge RGPD. Ensuite, il convient d’ajouter un service anti-malware, des métriques OCR détaillées, des tables relationnelles pour les référentiels métier et des tests end-to-end isolés des services externes.
