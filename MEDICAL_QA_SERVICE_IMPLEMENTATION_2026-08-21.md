# Mise en œuvre — questions gratuites sur l’anesthésie et l’opération

**Date :** 21 août 2026  
**Statut :** service publié sous contrôle médical humain.

## Expérience proposée

La page publique `/questions-anesthesie` met en valeur un service gratuit d’information générale. Elle explique clairement qu’il ne s’agit ni d’une consultation, ni d’un service d’urgence, ni d’un outil de diagnostic. Elle recueille le prénom, le nom, l’email, le téléphone et la question de la personne ; ces éléments restent exclusivement privés. Le formulaire impose une vérification anti-bot, la confirmation de compréhension des urgences et le consentement au traitement de la demande.

| Parcours | Garantie appliquée |
|---|---|
| Question publique | Turnstile, limite persistante de trois demandes par 24 heures pour le même sujet IP/email, champ leurre, longueur minimale et journalisation de sécurité. |
| Réponse médicale | L’administrateur protégé par MFA rédige et relit la réponse. Rien n’est envoyé automatiquement. |
| Assistance IA | `gpt-5-mini` est disponible côté serveur uniquement pour reformuler le brouillon ; le prompt interdit d’ajouter un fait médical, un diagnostic, un traitement ou un conseil personnalisé. Les motifs email/téléphone sont retirés avant l’appel. |
| Email | L’envoi est réalisé uniquement après clic explicite de l’administrateur, avec un rappel que la réponse reste une information générale. |
| Publication | La publication exige un consentement distinct, une question anonymisée et une réponse anonymisée. Les coordonnées ne figurent jamais dans la requête publique. |

## Administration

L’onglet **Questions santé** de `/admin` permet de consulter les demandes privées, préparer la réponse, solliciter une reformulation rédactionnelle, enregistrer un brouillon, puis envoyer par email. Lorsqu’un accord de publication a été donné, l’administrateur peut choisir simultanément la publication de la version anonymisée. Les actions de dépôt, brouillon, envoi et publication sont journalisées.

## Limites à maintenir

Le service ne doit pas être utilisé pour une urgence, une situation clinique individuelle, l’envoi de documents médicaux ou une décision thérapeutique. L’assistance IA ne doit jamais être présentée comme un médecin ou une source de réponse autonome. Le régime applicable à la collecte de questions pouvant contenir des données de santé et la qualification de l’hébergement doivent rester soumis à validation DPO/juridique. La CNIL rappelle que les données de santé sont sensibles et que le responsable du traitement doit pouvoir démontrer sa conformité. [1]

En France, le Service-Public indique que le 15 ou le 112 permettent une orientation en situation urgente ; le formulaire invite donc à contacter les secours ou un professionnel sans attendre un email. [2]

## Validation réalisée

Le modèle de reformulation a été vérifié avec un brouillon générique non personnel ; il a renvoyé une reformulation sans ajout clinique. Les tests dédiés vérifient la suppression des coordonnées du contenu transmis au modèle, la nécessité de MFA, de consentement de publication, de Turnstile et d’un envoi explicite. La compilation TypeScript, les tests ciblés et le build de production ont été validés.

## Références

[1] [CNIL — Formalités applicables aux traitements de données de santé](https://www.cnil.fr/fr/quelles-formalites-pour-les-traitements-de-donnees-de-sante)  
[2] [Service-Public.fr — Numéros et orientation en cas d’urgence](https://www.service-public.gouv.fr/particuliers/vosdroits/F33954)
