# Diagnostic de la navigation administrateur

**Source analysée :** capture panoramique du 21 août 2026, découpée en cinq sections avec chevauchement.

## Notes de lecture

| Sections lues | Constat vérifié |
|---|---|
| 1–2 (gauche vers centre-gauche) | L’en-tête est lisible. Les onglets de début de liste sont présentés sur une seule ligne horizontale avec une largeur cumulative très importante. La liste continue au-delà de chaque tuile, confirmant qu’elle ne possède pas de regroupement ou de second niveau visible. |
| 3–4 (centre vers centre-droit) | L’onglet actif est lisible, mais la jonction entre **Documents candidats** et **Sécurité** ne contient pas d’espace visible : les deux libellés se touchent. Les onglets suivants restent sur la même ligne, ce qui confirme une saturation horizontale de la barre. |
| 5 (droite) | Les derniers onglets, dont **Questions santé**, sont tronqués visuellement à droite. Le problème est structurel : une liste d’onglets trop longue est affichée sans espacement minimal, retour contrôlé à la ligne, défilement horizontal explicite ou regroupement. |

## Conclusion

Le chevauchement est confirmé. La correction doit remplacer la ligne unique actuelle par une navigation d’onglets à défilement horizontal accessible, avec des éléments `shrink-0`, un espace constant entre onglets et un dégradé indicateur aux bords sur petit écran. Les libellés ne seront ni coupés ni collés entre eux.
