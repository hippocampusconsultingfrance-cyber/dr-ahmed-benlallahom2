# Kit de marque — Dr. Ahmed Ben Lallahom & Hippocampus Consulting

Ce document est le référentiel de travail pour toute évolution visuelle du site, des emails, des factures et des supports professionnels. Il décrit les choix déjà appliqués dans l’interface et doit être consulté avant de créer une nouvelle page ou un nouveau modèle de communication.

> **Positionnement.** Une identité médicale premium, calme et internationale, associant l’autorité clinique à une approche numérique sécurisée. Le ton doit être précis, humain et sobre ; il ne doit jamais promettre un résultat médical ou de recrutement.

## 1. Architecture de marque

| Élément | Usage approuvé | Règle principale |
|---|---|---|
| **ABL / Dr. Ben Lallahom** | Consultations, profil professionnel, informations médicales et administratives. | Utiliser le nom complet lors de la première mention. |
| **Hippocampus Consulting** | Recrutement médical et paramédical international, vivier et briefs employeurs. | Employer le nom complet dans les pages publiques et les emails. |
| **Signature** | `ABL / HIPPOCAMPUS` | Réservée aux micro-libellés, en capitales espacées. |
| **Logo AB** | Navigation, footer et documents officiels. | Ne pas étirer, recolorer arbitrairement ni placer sur un fond insuffisamment contrasté. |

## 2. Palette de couleurs

Les variables ci-dessous sont les valeurs de production au format OKLCH. Elles doivent être utilisées par tokens (`bg-background`, `text-foreground`, `bg-primary`) plutôt que recopiées en couleur brute dans les composants.

| Rôle | Thème sombre | Thème clair | Usage |
|---|---|---|---|
| Fond | `oklch(0.12 0.02 250)` | `oklch(0.98 0.005 250)` | Arrière-plan général. |
| Surface | `oklch(0.15 0.025 250)` | `oklch(1 0 0)` | Cartes, panneaux et dialogues. |
| Texte principal | `oklch(0.95 0.005 250)` | `oklch(0.15 0.02 250)` | Titres et contenus prioritaires. |
| Cyan ABL | `oklch(0.75 0.15 220)` | `oklch(0.55 0.2 220)` | CTA principal, focus, icônes et repères interactifs. |
| Or médical | `oklch(0.72 0.1 75)` | `oklch(0.65 0.12 75)` | Badge de statut ou signature, avec parcimonie. |
| Erreur | `oklch(0.577 0.245 27.325)` | Identique | Validation critique et sécurité. |

Le noir OLED est une préférence optionnelle du thème sombre. Il conserve le cyan, l’or et les niveaux de texte ; seul le niveau des fonds est approfondi.

## 3. Typographie et hiérarchie

| Niveau | Police | Utilisation |
|---|---|---|
| Titres éditoriaux | **Playfair Display** | Nom, hero, titres de pages et messages exceptionnels. |
| Interface et lecture | **DM Sans** | Navigation, formulaires, tableaux, paragraphes et emails HTML. |
| Micro-libellé | DM Sans, capitales espacées | Signature ABL / HIPPOCAMPUS, catégories et repères. |

Les titres doivent exprimer un bénéfice concret. Les paragraphes conservent un interlignage confortable ; le mode de lisibilité renforcée augmente localement la taille et les contrastes sans modifier la structure.

## 4. Icônes, formes et mouvement

Les icônes proviennent de Lucide et doivent rester linéaires, simples et liées à l’action qu’elles représentent. Les contours de cartes sont fins, les rayons sont modérés (`0.5rem` de base), et les ombres sont bleutées et diffuses.

Le motif ECG sert de signature décorative ; il ne doit pas être présenté comme une donnée médicale ou un résultat clinique. Les animations sont brèves et facultatives. Elles s’arrêtent pour `prefers-reduced-motion` ou lorsque le navigateur signale une économie de données.

## 5. Composants et règles d’usage

| Composant | Bon usage | À éviter |
|---|---|---|
| CTA primaire cyan | Une action principale par zone : réserver, envoyer, continuer. | Deux CTA primaires concurrents dans une même carte. |
| CTA secondaire contour | Retour, information complémentaire, action non destructive. | L’employer pour un paiement ou une suppression. |
| Carte sombre avec liseré cyan | Réassurance, résumé, métriques, contenu organisé. | Empiler des paragraphes longs sans structure. |
| Badge or | Signal de contexte ou de spécialité. | L’utiliser comme élément décoratif répétitif. |
| Alerte ambre | Urgence ou attention pratique. | Donner un conseil médical personnalisé. |

## 6. Ton rédactionnel

Le ton doit être direct, respectueux et compréhensible dans les quatre langues. Les informations médicales restent générales, invitent à contacter les urgences en cas de danger immédiat et évitent tout diagnostic. Pour Hippocampus Consulting, l’IA doit être décrite comme une **aide à l’organisation et à la revue**, jamais comme un décideur.

## 7. Accessibilité et contrôle qualité

Avant toute publication, vérifier que les actions disposent d’un libellé explicite, d’un focus visible et d’une zone tactile adaptée. L’interface doit rester lisible en thème clair, sombre, OLED et lisibilité renforcée. Les visuels doivent avoir une alternative descriptive ou une alternative vide lorsqu’ils sont purement décoratifs.

La checklist de contrôle doit inclure l’affichage mobile, la navigation clavier, l’absence de détail technique dans les erreurs, le respect du consentement analytique et l’absence de contenu fabriqué tel que témoignage, note ou résultat clinique.
