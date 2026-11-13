# Procédure : accès de secours à l’administration

Pour le responsable du site. Elle dit comment l’accès à `/admin` est protégé,
puis quoi faire quand un appareil est perdu, quand la boîte mail ne répond plus
ou quand le code de sécurité n’arrive pas. Elle est écrite à partir du code
(`server/adminMfa.ts`, `server/routers/adminSecurity.ts`,
`server/_core/context.ts`, `server/_core/env.ts`) et des écrans de
l’administration.

## 1. Comment l’accès est protégé

1. **Connexion Clerk** : « Se connecter » sur `/admin`. Seul le compte Clerk
   dont l’identifiant est la variable `CLERK_OWNER_USER_ID` de Vercel (à défaut
   `OWNER_OPEN_ID`) est administrateur ; tout autre compte voit « Accès
   refusé ».
2. **Code de sécurité** : écran « Validation de sécurité », bouton « Envoyer un
   code de sécurité ». Un code à 6 chiffres part par email (Resend) vers
   l’**adresse principale du compte Clerk, si elle est vérifiée** ; le site la
   relit chez Clerk à chaque demande. Le code vaut 10 minutes, seul le dernier
   envoyé fonctionne, et il est refusé après 5 erreurs. Par compte et par
   réseau : au plus 5 envois et 10 essais en 15 minutes, puis 15 minutes
   d’attente (« Trop de tentatives de double authentification »).
3. **Durée** : le code validé ouvre l’administration pour 8 heures dans ce
   navigateur. « Se déconnecter » ferme la session Clerk et cette preuve.

Il n’existe pas encore de codes de secours (voir la section 6).

## 2. Appareil perdu ou volé

**Depuis un autre appareil où vous pouvez vous connecter** : onglet
**Sécurité**, bloc « Sessions administrateur actives », bouton **« Révoquer
toutes les autres sessions »**. Le bloc liste chaque appareil connecté
(navigateur, appareil, ville et pays donnés par Clerk, dernière activité à
l’heure de Paris) ; celui que vous utilisez porte « Cette session » et reste
connecté. Les autres sont déconnectés par Clerk et leurs codes de sécurité ne
comptent plus : même avec le mot de passe, il leur faudrait un nouveau code
envoyé à votre adresse. Le message dit combien de sessions ont été révoquées ;
si Clerk en a refusé une, il le dit aussi : la révoquer alors dans Clerk
(ci-dessous). L’action est inscrite au journal (« Autres sessions admin
révoquées »).

**Sans accès à l’administration** : tableau de bord Clerk, **Users**, le
compte administrateur, puis **Sessions** : révoquer les sessions. Une session
Clerk révoquée suffit à bloquer l’administration sur cet appareil, le site
vérifiant la session Clerk à chaque requête : au plus tard quand son jeton de
session expire (une minute par défaut chez Clerk).

Ensuite : changer le mot de passe du compte Clerk.

## 3. Boîte mail perdue ou inaccessible

Le code part toujours vers l’adresse principale vérifiée du compte Clerk. Pour
le recevoir ailleurs, sans intervention dans la base de données : tableau de
bord Clerk, **Users**, le compte administrateur, ajouter une adresse que vous
contrôlez, la faire vérifier, puis en faire l’**adresse principale**. Le
prochain « Envoyer un code de sécurité » l’utilise. Tant qu’aucune adresse
principale n’est vérifiée, l’écran répond « Aucun email administrateur vérifié
n’est disponible pour la double authentification. »

L’accès au tableau de bord Clerk ne doit donc pas dépendre de la seule boîte
mail perdue : le protéger par sa propre double authentification.

## 4. Le code n’arrive pas

- Regarder les courriers indésirables, puis renvoyer un code : seul le dernier
  vaut.
- « Le code de sécurité n’a pas pu être envoyé » : Resend a refusé l’email
  (panne ou quota épuisé). Voir `docs/EXPLOITATION.md`, « Resend en panne ou
  quota épuisé » ; l’évènement « Code de sécurité admin non envoyé : l’email
  n’est pas parti » est inscrit au journal. Sans Resend, aucun code ne part
  et l’administration reste fermée jusqu’à son retour.
- « Trop de tentatives de double authentification » : attendre 15 minutes.

## 5. Changer de compte administrateur

Le compte administrateur est celui de `CLERK_OWNER_USER_ID`. Pour en changer :
copier l’identifiant `user_…` du nouveau compte dans le tableau de bord Clerk,
le mettre dans cette variable sur Vercel, puis redéployer (une variable
modifiée ne s’applique qu’au déploiement suivant).

## 6. Codes de secours (à décider)

Dix codes de secours à usage unique, enregistrés hachés, affichés une seule
fois et régénérables, permettraient d’entrer sans la boîte mail. Ils demandent
une table dédiée dans la base (migration), que le propriétaire doit valider :
aucune table existante ne convient, les codes de sécurité par email étant
effacés une fois expirés et les compteurs de tentatives au bout de 48 heures.

## 7. Alerte « Alerte sécurité — Code de sécurité admin erroné ou expiré »

Ces codes ont été saisis après une connexion Clerk réussie au compte
administrateur. Si ce n’est pas vous, votre mot de passe est connu : le
changer dans Clerk, puis « Révoquer toutes les autres sessions » (section 2).
