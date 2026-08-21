# Évaluation du rapport externe de sécurité et de conformité

**Date :** 21 août 2026  
**Statut :** document de travail — à faire relire par un avocat/DPO et, pour la stratégie d’hébergement, par un prestataire HDS qualifié.

> Je ne suis pas avocat ; cette analyse technique et réglementaire de travail ne constitue pas un avis juridique formel. Elle identifie les décisions qui nécessitent une validation professionnelle avant toute évolution engageante.

## Conclusion de l’évaluation

Le rapport transmis est **pertinent**. Il identifie correctement les zones à plus fort impact : qualification HDS d’un parcours de santé, séparation des contextes médical/RH, sécurité du dépôt documentaire, intégrations de messagerie et usage de l’IA en recrutement.

La conclusion doit toutefois être nuancée : l’obligation HDS dépend de la nature exacte des données traitées et hébergées, du rôle de chaque intervenant et du fait que l’hébergement soit réalisé pour le compte du patient ou de l’organisme collecteur. Il ne faut donc ni déclarer la plateforme conforme HDS sans audit ni conclure automatiquement qu’un simple parcours de réservation sans donnée clinique stockée relève de ce périmètre.

| Sujet du rapport | Évaluation | Position opérationnelle |
|---|---|---|
| Hébergement HDS | **Point majeur à qualifier avant tout stockage durable de données de santé.** L’ANS rappelle l’obligation de certification pour l’hébergement de données de santé à caractère personnel recueillies dans un contexte de prévention, diagnostic, soins ou suivi, lorsqu’il est réalisé pour le compte du producteur, du patient ou d’un tiers. [1] | Ne pas étendre l’actuel hébergement à des dossiers patients, pièces cliniques ou messagerie médicale. Cartographier les flux, déterminer le périmètre HDS avec un conseil compétent et préparer une migration HDS si nécessaire. |
| Données de santé et RGPD | **Point valide.** Les données de santé sont sensibles ; leur traitement doit reposer sur une exception applicable, être documenté et inscrit au registre. [2] | Maintenir la minimisation et éviter toute zone de texte invitant à transmettre des informations médicales détaillées hors environnement validé. |
| Mélange médical/RH | **Risque architectural réel, sans fuite croisée démontrée.** Les finalités et destinataires diffèrent fortement. | Préserver les contrôles côté serveur existants, poursuivre la séparation logique des rôles/tables/journaux et prévoir une séparation d’infrastructure si le parcours médical devient un vrai système de données patients. |
| Dépôt de documents candidats | **Point valide, avec protections déjà présentes.** Le serveur exige une session candidate, Turnstile, limitation persistante, validation structurale, chiffrement AES-256-GCM et stockage privé en quarantaine. | L’antivirus dédié reste une limite explicitement connue : le statut est `unavailable` tant qu’aucun moteur persistant ou service externe sous contrat de sous-traitance n’est validé. Aucun document ne doit être présenté comme analysé antivirus avant cette activation. |
| WAF et contrôle d’accès | **Point valide.** Une protection purement frontend serait insuffisante. | Les contrôles sensibles restent côté serveur : session candidate, vérification Turnstile, limitation persistante, procédures protégées/admin et validation de webhook Stripe. Continuer à ne jamais faire reposer une autorisation sur React seul. |
| WhatsApp | **Point de gouvernance à formaliser.** | Réserver WhatsApp à la coordination administrative non clinique ; interdire les diagnostics, comptes rendus, ordonnances, résultats et documents de santé. Évaluer une messagerie sécurisée adaptée si un échange médical devient nécessaire. |
| IA de recrutement | **Point valide.** La CNIL rappelle que les données collectées doivent avoir un lien direct et nécessaire avec le poste et que la minimisation est impérative. [3] | Conserver l’IA comme aide à la lecture, sans décision automatisée d’embauche. Étudier la pseudonymisation avant analyse et réduire les champs non nécessaires à l’évaluation professionnelle. |

## Feuille de route recommandée

| Priorité | Action | Dépendance |
|---|---|---|
| P0 | Réaliser une cartographie des données médicales réellement collectées : réservation, contact, email, pièces jointes, prestataires et sauvegardes. | Validation DPO/conseil juridique. |
| P0 | Établir une règle de produit : aucun dossier médical ni document clinique ne doit être déposé ou conservé sur l’hébergement actuel tant que la qualification HDS n’est pas achevée. | Gouvernance interne. |
| P1 | Obtenir une décision sur la cible HDS, son périmètre et les contrats de sous-traitance avant d’ouvrir des fonctionnalités cliniques enrichies. | Choix d’hébergeur et audit juridique/technique. |
| P1 | Choisir une solution antivirus adaptée : hébergement réservé avec scanner persisté ou prestataire externe validé contractuellement. | Budget, DPA, analyse de transfert des documents. |
| P1 | Rédiger et faire appliquer une charte de messagerie : WhatsApp administratif uniquement, redirection vers un canal adapté pour toute donnée médicale. | Politique interne et formation. |
| P1 | Lancer une analyse d’impact et une revue de minimisation de l’ATS/IA : données envoyées, conservation, explication, intervention humaine et risque de discrimination. | DPO, processus métier et contrats IA. |

## Ce qui est déjà couvert dans le projet

Le projet dispose d’un contrôle d’accès serveur, d’une MFA pour l’administration, d’une protection Turnstile et de limites de tentatives persistantes, d’un chiffrement applicatif des documents sensibles, de journaux de sécurité, de contrôles de type/contenu pour les documents et d’une réconciliation Stripe côté serveur. La CI GitHub vérifie désormais le typage, un profil de tests sans secrets réels et l’audit des dépendances de production.

Ces mesures réduisent la surface d’attaque, mais **ne remplacent pas** la qualification HDS, l’antivirus opérationnel, une revue DPO/avocat ou les validations d’hébergement et de sous-traitance.

## Références

[1] [Agence du numérique en santé — Certification HDS](https://esante.gouv.fr/produits-services/hds)  
[2] [CNIL — Formalités applicables aux traitements de données de santé](https://www.cnil.fr/fr/quelles-formalites-pour-les-traitements-de-donnees-de-sante)  
[3] [CNIL — Minimisation des données candidates lors d’un recrutement](https://www.cnil.fr/fr/recrutement-la-cnil-met-en-demeure-une-societe-de-minimiser-la-collecte-de-donnees-personnelles-de)
