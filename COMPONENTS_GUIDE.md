# Guide des composants et conventions d’interface

Ce guide décrit les composants d’interface à privilégier pour les évolutions du site du Dr. Ahmed Ben Lallahom et d’Hippocampus Consulting. Il complète la documentation technique du projet ; il ne remplace pas les contrôles de sécurité, d’autorisation ou de conformité applicables aux données de santé et de recrutement.

## Principes de contribution

Les nouveaux parcours publics doivent conserver la navigation partagée, les métadonnées appropriées et une sortie claire vers l’accueil ou le parcours parent. Les écrans administratifs et candidats doivent préserver les contrôles de rôle déjà placés côté serveur. Aucune interface ne doit présenter l’IA comme une décision de recrutement ou de soin.

| Sujet | Convention à appliquer |
|---|---|
| Langues | Utiliser `useLanguage()` et une copie `fr` / `en` / `de` / `zh`. Les contenus d’e-mail de recrutement restent volontairement limités au français et à l’anglais. |
| Dates | Conserver les dates en UTC côté données, puis formater avec la locale active et le fuseau Europe/Paris lorsque le contexte métier l’exige. |
| États | Prévoir chargement, erreur, absence de données et succès. Les erreurs publiques ne doivent jamais révéler le détail retourné par le serveur. |
| Accessibilité | Associer chaque champ à son libellé, nommer les boutons composés d’icônes, conserver le focus visible et respecter `prefers-reduced-motion`. |
| Données sensibles | Ne jamais placer de CV, document candidat, donnée de contact ou résultat d’analyse IA dans une URL, un journal client ou un stockage navigateur. |

## Composants partagés prioritaires

| Composant | Usage recommandé | Points de vigilance |
|---|---|---|
| `Navigation.tsx` | En-tête des parcours publics. | Préserver les libellés clavier localisés, le sélecteur de langue et la restitution de focus du menu mobile. |
| `Footer.tsx` | Pied de page des parcours publics. | Réutiliser le titre de contact localisé et des alternatives pertinentes pour les logos. |
| `SEOHead.tsx` | Métadonnées des pages routées. | Définir titre, description, canonical et no-index pour les confirmations, erreurs et parcours sensibles. |
| `Breadcrumb.tsx` | Repère de navigation sur une sous-page publique. | Éviter les chemins sans sortie vers l’accueil ; localiser les libellés. |
| `PublicContentSkeleton.tsx` | Chargement des pages et listes publiques. | Fournir un `label` accessible localisé et ne pas masquer un formulaire entier plus longtemps que nécessaire. |
| `AdminStatePanel.tsx` | Chargement, erreur ou absence de données dans l’administration. | Employer un titre utile et une explication ; ne pas afficher une erreur technique brute. |
| `CookieConsent.tsx` | Gestion du consentement non essentiel. | Ne pas précocher un consentement ; Échap et restitution de focus doivent rester fonctionnels. |
| `TurnstileWidget.tsx` | Protection anti-bot des formulaires exposés. | L’échec du widget doit bloquer la soumission côté serveur, sans divulguer de détail de configuration. |
| `ThemeContext.tsx` | Thème, OLED et lisibilité renforcée. | Les préférences doivent persister ; la lisibilité renforcée neutralise les animations décoratives non essentielles. |

## Parcours de recrutement et candidat

Les composants `RecruitmentTab.tsx`, `VivierTab.tsx`, `MailingTab.tsx`, `EmployerBriefsTab.tsx`, `CandidateDocumentsAdminTab.tsx` et `Candidate360Dialog.tsx` traitent des données à accès contrôlé. Toute extension doit conserver le consentement marketing, les restrictions administratives, la traçabilité des exportations et l’information selon laquelle l’analyse IA est une aide à la revue humaine.

Le portail candidat et ses pages d’accès utilisent une copie partagée pour l’inscription, l’activation et la réinitialisation. Les documents restent protégés par le coffre documentaire : l’interface ne doit afficher que les métadonnées et actions autorisées par la procédure serveur.

## Validation avant publication

Toute modification d’interface doit être accompagnée d’un test ciblé. Les modifications de copie ou de composant partagé requièrent en plus une vérification des quatre langues actives. Avant publication, exécuter la suite de tests et vérifier la route affectée dans une largeur bureau et mobile lorsque le rendu est modifié.

> Les témoignages, logos de partenaires et autres contenus attribués à des tiers ne doivent être ajoutés qu’à partir d’une source autorisée. Aucun avis, résultat clinique ou donnée candidat ne doit être simulé.
