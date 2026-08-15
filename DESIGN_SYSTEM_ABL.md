# Kit de Marque et Système de Design — Dr. Ahmed Ben Lallahom (Hippocampus Consulting)

Ce document formalise les fondements visuels, ergonomiques et techniques de l’identité **Precision Medicine & International Leadership** déployée sur le site professionnel du Dr. Ahmed Ben Lallahom.

## 1. Principes Fondateurs

L’identité visuelle repose sur le concept de **« Midnight Authority »**, fusionnant la rigueur clinique d’un médecin réanimateur et la vision stratégique d’un entrepreneur en santé internationale [1]. 

- **Atmosphère nocturne profonde :** Fonds sombres sophistiqués évoquant la précision des moniteurs de soins intensifs (ICU).
- **Lisibilité médicale :** Contraste élevé, typographie éditoriale serif pour l’autorité et sans-serif neutre pour la clarté des données.
- **Accents fonctionnels :** Cyan médical lumineux pour le monitorage et l’interactivité, Or prestige pour les repères institutionnels.

## 2. Palette de Couleurs et Tokens CSS

| Rôle | Nom du Token / Classe | Valeur / Rendu | Usage Principal |
| :--- | :--- | :--- | :--- |
| **Fond principal** | `--background` | `oklch(0.12 0.02 240)` | Arrière-plan global de l'application |
| **Surface de carte** | `--card` | `oklch(0.16 0.03 240)` | Conteneurs, panneaux hero et fiches de service |
| **Texte principal** | `--foreground` | `oklch(0.98 0.005 240)` | Titres et corps de texte à fort contraste |
| **Accent médical** | `--primary` | `oklch(0.72 0.16 210)` | Boutons principaux, liens, curseurs et indicateurs ECG |
| **Or prestige** | `--accent` | `oklch(0.78 0.14 85)` | Numéros monumentaux et badges d'excellence |

## 3. Typographie

- **Titres et Affichage :** `Playfair Display` (serif éditorial), conférant une stature académique et haut de gamme.
- **Corps et Interface :** `Inter` ou polices sans-serif système normalisées, garantissant une lisibilité optimale sur écrans médicaux et mobiles.

## 4. Composants et Grammaire Visuelle

- **Rail ECG :** Ligne verticale continue reliant les blocs de contenu ou encadrant les tunnels de conversion (ex. : page de réservation) pour rappeler l'ancrage en anesthésie-réanimation.
- **Panneaux Hero (`.hero-panel`) :** Surfaces semi-transparentes avec effet de flou arrière-plan (`backdrop-blur-xl`), bordures lumineuses dégradées et espacements généreux.
- **Boutons d'action (`.cta-primary`) :** Dégradés cyan fluides, ombre portée subtile et micro-interaction d’échelle au clic (`active:scale-[0.97]`).

## 5. Accessibilité et Ergonomie Responsive

- **Respect des contrastes :** Conforme aux exigences WCAG AA pour le mode sombre et le mode clair.
- **Navigation tactile :** Zones d'interaction élargies (minimum 44x44px) sur mobile et tablettes.
- **Réduction des mouvements :** Prise en compte de la règle `@media (prefers-reduced-motion: reduce)`.

---
*Référence de conception : Hippocampus Consulting — Système validé pour la production [1].*

## 6. Échelle d’Espacement et Conventions

Le système utilise une base de **4 px** afin de conserver une cadence régulière entre les zones denses d’interface et les compositions éditoriales. Les classes Tailwind existantes restent la source de vérité dans les composants React ; les valeurs ci-dessous servent de guide de conception et de revue.

| Token conceptuel | Valeur | Usage recommandé |
| :--- | :--- | :--- |
| `space-1` | 4 px | Écart entre icône et libellé court |
| `space-2` | 8 px | Écart interne de badge, label ou champ compact |
| `space-3` | 12 px | Écart entre label et aide contextuelle |
| `space-4` | 16 px | Padding standard de contrôle et écart de formulaire |
| `space-6` | 24 px | Séparation entre champs groupés et cartes compactes |
| `space-8` | 32 px | Respiration d’un bloc éditorial court |
| `space-12` | 48 px | Séparation entre sous-sections |
| `space-16` | 64 px | Respiration principale d’une section desktop |
| `space-24` | 96 px | Transition forte entre sections publiques |

Les **panneaux** utilisent généralement `p-5` à `p-8`, les **formulaires** `space-y-6`, les **grilles de cartes** `gap-4` à `gap-6`, et les **sections publiques** `py-16` à `py-24`. Sur mobile, les espacements verticaux sont réduits d’un niveau lorsque cela évite une page excessivement longue, sans réduire les zones tactiles ni les marges de lisibilité.

## 7. Conventions des Composants

| Composant | Convention | Règle de qualité |
| :--- | :--- | :--- |
| Hero | `.hero-panel` + `.eyebrow-label` + CTA primaire | Un message d’autorité, une preuve clinique et une action principale |
| CTA primaire | `.cta-primary` | Contraste élevé, état actif visible, texte explicite et action réversible |
| Carte éditoriale | `.editorial-card` ou `card-premium` | Un titre court, une information hiérarchisée et un repère visuel |
| Rail ECG | `.booking-rail`, `.ecg-divider` ou `.timeline-rail` | Organise une séquence ; ne doit pas être utilisé comme décoration isolée |
| Champ de formulaire | `.form-field-premium` | Label associé par `htmlFor`, focus visible, erreur compréhensible |
| État système | `.payment-state`, `.availability-status` | Indique l’état, explique la suite et propose une sortie claire |
| Navigation | `.site-nav`, `.nav-link`, `.nav-control` | Accessible au clavier, utilisable au toucher et cohérente avec le thème |

Chaque nouveau composant public doit prévoir ses états **normal, hover, focus-visible, actif, désactivé, chargement, erreur et vide** lorsque ces états sont pertinents. Toute animation doit rester secondaire au contenu et respecter `prefers-reduced-motion`.
