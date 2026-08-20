# Inventaire des visuels médicaux publics

Cet inventaire couvre les visuels médicaux actifs des parcours publics. Il consigne leur rôle éditorial et leur contexte, sans attribuer de bénéfice clinique ni de promesse thérapeutique. Les nouveaux visuels authentiques restent bloqués tant que les droits, le consentement le cas échéant et la provenance ne sont pas archivés dans `VISUAL_ASSET_RIGHTS_REGISTER.md`.

| Actif publié | Emplacement de rendu | Rôle et alternative | Contexte autorisé | Statut |
|---|---|---|---|---|
| `hero-bg-ahmed_156f3568.png` | `HeroSection.tsx` | Portrait et environnement clinique, avec alternative contextuelle. | Présentation professionnelle du Dr Ben Lallahom ; aucune allégation de résultat. | Actif interne audité. |
| `hero-ahmed-medical_4adb9653.png` | `AboutSection.tsx` | Portrait professionnel, avec alternative contextuelle. | Section À propos ; identité et expérience professionnelle uniquement. | Actif interne audité. |
| `hero-consulting_b0a2cb5b.png` | `ContactSection.tsx`, `GDPRRequestForm.tsx` | Fond d’ambiance de consultation ; décoratif ou contextuel selon la section. | Contact et exercice des droits ; ne pas présenter comme une preuve de soin. | Actif interne audité. |
| `services-medical-compass-1280_0a913727.webp` | `ServicesSection.tsx` | Fond décoratif de la section Services, sans alternative redondante. | Illustration de repérage visuel ; aucune promesse thérapeutique. | Actif interne audité. |
| `booking-care-path-1280_c6d0ae6a.webp` | `BookingPage.tsx` | Illustration décorative du parcours de réservation. | Aide au repérage du formulaire ; aucune représentation de résultat médical. | Actif interne audité. |

> Toute modification d’un contexte, d’une alternative, d’un actif ou de sa source déclenche une mise à jour de cet inventaire, un contrôle de `visualIllustrations.test.ts` et une revue des droits.
