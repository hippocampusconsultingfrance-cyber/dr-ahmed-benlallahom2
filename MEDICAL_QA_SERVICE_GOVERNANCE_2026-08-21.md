# Gouvernance — service gratuit de questions sur l’anesthésie et l’opération

**Version :** 1.0 — 21 août 2026  
**Statut :** cadre produit à appliquer dans l’interface et à faire relire par le DPO/conseil juridique avant toute extension clinique.

> Le service apporte une information générale et ne remplace ni une consultation, ni une évaluation préopératoire, ni une prise en charge urgente. Une réponse n’est envoyée et publiée qu’après validation explicite du médecin.

## Finalité et limites du service

Le service permet à une personne de demander gratuitement une explication générale sur l’anesthésie, la préparation d’une opération ou le déroulement habituel d’un parcours de soins. Les réponses doivent rester pédagogiques, générales, prudentes et sans diagnostic individuel, prescription, indication thérapeutique personnalisée ni instruction d’urgence.

| Règle produit | Application concrète |
|---|---|
| Pas un service d’urgence | Avertissement permanent, case de compréhension obligatoire et rappel de contacter les secours locaux en cas d’urgence ou de symptôme inquiétant. En France, le 15 et le 112 orientent vers une réponse adaptée en situation urgente. [1] |
| Pas de consultation à distance | Aucun créneau, ordonnance, diagnostic ou décision clinique n’est généré par le formulaire ni par l’IA. |
| Réponse humaine obligatoire | L’IA améliore uniquement la clarté et la syntaxe du brouillon rédigé par l’administrateur ; elle ne répond jamais directement à la personne et ne déclenche aucun envoi. |
| Public seulement après contrôle | Une publication est possible uniquement après validation médicale, anonymisation manuelle et consentement distinct de la personne. |
| Gratuité transparente | La page indique sans ambiguïté que le service est gratuit et qu’il s’agit d’une réponse d’information. |

## Données, consentement et publication

Le formulaire collecte le prénom, le nom, l’email et le numéro de téléphone afin de traiter la demande et de joindre la personne. Ces coordonnées ne doivent jamais être visibles sur la page publique, dans l’URL, dans l’email de publication ou dans le texte généré pour l’IA. Une question libre peut révéler une donnée de santé : le traitement doit donc être minimisé, inscrit au registre et documenté avec sa base juridique et, le cas échéant, une analyse d’impact. La CNIL rappelle que les données de santé sont sensibles et que le responsable doit pouvoir démontrer sa conformité. [2]

| Donnée | Accès | Publication | Conservation prévue |
|---|---|---|---|
| Prénom, nom, email, téléphone | Administrateur autorisé uniquement | Jamais | Durée configurable, avec mécanisme de suppression RGPD existant |
| Question originale | Administrateur autorisé uniquement | Jamais telle quelle | Durée configurable, avec piste d’audit |
| Version publique de la question | Administrateur autorisé uniquement avant publication | Oui, après anonymisation et consentement | Tant que publiée ou jusqu’au retrait |
| Réponse médicale validée | Administrateur autorisé uniquement avant publication | Oui, après validation humaine | Tant que publiée ou jusqu’au retrait |
| Suggestion de style IA | Administrateur uniquement | Jamais | Non conservée comme décision médicale autonome |

La personne dispose de deux consentements distincts : le premier pour traiter sa demande et lui répondre par email ; le second, facultatif, pour publier une version anonymisée de la question et de la réponse après validation médicale. Si le second n’est pas accordé, l’administrateur peut envoyer l’email mais le bouton de publication reste indisponible.

## Parcours de modération

1. La personne envoie sa question après validation anti-bot, information urgente, confidentialité et consentement au traitement.
2. La demande arrive au statut `submitted`, sans publication ni réponse automatique.
3. Dans l’administration, le médecin consulte les coordonnées privées et la question originale. Il rédige sa réponse.
4. Sur demande, l’IA fournit uniquement une **proposition de reformulation** de la réponse ; le médecin garde, modifie ou ignore cette proposition.
5. Le médecin crée une version publique anonymisée de la question et de la réponse, vérifie qu’elle ne contient aucun identifiant ni détail clinique individualisant, puis choisit l’action adaptée : envoyer seulement, ou envoyer et publier.
6. Le système journalise l’auteur, la date, l’action d’envoi et l’action de publication. Aucun message ne part et aucune page publique ne s’actualise avant cette validation.

## Mesures techniques obligatoires

Le service réutilise la vérification Turnstile, les limites persistantes par IP/email, les procédures réservées à l’administration, les journaux d’audit et les erreurs génériques du projet. Les textes envoyés au modèle ne doivent inclure ni nom, ni prénom, ni email, ni téléphone. L’IA reçoit uniquement le brouillon de réponse saisi par l’administrateur et une consigne de correction rédactionnelle, sans création de contenu médical nouveau.

## Sources

[1] [Service-Public.fr — Numéros et orientation en cas d’urgence](https://www.service-public.gouv.fr/particuliers/vosdroits/F33954)  
[2] [CNIL — Formalités applicables aux traitements de données de santé](https://www.cnil.fr/fr/quelles-formalites-pour-les-traitements-de-donnees-de-sante)  
[3] [Santé.fr — Service public d’information en santé](https://www.sante.fr/)
