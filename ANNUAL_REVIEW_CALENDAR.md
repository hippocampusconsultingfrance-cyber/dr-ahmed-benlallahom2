# Calendrier annuel de revue qualité et conformité

Ce calendrier organise les vérifications annuelles du site et de ses parcours candidats. Il sert de registre de préparation : chaque revue doit conserver une date, un responsable, une version du site, les preuves collectées et les actions correctives éventuelles. Il ne remplace pas une consultation juridique, médicale ou de sécurité spécialisée.

| Domaine | Périmètre annuel | Preuves à archiver | Décision attendue |
|---|---|---|---|
| Traductions et identité visuelle | FR, EN, DE, ZH ; tonalité médicale, titres, CTA, alternatives et cohérence des couleurs. | Captures desktop/mobile, liste des copies modifiées, résultats des tests de longueur et de contraste. | Corriger, valider ou retirer toute formulation ambiguë. |
| Accessibilité et performances | Navigation clavier, lecteur d’écran, zoom 200 %, mouvement réduit, contraste, chargement et responsive. | Résultats des tests, appareils/navigateurs utilisés, liste des écarts et correctifs. | Prioriser les écarts qui bloquent un parcours ou réduisent la compréhension. |
| Droits sur visuels et logos | Illustrations, photographies, logos de partenaires et visuels de campagne. | Source, licence ou autorisation, date de vérification, contexte de publication. | Retirer tout asset sans droit ou contexte suffisamment établi. |
| Contenus médicaux et sources | Citations médicales, avertissements, informations générales et absence de promesse thérapeutique. | Source primaire, date de mise à jour, responsable de relecture, capture du contenu publié. | Mettre à jour, nuancer ou retirer le contenu obsolète. |
| Pages légales et RGPD | Mentions, confidentialité, cookies, consentements, durées de conservation, sous-traitants et registre. | Version des pages, registre de traitement, statut des sous-traitants et décisions documentées. | Soumettre tout changement substantiel à une revue juridique ou DPO compétent. |
| Sécurité des espaces privés | Accès candidat/admin, sessions, MFA, liens expirés, documents, journaux et alertes. | Résultats de tests d’accès, version des contrôles, incidents et remédiations. | Corriger en priorité tout accès croisé, fuite de métadonnée ou protection inactive. |

## Revues opérationnelles et d’expérience

| Domaine | Périmètre annuel | Preuves à archiver | Décision attendue |
|---|---|---|---|
| Communications et documents | Modèles e-mail, notifications e-mail/SMS, factures, documents générés et désinscriptions. | Aperçus de modèles, contrôle des liens, conditions de retour et version des mentions. | Corriger tout texte périmé, lien rompu ou traitement non cohérent. |
| Réservation et paiement | Parcours de réservation, prix jour/nuit, durées, remboursement, confirmations et retours de paiement. | Parcours de test documenté, politiques affichées, vérification des messages de succès/annulation. | Harmoniser les tarifs et politiques ; escalader toute anomalie transactionnelle. |
| Administration et qualité technique | Dashboard, erreurs 404/maintenance, domaines, certificats, favicon, Sitemap, liens internes, données structurées, composants et dépendances. | Export des contrôles, routes vérifiées, résultats de build/test et liste des dépendances. | Mettre à jour, corriger ou retirer les éléments devenus inutiles. |
| Marque et cohérence externe | Site, e-mails, réseaux sociaux, kit Hippocampus, positionnement FR/EN/DE/ZH et ressources graphiques. | Kit de marque, échantillons de communication, captures et autorisations de visuels. | Préserver la signature et corriger les divergences de ton ou de palette. |
| Expérience utilisateur | CTA, formulaires, aides, états vides, erreurs, composants accessibles, animations, responsive et anomalies graphiques. | Retours utilisateurs disponibles, captures, résultats des tests visuels et liste de dettes UX. | Prioriser les irritants qui empêchent la compréhension ou l’action. |
| Simplicité et informations médicales | Fonctions peu utilisées, simplicité de réservation, mentions médicales, distinction information/conseil, limites de téléconsultation et contacts d’urgence. | Données d’usage anonymisées lorsqu’elles existent, revue des parcours et validation des textes. | Retirer la complexité inutile et nuancer les contenus à risque de mauvaise interprétation. |

## Déroulement recommandé

La revue doit être planifiée une fois par an, puis renouvelée après une évolution majeure de paiement, authentification, stockage documentaire, fournisseur externe ou politique de données. Commencer par l’inventaire de la version publiée et terminer par une liste d’actions datées. Les éléments nécessitant un appareil réel, une boîte e-mail tierce ou un compte fournisseur ne doivent jamais être déclarés réalisés sans preuve correspondante.

> Pour les contenus médicaux, le composant `MedicalCitation` doit être privilégié lorsqu’une source est affichée. Aucune citation ne doit être utilisée pour présenter une recommandation individualisée ou un résultat garanti.
