# Budget de performance public

Le contrôle `pnpm check:performance` construit la version de production puis mesure, compressés avec gzip, tous les fichiers JavaScript et la feuille de style. Il protège l’impact des nouvelles images, animations et dépendances sur le chargement initial, tout en tenant compte du chargement différé du dashboard administratif. Il échoue aussi si un fichier JavaScript contient un attribut `data-loc` (chemin et ligne du code source, ajoutés autrefois par l’éditeur visuel Manus : CODE-06).

| Groupe | Budget gzip | Motif |
|---|---:|---|
| Entrée publique | 160 KiB | Conserver un chargement initial raisonnable pour les parcours publics. |
| Dashboard administratif différé | 80 KiB | Préserver le découpage du code non nécessaire aux visiteurs publics (60 KiB jusqu’en octobre 2026, voir ci-dessous). |
| Route différée | 30 KiB par fichier | Éviter qu’une page isolée concentre une dépendance ou un média scripté disproportionné. Chaque page chargée à la demande est mesurée, quel que soit son nom (tout fichier que Vite charge par `import()`, hors dashboard). |
| Dépendance partagée | 30 KiB par fichier | Tout autre fichier hors entrée (textes, icônes, catégories de documents…), téléchargé avec chacune des pages qui l’importent. |
| Feuille de style (CSS total) | 30 KiB | Chargée avant l’affichage de toute page. |

Les illustrations restent dans le stockage statique externe et les visuels de Services/Réservation utilisent des variantes WebP responsives. Les animations doivent rester limitées à l’opacité et à la transformation, désactivables avec réduction de mouvement ou économie de données. Un dépassement de budget doit être expliqué, mesuré et corrigé avant publication.

## Mesure de référence — 20 août 2026

| Groupe | Mesure gzip | Budget | Résultat |
|---|---:|---:|---|
| Entrée publique | 131,1 KiB | 160 KiB | Conforme. |
| Dashboard administratif différé | 41,8 KiB | 60 KiB | Conforme. |
| Plus grande route publique mesurée (`LegalPage`) | 17,9 KiB | 30 KiB | Conforme. |

Ces valeurs sont issues de `pnpm check:performance` après construction de production. Elles constituent une référence de régression, non une mesure de performance réseau sur appareil réel.

## Mesure du 26 octobre 2026 — contrôle ajouté à la CI

Depuis cette date, la CI (`.github/workflows/ci.yml`, job *quality*) lance la même mesure après `pnpm build` (`node scripts/check-performance-budgets.mjs`) : un dépassement fait échouer la vérification.

| Groupe | Mesure gzip | Budget | Résultat |
|---|---:|---:|---|
| Entrée publique | 145,1 KiB | 160 KiB | Conforme. |
| Dashboard administratif différé | 76,5 KiB | 80 KiB | Conforme après relèvement (dépassait les 60 KiB). |
| Plus grande route publique mesurée (`LegalPage`) | 19,3 KiB | 30 KiB | Conforme. |

Le dashboard administratif avait dépassé les 60 KiB sans que rien ne le signale, le contrôle ne tournant pas en CI : il réunit désormais les écrans ajoutés depuis (missions, envois et factures, file des questions médicales, recherche et effacement RGPD). Ce fichier n’est chargé qu’après la connexion de l’administrateur et ne pèse sur aucun visiteur public. Le budget a d’abord été relevé à 90 KiB à titre provisoire, pour que la CI garde un seuil qui arrête une nouvelle dérive ; ce relèvement explique et mesure le dépassement, il ne le corrige pas. Depuis le retrait des attributs `data-loc` que le plugin de l’éditeur visuel Manus (`jsxLocPlugin`) ajoutait au build (CODE-06), le fichier mesure environ 72,7 KiB, et le seuil est redescendu à 80 KiB. Revenir sous 60 KiB demanderait de charger à la demande les onglets les plus lourds (chacun mesuré seul : `EmployerBriefsTab` environ 12,7 KiB, `RecruitmentTab` 12,4 KiB, `MailingTab` 9,2 KiB gzip) : décision à prendre par le propriétaire.

## Mesure du 27 octobre 2026 — toutes les routes, les dépendances partagées et la CSS

Jusqu’ici, seules neuf routes nommées étaient mesurées : une autre page (VVIP offshore, espace candidat, recherche, questions médicales…), une dépendance partagée ou la feuille de style pouvaient grossir sans que la CI échoue. Le contrôle mesure désormais les 25 routes différées, les 55 dépendances partagées et la CSS ; aucune ne dépasse son budget, sans exception.

| Groupe | Mesure gzip | Budget | Résultat |
|---|---:|---:|---|
| Entrée publique | 145,1 KiB | 160 KiB | Conforme. |
| Dashboard administratif différé | 77,0 KiB | 80 KiB | Conforme. |
| Plus grandes routes différées (`LegalPage`, `RecruitmentPage`) | 19,2 KiB | 30 KiB | Conforme. |
| Plus grande dépendance partagée (`candidateDocumentCategories`) | 17,4 KiB | 30 KiB | Conforme. |
| Feuille de style | 26,6 KiB | 30 KiB | Conforme. |
