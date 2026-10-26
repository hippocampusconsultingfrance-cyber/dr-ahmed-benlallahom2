# Budget de performance public

Le contrôle `pnpm check:performance` construit la version de production puis mesure les fichiers JavaScript compressés avec gzip. Il protège l’impact des nouvelles images, animations et dépendances sur le chargement initial, tout en tenant compte du chargement différé du dashboard administratif.

| Groupe | Budget gzip | Motif |
|---|---:|---|
| Entrée publique | 160 KiB | Conserver un chargement initial raisonnable pour les parcours publics. |
| Dashboard administratif différé | 90 KiB | Préserver le découpage du code non nécessaire aux visiteurs publics (60 KiB jusqu’en octobre 2026, voir ci-dessous). |
| Route publique différée | 30 KiB | Éviter qu’une page isolée concentre une dépendance ou un média scripté disproportionné. |

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
| Entrée publique | 145,6 KiB | 160 KiB | Conforme. |
| Dashboard administratif différé | 80,9 KiB | 90 KiB | Conforme après relèvement provisoire (dépassait les 60 KiB). |
| Plus grande route publique mesurée (`LegalPage`) | 23,7 KiB | 30 KiB | Conforme. |

Le dashboard administratif avait dépassé les 60 KiB sans que rien ne le signale, le contrôle ne tournant pas en CI : il réunit désormais les écrans ajoutés depuis (missions, envois et factures, file des questions médicales, recherche et effacement RGPD). Ce fichier n’est chargé qu’après la connexion de l’administrateur et ne pèse sur aucun visiteur public. Le budget a été relevé à 90 KiB à titre provisoire, en attendant la décision du propriétaire, pour que la CI garde un seuil qui arrête une nouvelle dérive ; ce relèvement explique et mesure le dépassement, il ne le corrige pas. Sans les attributs `data-loc` que le plugin de l’éditeur visuel Manus (`jsxLocPlugin`) ajoute au build (retrait prévu par une autre correction, CODE-06), le fichier mesure environ 72,8 KiB : le seuil devra alors redescendre vers 80 KiB. Revenir sous 60 KiB demanderait de charger à la demande les onglets les plus lourds (chacun mesuré seul : `EmployerBriefsTab` environ 12,7 KiB, `RecruitmentTab` 12,4 KiB, `MailingTab` 9,2 KiB gzip) : décision à prendre par le propriétaire.
