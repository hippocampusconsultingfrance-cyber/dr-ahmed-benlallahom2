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

## Clarté médicale, transactionnelle et cohérence d’interface

| Domaine | Périmètre annuel | Preuves à archiver | Décision attendue |
|---|---|---|---|
| Clarté des parcours médicaux et transactionnels | Prix jour/nuit, durée, étapes de paiement, remboursement, confirmation, facture, rappels, téléconsultation, urgence et demandes RGPD. | Parcours de test, captures des politiques, exemples d’e-mails et vérification de la lisibilité à chaque langue active. | Clarifier ou corriger toute information pouvant induire une action, une attente ou une interprétation erronée. |
| Identité, contenus et contacts | Coordonnées publiques, contacts professionnels, partenaires, diplômes, certifications, photographies, biographies et traductions. | Inventaire de sources autorisées, dates de vérification et historique des corrections. | Retirer ou mettre à jour les informations non confirmées. |
| Référencement et navigation | Titres SEO, Open Graph, canonical, hreflang, URLs, fil d’Ariane, page 404, footer, menu mobile et sélecteurs. | Extraction de métadonnées, contrôle de routes et captures desktop/mobile. | Corriger les divergences qui affectent l’indexation ou l’orientation de l’utilisateur. |
| Système visuel et interactions | CTA Réserver/Contact/WhatsApp, boutons secondaires, cartes, icônes, bordures, rayons, ombres, espacements, largeur, hauteur et transitions. | Échantillons de composants, résultat des tests responsive et anomalies signalées. | Préserver les conventions ou documenter toute évolution volontaire. |
| Retour d’usage et simplification | Anomalies graphiques, fonctionnalités réellement utilisées, fonctionnalités à retirer et complexité de parcours. | Retours qualifiés, données agrégées disponibles et décision documentée. | Corriger les irritants ou retirer les éléments dont le coût dépasse le bénéfice. |

## États d’interface, composants et diffusion

| Domaine | Périmètre annuel | Preuves à archiver | Décision attendue |
|---|---|---|---|
| États et primitives d’interface | Focus, survol, actif, désactivé, chargement, erreur, succès, vide, skeletons, toasts, modales, drawers, menus, calendriers et carrousels. | Parcours clavier, captures des états et tests de composants. | Corriger les états sans retour visible ou sans chemin de sortie clair. |
| Composants et système visuel | Formulaires, tableaux, graphiques, badges, avatars, logos, illustrations, photographies, vidéos et sons. | Inventaire des composants, droits d’usage et exemples de rendu. | Conserver une hiérarchie cohérente, accessible et attribuée. |
| Canaux et artefacts | Documents PDF, e-mails, SMS, notifications administrateur/client, vues imprimables, exports, téléchargements, partages et aperçus sociaux. | Échantillons rendus, liens vérifiés et résultats des tests de génération. | Réparer tout artefact incomplet, ambigu ou inaccessible. |
| Pages de support | Résultats de recherche, erreurs, maintenance, statut et aide. | Liste de routes, captures et contrôle de disponibilité. | Garder un message clair, une action de reprise et une indexation appropriée. |

## Pages, routes et liens

| Domaine | Périmètre annuel | Preuves à archiver | Décision attendue |
|---|---|---|---|
| Pages éditoriales et métier | FAQ, ressources éventuelles, presse, partenaires, équipe, entreprises, formations, services, contact, réservation, témoignages, légales, RGPD et administration. Les sections désactivées, dont le Blog, sont contrôlées comme telles. | Inventaire des routes actives, statut de chaque section et captures des pages exposées. | Mettre à jour, désactiver ou corriger toute page dont le contenu ou l’objectif n’est plus valide. |
| Routes et indexation | Routes publiques/protégées, redirections, URL canoniques et cohérence d’accès. | Carte des routes, réponses HTTP et vérification de robots/sitemap/canonical. | Corriger les accès non voulus et les incohérences d’indexation. |
| Liens de service | Liens internes/externes, téléchargement, paiement, visioconférence, contact, aide, légal, social, partenaire, ressource, recherche, filtres, pagination et breadcrumbs. | Résultat de contrôle de liens, routes de destination et propriétaire du lien externe. | Réparer, remplacer ou supprimer les liens obsolètes. |
| Navigation et droits | Navigation, footer, menu mobile, langue, thème, cookies, RGPD, suppression, export, accès, rectification et opposition. | Parcours clavier, captures mobile et tests d’autorisation. | Préserver une sortie claire et empêcher tout lien vers une action non autorisée. |

## Déroulement recommandé

La revue doit être planifiée une fois par an, puis renouvelée après une évolution majeure de paiement, authentification, stockage documentaire, fournisseur externe ou politique de données. Commencer par l’inventaire de la version publiée et terminer par une liste d’actions datées. Les éléments nécessitant un appareil réel, une boîte e-mail tierce ou un compte fournisseur ne doivent jamais être déclarés réalisés sans preuve correspondante.

> Pour les contenus médicaux, le composant `MedicalCitation` doit être privilégié lorsqu’une source est affichée. Aucune citation ne doit être utilisée pour présenter une recommandation individualisée ou un résultat garanti.
