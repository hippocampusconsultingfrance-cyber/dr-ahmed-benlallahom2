# Rapport d'Audit et Recommandations : Module de Recrutement International Intelligent

**Auteur :** Manus AI  
**Date :** Août 2026  
**Projet :** Site professionnel du Dr. Ahmed Ben Lallahom — Hippocampus Consulting  
**Cible de l'audit :** Le module de dépôt de CV multilingue, d'extraction de texte multi-format (PDF, DOCX, DOC), d'analyse sémantique structurée par intelligence artificielle (`gpt-5-mini`), et de gestion administrative sécurisée.

---

## 1. Introduction et Périmètre de l'Audit

Le module de recrutement international d'Hippocampus Consulting a été conçu pour centraliser et qualifier les candidatures de professionnels de santé (médecins, chirurgiens, anesthésistes et personnel soignant) à l'échelle mondiale, ciblant prioritairement l'Europe (France, Allemagne, Italie), le Canada et le Moyen-Orient. L'intégration d'un système d'analyse intelligente par IA permet d'assister le praticien administrateur en extrayant des synthèses, des compétences clés, un score de pertinence professionnelle et des points de vigilance.

Cet audit évalue l'architecture technique, la sécurité des données sensibles, la conformité rigoureuse au Règlement Général sur la Protection des Données (RGPD), la gouvernance des modèles d'intelligence artificielle, ainsi que l'ergonomie (UX) et l'exploitabilité opérationnelle.

---

## 2. Analyse de l'Architecture et des Flux

Le flux actuel repose sur un parcours asynchrone et sécurisé :

1. **Dépôt Candidat (Frontend / Backend Express) :** Le formulaire multilingue (FR, EN, DE, ZH) collecte les informations professionnelles, le consentement explicite et le fichier CV (jusqu'à 5 Mo). Un mécanisme anti-spam en honeypot (`website`) est actif.
2. **Stockage S3 Sécurisé :** Le fichier est stocké via le proxy de stockage intégré avec un identifiant unique aléatoire et une extension nettoyée. Aucun octet de CV n'est stocké dans les colonnes de la base de données relationnelle.
3. **Extraction et Analyse Asynchrone (LLM) :** Dès l'insertion en base, un processus en arrière-plan extrait le texte brut selon le format (`pdf-parse` pour les PDF, `mammoth` pour les DOCX, `word-extractor` pour les DOC historiques), puis invoque `gpt-5-mini` avec un schéma JSON strict et un prompt guidé par la neutralité.
4. **Revue Administrateur :** Le tableau de bord (`/admin` → Candidatures) permet au Dr. Ahmed Ben Lallahom de filtrer par statut et pays, de consulter les synthèses et scores IA, de télécharger les CV via des URLs signées temporaires, de modifier les statuts ou de procéder à un effacement RGPD anticipé.

---

## 3. Matrice des Points Forts et des Vulnérabilités

| Dimension | Points Forts Constatés | Vulnérabilités ou Axes d'Amélioration |
| :--- | :--- | :--- |
| **Sécurité & Données** | Stockage S3 isolé par clés aléatoires, absence de stockage binaire en base, validation stricte des types MIME (`application/pdf`, `application/msword`, `vnd.openxmlformats`). | Absence de signature cryptographique HMAC sur les webhooks ou liens de téléchargement au-delà du token S3 signé existant. |
| **Conformité RGPD** | Consentement explicite renforcé, durée de conservation fixée à 2 ans, fonction d'effacement administrateur connectée à la suppression de la référence S3/DB. | Nécessité d'ajouter un journal d'audit (audit log) traçant chaque consultation de CV par un administrateur. |
| **Gouvernance IA** | Utilisation d'un schéma JSON strict (`strict: true`), prompt interdisant l'analyse de caractéristiques protégées (âge, genre, origine, santé), absence de décision entièrement automatisée (revue humaine obligatoire). | Risque d'hallucination ou de mauvaise interprétation sur des CV mal structurés ou scannés sous forme d'image pure (absence d'OCR visuel). |
| **Expérience Utilisateur** | Interface multilingue fluide (FR/EN/DE/ZH), réassurance sur la confidentialité, affichage clair des scores avec codes de couleur dans le dashboard. | Absence d'un indicateur de progression en temps réel pour l'analyse IA si l'administrateur consulte la fiche immédiatement après le dépôt. |

---

## 4. Recommandations et Plan d'Amélioration Priorisé

Les améliorations suivantes sont classées par ordre de priorité stratégique et opérationnelle :

### Priorité 1 : Gouvernance et Audit des Accès (Sécurité & RGPD)
* **Journalisation des accès (Audit Trail) :** Enregistrer chaque action de téléchargement de CV ou de relance d'analyse IA avec l'horodatage et l'identifiant de l'administrateur, afin de répondre aux exigences de traçabilité de la CNIL.
* **Purge automatisée (Data Lifecycle) :** Implémenter une tâche de fond (Heartbeat) qui identifie périodiquement les candidatures dont la date de rétention (`retentionUntil`) est dépassée et notifie l'administrateur pour archivage ou suppression définitive.

### Priorité 2 : Résilience de l'Extraction Documentaire (Technique)
* **Fallback OCR pour les CV scannés :** Intégrer une détection de texte vide après l'extraction PDF standard ; si le PDF ne contient que des images (scan), basculer vers un appel multimodal (vision) via `gemini-3-flash-preview` pour extraire le texte du CV sans bloquer l'analyse.
* **Normalisation des formats de date et d'expérience :** Améliorer le parseur LLM pour harmoniser la détection des stages et des remplacements par rapport aux postes permanents.

### Priorité 3 : Enrichissement Fonctionnel (Métier)
* **Matching multicritère avancé :** Permettre à l'administrateur de définir des seuils de pertinence personnalisés par appel d'offres ou par pays cible (ex. : filtrer instantanément les profils ayant un score IA supérieur à 80 pour l'Allemagne).
* **Modèles de réponse pré-rédigés :** Intégrer des boutons d'action rapide dans le dashboard pour envoyer un email de prise de contact ou de demande de complément au candidat via Resend directement depuis la fiche de candidature.

---

## 5. Conclusion

Le module de recrutement international intelligent d'Hippocampus Consulting offre une solution robuste, éthique et conforme aux standards professionnels exigés en santé. Les garde-fous éthiques et techniques garantissent que l'intelligence artificielle n'est qu'un outil d'aide à la décision humaine, préservant ainsi la souveraineté du praticien tout en réduisant la charge opérationnelle de tri des dossiers.

---
*Rédigé par Manus AI — Tous droits réservés.*
