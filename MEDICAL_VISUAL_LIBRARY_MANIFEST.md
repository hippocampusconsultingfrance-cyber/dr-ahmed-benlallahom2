# Manifeste de bibliothèque visuelle médicale

**État actuel : aucun visuel médical authentique supplémentaire n’est ajouté par ce manifeste.** Il prépare seulement l’intégration de futures images dont la provenance, le droit de diffusion et le contexte éditorial auront été vérifiés. Une image générée peut rester décorative, mais ne doit jamais être présentée comme une photographie clinique, une preuve de soin ou le portrait d’un patient réel.

## Catégories admissibles

| Catégorie | Usage possible | Restrictions impératives |
|---|---|---|
| Portrait professionnel | Présenter un intervenant identifié et consentant. | Accord de la personne et du photographe ; alternative contextuelle ; aucune allégation non vérifiée. |
| Environnement de soin réel | Illustrer une page de contexte clinique ou organisationnel. | Aucune donnée identifiable de patient, écran lisible, dossier, badge personnel ou situation d’urgence reconnaissable. |
| Équipement ou geste non identifiable | Contextualiser une expertise ou un parcours. | Ne pas représenter un geste comme une instruction médicale ni suggérer un résultat. |
| Événement professionnel | Présenter une intervention, formation ou conférence validée. | Autorisation des personnes/organisateurs et date/lieu exacts. |
| Illustration générée décorative | Soutenir l’identité de marque ou une section non factuelle. | Marquer comme décorative, alternative vide si elle ne porte aucune information, aucune présentation comme photo documentaire. |

## Fiche obligatoire par visuel

| Métadonnée | Valeur à renseigner |
|---|---|
| Identifiant stable de l’actif | — |
| Catégorie | Une catégorie admissible ci-dessus. |
| Source et titulaire | Auteur, détenteur ou outil de génération documenté. |
| Autorisation ou licence | Référence, territoire, durée, canaux et restrictions. |
| Consentements personnes/lieux | Preuve applicable ou confirmation d’absence de personne identifiable. |
| Contexte éditorial autorisé | Pages et messages où le visuel peut apparaître. |
| Alternative textuelle | FR/EN/DE/ZH si informative ; vide seulement si strictement décorative. |
| Revue clinique et éthique | Absence de promesse, d’identification de patient et d’interprétation médicale abusive. |
| Date de prochaine revue | — |

## Flux d’intégration

Le propriétaire ou le détenteur des droits fournit d’abord le fichier source et les preuves associées. Après validation éditoriale, l’actif est archivé hors du dépôt dans `/home/ubuntu/webdev-static-assets/`, publié avec l’URL de stockage statique appropriée, puis référencé dans le code avec son alternative textuelle. Le registre `ASSET_RIGHTS_REGISTER.md` doit être mis à jour simultanément ; une autorisation expirée ou retirée impose la suppression du visuel du site et des canaux associés.

## Contrôle avant diffusion

Ne pas diffuser une image si une métadonnée essentielle manque. Aucun visuel ne doit montrer ou permettre d’inférer une information de santé personnelle. Un contrôle final vérifie le recadrage responsive, le contraste avec le texte, l’alternative, les droits, l’absence de détail patient et l’absence de promesse thérapeutique.
