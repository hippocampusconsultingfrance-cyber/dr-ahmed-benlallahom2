# Guide d’utilisation des composants partagés

Ce guide décrit les composants à privilégier lors des évolutions du site. Il évite la duplication des règles de navigation, de consentement, de SEO, de sécurité et de lisibilité. Toute nouvelle page publique doit conserver une sortie claire vers la navigation, le footer et le contenu principal ciblé par `SkipToContent`.

| Composant | Responsabilité | Règle d’évolution |
|---|---|---|
| `Navigation` | Navigation publique, langue, thèmes, lisibilité et menus. | Préserver les libellés dans les quatre langues, le focus et la fermeture au clavier. |
| `Footer` | Liens institutionnels et repères légaux. | Ajouter un lien public ici seulement après que sa route et son contenu sont validés. |
| `SEOHead` | Titre, description et métadonnées de partage. | Renseigner un titre concis, une description exacte et une URL canonique par page publique. |
| `Breadcrumb` | Repérage des sous-parcours. | Utiliser sur les pages denses ou transactionnelles ; ne pas fabriquer de niveau intermédiaire. |
| `PageTransition` | Transition visuelle de route. | Limiter le mouvement ; respecter `prefers-reduced-motion` et l’économie de données. |
| `CookieConsent` et `AnalyticsConsent` | Consentement des finalités non essentielles. | Ne jamais activer l’analytique avant le consentement ; conserver l’accès aux préférences. |
| `TurnstileWidget` | Protection anti-bot des formulaires sensibles. | Ne pas retirer d’un parcours candidat, d’inscription ou de réinitialisation sans revue de sécurité. |
| `ErrorBoundary` et `PublicContentSkeleton` | Résilience de l’interface. | Préserver des messages accessibles, sans détail technique ni donnée sensible. |
| `ContactSection` et `GDPRRequestForm` | Formulaires publics avec libellés centralisés. | Réutiliser `publicFormCopy.ts` et les identifiants de champ stables. |

## Checklist d’intégration

Avant d’introduire un composant ou une page, vérifier l’accessibilité clavier, les états de chargement/erreur, la traduction FR/EN/DE/ZH et la compatibilité avec `pnpm validate:precheckpoint`. Les contenus liés à la santé, à des partenaires ou à des témoignages doivent respecter les registres applicables et ne pas être inventés ; une information de santé générale cite sa source et sa date de vérification, sans diagnostic, décision individualisée ou promesse thérapeutique.

> Les composants administratifs et candidats accèdent à des données sensibles : leur évolution doit conserver l’autorisation côté serveur, l’audit et l’absence de décision automatisée de recrutement.
