# Évaluation RGPD et juridique — Hippocampus Consulting SARL

**Date :** 20 août 2026  
**Périmètre :** site `drahmedbenlallahom.com`, réservation payante, recrutement médical et paramédical, espace candidat, documents, IA d’aide à l’analyse, e-mails et export Google Drive.  
**Statut :** évaluation documentaire et technique ; **ce document n’est pas un avis d’avocat ni une certification de conformité**. Les choix concernant les statuts de la société, les contrats, les données de santé, les transferts internationaux et l’information des consommateurs doivent être validés par un conseil juridique ou un DPO compétent.

> **Conclusion exécutive :** le site dispose d’une base technique de protection sérieuse — consentements, accès candidat, chiffrement applicatif des documents, journalisation, limitations de tentatives, revue humaine de l’IA, bandeau de cookies, demandes RGPD et export Drive tracé. En revanche, il ne peut pas être présenté comme juridiquement totalement conforme en l’état : les mentions légales ne reflètent pas la SARL annoncée, la politique de confidentialité doit être complétée pour le recrutement/IA/Drive, et un cadrage formel des données sensibles, des sous-traitants, des transferts et de la vente B2C reste nécessaire.

## 1. Réponse courte : faut-il des autorisations légales ?

Hippocampus Consulting SARL n’a pas, sur la seule base d’un site de conseil et de recrutement, à demander une « autorisation RGPD » générale à la CNIL. Le RGPD repose principalement sur la **responsabilité démontrable** : information, bases légales, minimisation, sécurité, registre, contrats de sous-traitance et gestion des droits. Une **AIPD** doit en revanche être examinée avant ou lors d’un traitement présentant un risque élevé ; elle peut être requise pour une combinaison de recrutement, IA, coffre documentaire, données potentiellement sensibles et transferts internationaux.[1] [2]

Le point le plus important est de distinguer les activités. La SARL est probablement **responsable de traitement** pour son site, son vivier, ses campagnes et sa relation commerciale. Elle peut devenir **sous-traitante** pour un établissement lorsqu’elle traite les données strictement pour le compte de celui-ci ; le contrat doit alors définir les instructions, la sécurité, les personnes autorisées, les sous-traitants ultérieurs, les transferts, l’assistance aux droits et la fin de traitement.[3]

| Sujet | Autorisation administrative préalable ? | Action juridiquement attendue |
|---|---:|---|
| Site, formulaires, cookies et contact | Non, en principe | Mentions légales, politique de confidentialité, consentement aux traceurs non exemptés, registre et sécurité. |
| Recrutement et vivier de CV | Non, en principe | Information candidat, base légale, minimisation, conservation limitée, accès restreint, registre et contrats avec établissements selon les rôles. |
| IA d’extraction et d’aide à la revue | Pas d’autorisation générale | Interdiction pratique de décision exclusivement automatisée ; documentation, supervision humaine et examen AIPD/AI Act. |
| Documents de santé potentiels | À qualifier avec un spécialiste | Éviter la collecte ; si données de santé effectives, identifier l’exception article 9 et vérifier l’architecture/HDS applicable. |
| Consultations payantes aux consommateurs | Pas une autorisation RGPD | CGV et information précontractuelle B2C complètes, prix TTC, annulation/rétractation selon le cas, médiation et facturation. |

## 2. État constaté du site

Le site a déjà mis en place des mesures qui réduisent sensiblement le risque : consentements séparés, confidentialité explicite des candidatures, cases marketing distinctes, formulaire d’exercice des droits, bannière et préférences cookies, contrôle d’accès administrateur, protection anti-bot, limitation persistante des tentatives, chiffrement applicatif de documents sensibles, traçabilité d’actions, revue humaine obligatoire et absence revendiquée de décision automatique de recrutement.

Les CV ne sont pas supprimés automatiquement conformément à la règle métier retenue. Cette décision doit toutefois être compensée par une procédure active de revue de conservation : alerte à échéance, décision humaine documentée de maintien justifié ou de suppression, puis suppression synchronisée du coffre, du stockage privé et de Google Drive. En recrutement, la CNIL indique qu’un vivier de candidats non retenus est généralement conservable jusqu’à deux ans après le dernier contact si la personne a été informée.[4]

| Domaine | État observé | Niveau | Commentaire |
|---|---|---|---|
| Sécurité applicative | Chiffrement, contrôle d’accès, anti-bot, journalisation, sessions et limitation des tentatives | **Bon** | À maintenir avec tests, rotation des secrets et procédure d’incident. |
| Consentement cookies | Bandeau, préférences et chargement analytique conditionnel | **Bon sous réserve de contrôle périodique** | Vérifier sur production qu’aucun traceur non essentiel ne part avant consentement et conserver la preuve du choix. |
| Droits RGPD | Formulaire de demande et politique de droits | **Partiel à bon** | Fixer une procédure interne de réponse, d’identité, de délai et de preuve de traitement. |
| Recrutement / vivier | Consentement, conservation surveillée, audit, IA avec revue humaine | **Partiel** | Politique publique et registre à compléter ; contrats avec établissements à qualifier. |
| Espace candidat / documents | Authentification, activation e-mail, chiffrement et accès encadré | **Bon techniquement** | Qualifier les catégories de documents admis et écarter les données de santé non nécessaires. |
| IA recrutement | Aide à l’analyse, pas de décision automatique revendiquée | **Partiel / sensible** | Formaliser le périmètre procédural, la supervision humaine, les limites du score et le dossier AI Act/AIPD. |
| Google Drive | Autorisation OAuth chiffrée, dossier privé, journalisation et reprise | **Partiel** | Ajouter au registre/politique, sécuriser le compte Drive et encadrer les transferts/sous-traitants. |
| Mentions légales de la SARL | Page présente mais éditeur affiché comme professionnel indépendant | **Critique** | Corriger avec les informations sociétaires exactes, sans les inventer. |
| Réservation B2C | Paiement, politique d’annulation et facturation présents fonctionnellement | **À compléter juridiquement** | CGV B2C et information précontractuelle à faire valider. |

## 3. Écarts prioritaires à traiter

### Priorité 1 — Mettre les mentions légales au nom exact de Hippocampus Consulting SARL

Les mentions publiées identifient actuellement « Dr. Ahmed Ben Lallahom » comme professionnel de santé indépendant, alors que vous indiquez que le site appartient à **Hippocampus Consulting SARL**. Pour une société, les mentions doivent être facilement accessibles et faire apparaître notamment la dénomination, la forme, le siège, le capital, l’immatriculation RCS/SIREN, les coordonnées, la TVA le cas échéant, le directeur de publication et les coordonnées complètes de l’hébergeur.[5] [6]

> **À ne pas deviner :** dénomination exacte, capital, siège, RCS/ville, SIREN, TVA, e-mail de contact légal, directeur de publication et coordonnées contractuelles de l’hébergeur. Ces données doivent provenir du Kbis ou de l’Annuaire des entreprises.

| Élément à publier | Source à vérifier | État actuel |
|---|---|---|
| Hippocampus Consulting SARL, capital, siège | Kbis / Annuaire des entreprises | À remplacer dans les mentions. |
| SIREN et RCS avec ville | Kbis / Annuaire des entreprises | À ajouter. |
| TVA intracommunautaire, si applicable | Comptabilité / Kbis | À confirmer. |
| E-mail et téléphone de contact | Coordonnées opérationnelles de la SARL | À afficher directement, pas seulement « via formulaire ». |
| Directeur de publication | Décision de la société | À nommer. |
| Hébergeur et stockage | Contrat/notice du fournisseur | Nom, raison sociale, adresse et téléphone à vérifier avant publication. |
| Activité réglementée médicale, si concernée | Conseil juridique / ordre professionnel | Titre, règles professionnelles, autorité ou ordre compétent, le cas échéant. |

### Priorité 2 — Réécrire la politique de confidentialité par traitement

La politique actuelle couvre le contact, la réservation, Stripe et les droits RGPD, mais elle ne décrit pas suffisamment le recrutement, le vivier, l’espace candidat, les documents, l’IA, la transmission à des établissements et l’export Google Drive. Au moment de chaque collecte, la personne doit pouvoir comprendre le responsable, la finalité, la base légale, le caractère obligatoire, les destinataires, la conservation, les droits, la plainte CNIL et les transferts éventuels.[5]

| Traitement à documenter | Information à ajouter | Point de vigilance |
|---|---|---|
| Candidature et CV | Évaluation du profil, base légale, destinataires habilités, conservation, droits et éventuelle intégration au vivier | Distinguer la candidature d’une future prospection ou du vivier marketing. |
| Documents du portail | Catégories admises, chiffrement, accès, sous-traitants, conservation et suppression | Exclure expressément dossiers patients, examens médicaux et documents de santé non nécessaires. |
| IA d’assistance | Finalité limitée, absence de décision automatique, supervision humaine, limites et droits | Ne pas présenter un score comme une décision de recrutement. |
| Partage à un établissement | Qui reçoit le CV, à quelles conditions, zones géographiques, rôle juridique et garanties de transfert | Prévoir une information dédiée avant communication à un client hors EEE. |
| Google Drive | Sauvegarde opérationnelle, dossier privé, compte autorisé, sécurité, conservation et effacement synchronisé | Restreindre les partages Drive, activer MFA et revoir les accès périodiquement. |
| Réservation/paiement | Prestataires, durée fiscale/comptable, annulation et facturation | Séparer la durée de conservation comptable des données de contact ordinaires. |

### Priorité 3 — Formaliser le registre, les contrats et les durées

Le registre article 30 doit devenir le document central de pilotage. Il doit être mis à jour après l’ajout du Drive et à chaque changement de fournisseur ou de finalité.[7] La conservation de CV sans suppression automatique n’est acceptable qu’avec une gouvernance effective : rappels, décisions de maintien justifiées, suppression manuelle sur toutes les copies et preuve d’audit.

Les contrats doivent couvrir Manus, Resend, Stripe, Google et tout fournisseur IA ou de stockage utilisé pour le traitement. Pour les établissements clients, le rôle doit être déterminé mission par mission : responsable indépendant, responsable conjoint ou sous-traitant. Cette qualification ne peut pas être remplacée par une formule générique dans les CGU.[3]

### Priorité 4 — Encadrer strictement données de santé, IA et transferts internationaux

Le recrutement médical ne donne pas automatiquement le droit de collecter des données de santé. Les informations de vaccination, d’aptitude, de handicap, d’assurance ou de médecine du travail doivent être minimisées, séparées et juridiquement qualifiées. Une donnée de santé exige à la fois une base article 6 et une exception article 9 ; l’hébergement de données de santé dans le champ français doit être évalué avec un spécialiste.[8]

L’IA utilisée dans le recrutement doit rester un outil d’extraction et de préparation de revue humaine. Un système qui note, classe, filtre ou établit une shortlist avec une incidence matérielle sur l’accès à une mission est un cas d’emploi à haut risque au titre de l’AI Act ; les exigences renforcées applicables à l’emploi sont annoncées pour décembre 2027.[9] [10]

| Risque | Décision de prudence immédiate | Validation à obtenir |
|---|---|---|
| Documents médicaux | Bloquer ou rediriger tout dossier médical/patient non demandé | Avis RGPD/HDS et métier avant extension. |
| Score IA | Ne pas automatiser le rejet, l’exclusion ou la shortlist | Analyse AI Act/AIPD avant usage influençant la sélection. |
| Missions Moyen-Orient / Canada / Afrique | Informer avant transmission et cartographier les pays/destinataires | Mécanisme de transfert, clauses contractuelles types ou autre garantie appropriée. |
| Compte Google Drive | Accès limité au dossier, MFA, pas de partage public, revue des droits | Vérifier le contrat/DPA Google et la localisation des données. |

### Priorité 5 — Consolider les CGV et l’information du consommateur

La réservation de consultation payante implique une vérification des CGV B2C et de l’information précontractuelle. Elles doivent être cohérentes avec le prix TTC, la majoration horaire, les modalités d’exécution, le paiement, l’annulation/remboursement, le droit de rétractation ou son exception applicable, la médiation de la consommation et les modalités de règlement des litiges.[5] Cette revue est particulièrement importante avant toute communication commerciale ou campagne de réservation.

## 4. Plan d’action recommandé

| Délai | Action | Responsable suggéré | Preuve à conserver |
|---|---|---|---|
| **Sous 7 jours** | Mettre à jour les mentions légales au nom de la SARL avec les données Kbis vérifiées. | Gérant + conseil juridique | Copie Kbis, version datée de la page. |
| **Sous 7 jours** | Ajouter recrutement, portail, IA, établissements et Google Drive à la politique de confidentialité et aux mentions de collecte. | Gérant/DPO/conseil | Version datée, captures de formulaires. |
| **Sous 14 jours** | Mettre à jour le registre article 30, le tableau des sous-traitants, les transferts et la conservation synchronisée Drive/coffre. | Référent RGPD | Registre signé/versionné, liste des accès Drive. |
| **Sous 30 jours** | Réaliser un dépistage AIPD puis une AIPD complète si le risque élevé est confirmé. | DPO/conseil | Grille de dépistage, AIPD et plan de réduction de risque. |
| **Sous 30 jours** | Revoir les CGV B2C, annulation, médiation et information précontractuelle de la réservation. | Avocat droit de la consommation | CGV datées, médiateur identifié, parcours de réservation archivé. |
| **Avant tout partage international de CV** | Prévoir l’information candidat, qualifier les rôles et contractualiser les transferts. | Conseil juridique + commercial | Contrat établissement, annexe transfert, trace d’information. |
| **Trimestriel** | Revue des accès admin/Drive, exports, incidents, cookies, fournisseurs et conservation. | Référent sécurité/RGPD | Compte rendu de revue et journal d’audit. |

## 5. Ce qui est déjà à conserver comme preuve

Conservez les captures du bandeau de consentement, les versions des politiques, le registre, les contrats de sous-traitance, les journaux d’export Drive, les rapports de test sécurité, les preuves de revue humaine des analyses IA, la liste des accès Drive et les demandes RGPD traitées. En cas de violation, documentez systématiquement l’incident ; la notification à la CNIL doit être appréciée sans délai et, lorsqu’elle est requise, réalisée dans les 72 heures si possible.[11]

## Références

[1]: [CNIL — Réaliser une analyse d’impact relative à la protection des données](https://www.cnil.fr/fr/realiser-une-analyse-dimpact-si-necessaire)  
[2]: [CNIL — Registre des activités de traitement](https://www.cnil.fr/fr/RGPD-le-registre-des-activites-de-traitement)  
[3]: [CNIL — Comment bien identifier son rôle](https://www.cnil.fr/fr/rgpd-comment-bien-identifier-son-role)  
[4]: [CNIL — Guide du recrutement](https://www.cnil.fr/fr/le-guide-du-recrutement)  
[5]: [Service Public — Mentions obligatoires sur le site internet d’une société](https://entreprendre.service-public.gouv.fr/vosdroits/F37351)  
[6]: [Légifrance — Loi pour la confiance dans l’économie numérique](https://www.legifrance.gouv.fr/loda/id/JORFTEXT000000801164)  
[7]: [CNIL — Cookies et autres traceurs](https://www.cnil.fr/fr/cookies-et-autres-traceurs/que-dit-la-loi)  
[8]: [CNIL — Quelles formalités pour les traitements de données de santé](https://www.cnil.fr/fr/quelles-formalites-pour-les-traitements-de-donnees-de-sante)  
[9]: [Commission européenne — Cadre réglementaire de l’AI Act](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)  
[10]: [AI Act Service Desk — Employment](https://ai-act-service-desk.ec.europa.eu/en/employment-0)  
[11]: [CNIL — Notifier une violation de données personnelles](https://www.cnil.fr/fr/notifier-une-violation-de-donnees-personnelles)
