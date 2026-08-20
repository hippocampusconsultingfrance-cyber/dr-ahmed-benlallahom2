# Contrôle de contraste des jetons publics

Le test `client/src/lib/contrast.test.ts` contrôle les paires principales sur les thèmes sombre et clair : texte principal, gris secondaire, cyan primaire et doré d’accent. Il impose **4,5:1** pour le texte normal et **3:1** pour le cyan de repérage non destiné à porter seul une information textuelle fine.

| Jeton | Usage contrôlé | Seuil |
|---|---|---:|
| `foreground` / `background` | Texte principal | 4,5:1 |
| `muted-foreground` / `background` | Texte secondaire | 4,5:1 |
| `primary` / `background` | Cyan de repérage | 3:1 |
| `primary-foreground` / `primary` | Texte dans les CTA cyan | 4,5:1 |
| `accent-foreground` / `accent` | Texte sur accent doré | 4,5:1 |

> Une couleur d’accent ne doit pas être le seul vecteur d’une information importante. Lors d’une évolution de palette, mettre à jour les jetons et le test ensemble, puis vérifier les états focus, survol et désactivé dans les deux thèmes.
