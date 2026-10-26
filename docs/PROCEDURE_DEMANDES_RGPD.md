# Procédure : traiter une demande RGPD

Pour le responsable du site (administration, onglet **RGPD**). Elle couvre les
demandes d’un patient, d’un contact, d’une personne ayant posé une question
santé, d’un candidat ou d’un employeur, reçues par le formulaire `/gdpr` ou par
email.

## 1. Délai

- Réponse due **un mois après la réception** (RGPD, art. 12.3). L’onglet RGPD
  affiche l’échéance de chaque demande ouverte, en rouge une fois dépassée.
- Le délai peut être prolongé de deux mois pour une demande complexe ou en cas
  de demandes nombreuses, à condition d’en informer la personne, avec les
  raisons, **avant la fin du premier mois**.
- Une demande reçue par email peut être saisie dans le formulaire `/gdpr` (à
  l’adresse de la personne) pour apparaître dans l’onglet ; l’échéance
  affichée part alors de la saisie : noter dans la note la date de réception
  de l’email et compter le délai depuis celle-ci.

## 2. Étapes dans l’administration

1. Onglet **RGPD** : ouvrir la demande, cliquer **En cours**.
2. En cas de doute raisonnable sur l’identité, la vérifier (réponse depuis la
   même adresse email, ou justificatif limité au nécessaire, non conservé).
3. Cliquer **Ses données** (ou saisir l’adresse dans « Rechercher une personne
   par email ») : la recherche ignore la casse et liste les messages de
   contact, questions santé, demandes RGPD, rendez-vous (avec le numéro de
   facture) et les dossiers de recrutement de cette adresse.
4. Selon la demande :
   - **Accès / portabilité** : **Exporter (JSON)**, puis transmettre le fichier
     à la personne par un canal sûr. Il contient aussi les notes internes de
     ses demandes RGPD (dont le motif d’un refus) : les relire avant l’envoi. Le dossier de recrutement n’est pas dans
     cet export : le rassembler depuis la fiche du candidat (onglet
     Candidatures).
   - **Effacement** : **Effacer / anonymiser** (voir § 4), puis, pour chaque
     dossier de recrutement listé, **Effacer le dossier candidat** (même
     effacement complet que « Effacer RGPD + preuve » de l’onglet
     Candidatures). Un rendez-vous **à venir encore en cours** n’est pas
     touché : confirmé, en attente de paiement, ou payé après la libération
     de son créneau et à rembourser. L’annuler ou le rembourser dans l’onglet
     Réservations (un créneau en attente de paiement est libéré à son
     expiration, au plus tard par le nettoyage de la nuit), puis relancer
     l’effacement. Un rendez-vous annulé ou un créneau
     abandonné, même à une date future, est anonymisé comme un rendez-vous
     passé.
   - **Rectification** : il n’y a pas d’écran de modification ; corriger la
     ligne dans Neon (tables du § 3) ou, pour une donnée devenue inutile,
     l’effacer. Noter ce qui a été fait.
   - **Opposition** : cesser le traitement concerné (par exemple désinscription
     des campagnes de recrutement) et le noter.
   - Un message ou une question santé seule peut aussi être supprimé depuis
     l’onglet Messages ou Questions santé (bouton **Supprimer**), par exemple
     après un retrait de consentement.
5. Écrire dans la note de la demande ce qui a été fait et quand (« Enregistrer
   la note »), puis **Traité**. Pour un **refus** (identité non vérifiable,
   demande manifestement infondée ou excessive, obligation de conservation),
   le motif est obligatoire dans la note avant **Refuser** ; le communiquer à
   la personne avec la possibilité de saisir la CNIL. Tant que la demande est
   ouverte, vider la note puis « Enregistrer la note » l’efface (par exemple
   une note saisie par erreur).
6. Répondre à la personne par email. La date de réponse est enregistrée au
   passage en « Traitée » ou « Refusée ».

Chaque suppression, export et effacement est tracé dans le journal de sécurité
(onglet Sécurité) : qui, quand, combien de lignes, **sans donnée personnelle**
de la personne.

## 3. Où se trouvent les données d’une adresse email

Comparer toujours l’adresse sans tenir compte de la casse (`lower(email)`).

Base de données (Neon) :

| Table | Colonne | Données | Effacement |
| --- | --- | --- | --- |
| `contact_messages` | `email` | nom, email, téléphone, message | « Effacer / anonymiser » ou « Supprimer » |
| `medical_questions` | `email` | identité, coordonnées, question, réponse, version publique | « Effacer / anonymiser » ou « Supprimer » |
| `medical_question_audit_logs` | `medical_question_id` | journal de la question | avec la question |
| `gdpr_requests` | `email` | la demande elle-même | conservée (§ 4) |
| `appointments` | `customer_email` | identité, coordonnées, motif, date, montant, statuts | anonymisation des rendez-vous passés, annulés ou abandonnés |
| `appointment_invoices` | `appointment_id` | numéro et dates de facture | conservé (§ 4) |
| `appointment_fulfillment_jobs` | `appointment_id` | état des envois après paiement, sans identité | purgé 30 jours après l’envoi |
| `cv_applications` et tables liées | `email` | candidature, CV, analyses, historique | « Effacer le dossier candidat » |
| `candidate_accounts`, `candidate_sessions`, `candidate_documents` | `email` / `candidate_id` | espace candidat et coffre | avec le dossier candidat ; un espace sans candidature est effacé après 2 ans d’inactivité, sinon le supprimer dans Neon |
| `client_briefs` | `email` | besoin d’un employeur (contact, organisation) | pas d’écran : vérifier et supprimer dans Neon |
| `security_events` | `actor_reference` | journal technique, parfois une empreinte ou une adresse | purgé après 90 jours |
| `users` | `email` | comptes administrateurs uniquement | sans objet pour un patient |

Stockage de fichiers (Vercel Blob) :

| Préfixe | Contenu | Effacement |
| --- | --- | --- |
| `invoices/<numéro>-<référence>.pdf` | factures PDF émises | conservées 10 ans (§ 4) ; aucune suppression automatique n’est encore prévue au-delà |
| `recruitment/quarantine/`, `recruitment/cv/` | CV déposés | par l’effacement du dossier candidat |
| `candidate-documents/quarantine/<id du compte>/` | coffre candidat (chiffré) | par l’effacement du dossier candidat |

Hors du site : Resend (historique des emails envoyés), Stripe (paiements),
Google Drive (copies de CV, effacées avec le dossier candidat) et les
sauvegardes Neon (l’historique de restauration garde l’état antérieur pendant
sa durée de conservation). Les vérifier si la personne le demande
expressément.

## 4. Ce qui est gardé, et pourquoi

- **Facture et minimum comptable d’un rendez-vous** : la facture PDF dans Blob
  et, en base, la date, les montants, les statuts, les références de paiement
  et le numéro de facture, pour l’obligation de conservation comptable de
  10 ans. Après anonymisation, le nom, l’email, le téléphone et le motif sont
  effacés ; une facture régénérée depuis l’administration ne porte donc plus
  l’identité : la facture d’origine reste celle stockée dans Blob. Aucune
  règle ne supprime encore ces factures (PDF et `appointment_invoices`) ni
  les rendez-vous anonymisés après 10 ans : suppression à prévoir.
- **Demandes RGPD** : gardées 1 an après leur clôture comme preuve du
  traitement (registre des traitements), puis supprimées automatiquement.
- **Rendez-vous à venir encore en cours** (confirmés, en attente de paiement,
  ou payés et à rembourser) : jusqu’à leur annulation ou leur remboursement.
- **Preuve d’effacement d’un dossier candidat** : anonymisée (empreintes,
  nombres), dans le journal de recrutement.
- **Trace des actions de l’administration** : sans donnée personnelle de la
  personne, 90 jours.

## 5. Suppressions automatiques

Chaque nuit, la tâche `security-posture` applique les durées de la politique
de confidentialité (`server/personalDataRetention.ts`), par lots et dans un
budget de temps ; ce qui reste passe la nuit suivante :

| Données | Durée |
| --- | --- |
| Journal de sécurité, codes et sessions de double authentification | 90 jours (ou dès expiration pour les codes et sessions) |
| Sessions de l’espace candidat | dès expiration |
| Envois après paiement terminés | 30 jours après l’envoi |
| Demandes RGPD closes | 1 an après la réponse |
| Messages de contact | 3 ans après le dernier message de la personne |
| Questions santé et leur journal | 3 ans après le dernier échange ; une question publiée avec accord ne garde que sa version publique anonymisée |
| Rendez-vous | réduits au minimum comptable 3 ans après la consultation |
| Motif de la consultation (`request_details`) | vidé 90 jours après la consultation (durée à confirmer par le responsable) |

Le recrutement a sa propre tâche (`recruitment-retention`) : 2 ans après la
dernière activité du candidat.
