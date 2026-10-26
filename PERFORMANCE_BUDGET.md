# Budget de performance public

Le contrôle `pnpm check:performance` construit la version de production puis mesure les fichiers JavaScript compressés avec gzip. Il protège l’impact des nouvelles images, animations et dépendances sur le chargement initial, tout en tenant compte du chargement différé du dashboard administratif. Il échoue aussi si un fichier JavaScript contient un attribut `data-loc` (chemin et ligne du code source, ajoutés autrefois par l’éditeur visuel Manus : CODE-06).

| Groupe | Budget gzip | Motif |
|---|---:|---|
| Entrée publique | 160 KiB | Conserver un chargement initial raisonnable pour les parcours publics. |
| Dashboard administratif différé | 60 KiB | Préserver le découpage du code non nécessaire aux visiteurs publics. |
| Route publique différée | 30 KiB | Éviter qu’une page isolée concentre une dépendance ou un média scripté disproportionné. |

Les illustrations restent dans le stockage statique externe et les visuels de Services/Réservation utilisent des variantes WebP responsives. Les animations doivent rester limitées à l’opacité et à la transformation, désactivables avec réduction de mouvement ou économie de données. Un dépassement de budget doit être expliqué, mesuré et corrigé avant publication.

## Mesure de référence — 20 août 2026

| Groupe | Mesure gzip | Budget | Résultat |
|---|---:|---:|---|
| Entrée publique | 131,1 KiB | 160 KiB | Conforme. |
| Dashboard administratif différé | 41,8 KiB | 60 KiB | Conforme. |
| Plus grande route publique mesurée (`LegalPage`) | 17,9 KiB | 30 KiB | Conforme. |

Ces valeurs sont issues de `pnpm check:performance` après construction de production. Elles constituent une référence de régression, non une mesure de performance réseau sur appareil réel.
