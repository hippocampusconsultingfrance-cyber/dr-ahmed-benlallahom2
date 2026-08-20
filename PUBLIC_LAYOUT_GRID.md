# Grille responsive des pages publiques

Les pages publiques utilisent la primitive `.container` définie dans `client/src/index.css`. Elle fournit une largeur fluide centrée, une marge latérale de 1 rem par défaut, de 1,5 rem à partir de 640 px et de 2 rem avec une largeur maximale de 1280 px à partir de 1024 px. Les pages éditoriales peuvent appliquer un `max-w-*` local afin de réduire la longueur de lecture sans perdre les gouttières communes.

| Palier | Gouttières | Règle de contenu |
|---|---:|---|
| Mobile `< 640 px` | 1 rem | Une colonne par défaut ; cartes et actions en pile. |
| Tablette `≥ 640 px` | 1,5 rem | Plusieurs colonnes seulement lorsque les éléments conservent une largeur exploitable. |
| Bureau `≥ 1024 px` | 2 rem | Conteneur centré, plafonné à 1280 px ; `max-w-*` optionnel pour le contenu éditorial. |

> Une nouvelle page publique doit employer `.container` ou un wrapper centré `mx-auto max-w-*` qui conserve les mêmes gouttières. Les captures desktop et mobile de la matrice visuelle permettent de détecter les dérives de largeur, de décalage ou de chevauchement.
