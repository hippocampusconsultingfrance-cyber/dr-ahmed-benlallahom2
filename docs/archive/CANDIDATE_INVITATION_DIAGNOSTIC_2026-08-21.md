# Diagnostic du lien d’invitation candidat

**Date du contrôle :** 21 août 2026  
**Méthode :** vérification en lecture seule de l’action administrateur, du message délivré et de l’ouverture du lien, sans soumission de compte ni nouvel envoi.

## Résultats

Le dernier email d’invitation journalisé par l’administration a été confirmé comme **délivré** par le prestataire email. Son URL utilise le domaine public sécurisé, la route `/candidate/access` et un jeton signé à deux segments, conforme au format attendu côté navigateur et serveur.

L’ouverture du lien a chargé la page **Créer mon espace candidat**, avec les champs d’inscription, les consentements et les protections anti-bot. Aucun compte n’a été créé lors du contrôle.

Le jeton d’invitation est volontairement temporaire : sa durée de vie est de trente minutes. Après expiration, le candidat doit recevoir une nouvelle invitation depuis l’administration. Le contrôle n’a pas révélé de redirection vers une page erronée ni de lien email altéré.

## Piste retenue

Le mécanisme de lien fonctionne techniquement. La résolution côté serveur de l’invitation en cours a été vérifiée avec succès, puis l’URL a été ouverte à nouveau dans le navigateur : le formulaire s’est bien placé en mode création d’accès, les informations de candidature ont été préremplies et le message de validation de l’invitation a été affiché.

Le bouton n’a pas déclenché d’erreur de routage ni de lien. Pour terminer son activation, le candidat doit saisir puis confirmer un mot de passe d’au moins quinze caractères, accepter les deux confirmations, effectuer la vérification anti-bot et cliquer sur **Créer mon accès**. Il reçoit ensuite un deuxième email contenant le lien d’activation de son adresse.

Les invitations expirent après trente minutes. Si le destinataire utilise un lien plus ancien ou trop tardif, une nouvelle invitation doit être envoyée depuis l’administration.

La non-régression couvre désormais la compatibilité entre le jeton signé produit côté serveur, le paramètre URL reconnu côté navigateur et la vérification cryptographique. Validation : TypeScript sans erreur ; 6 tests ciblés réussis, incluant les contrôles d’accès de l’action administrateur.
