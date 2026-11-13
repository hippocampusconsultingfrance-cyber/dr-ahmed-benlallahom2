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
4. **Codes de secours** : dix codes à usage unique, générés dans l’onglet
   **Sécurité**, remplacent le code envoyé par email quand la boîte mail est
   perdue ou que l’email n’arrive pas (section 6). La connexion Clerk reste
   demandée avant eux.

## 2. Appareil perdu ou volé

**Depuis un autre appareil où vous pouvez vous connecter** : onglet
**Sécurité**, bloc « Sessions administrateur actives », bouton **« Révoquer
toutes les autres sessions »**. Le bloc liste chaque appareil connecté
(navigateur, appareil, ville et pays donnés par Clerk, dernière activité à
l’heure de Paris) ; celui que vous utilisez porte « Cette session » et reste
connecté. Le bouton annule d’abord les codes de sécurité encore valables des
autres appareils : même avec le mot de passe, il leur faudrait un nouveau code
envoyé à votre adresse. Il le fait aussi pour un appareil que Clerk ne liste
plus (session déjà révoquée dans Clerk ou expirée), et même quand Clerk ne
répond pas. Puis Clerk déconnecte les autres appareils. Le message dit combien
de sessions ont été révoquées et combien de codes annulés ; si Clerk a refusé
une session ou n’a pas répondu, il le dit aussi : les révoquer alors dans
Clerk (ci-dessous). L’action est inscrite au journal (« Autres sessions admin
révoquées »).

**Sans accès à l’administration** : tableau de bord Clerk, **Users**, le
compte administrateur, puis **Sessions** : révoquer les sessions. L’appareil
est déconnecté au plus tard quand son jeton de session expire (une minute par
défaut chez Clerk). Mais son code de sécurité, lui, reste valable jusqu’à
8 heures : quelqu’un qui connaît le mot de passe (par exemple enregistré dans
le navigateur volé) pourrait se reconnecter et entrer sans nouveau code. Donc
**changer tout de suite le mot de passe** du compte Clerk, puis, une fois de
retour dans l’administration, cliquer sur « Révoquer toutes les autres
sessions », qui annule ce code.

Dans les deux cas : changer le mot de passe du compte Clerk.

## 3. Boîte mail perdue ou inaccessible

**Avec un code de secours** (section 6) : écran « Validation de sécurité »,
**« Utiliser un code de secours »**, saisir l’un des codes notés, puis
« Valider le code de secours ». L’administration s’ouvre pour 8 heures.
Ensuite, changer l’adresse principale comme ci-dessous, et générer de
nouveaux codes s’il en reste peu.

**Sans code de secours**, ou pour que les codes reviennent par email : le
code part toujours vers l’adresse principale vérifiée du compte Clerk. Pour
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
  n’est pas parti » est inscrit au journal. Sans Resend, aucun code ne part :
  entrer alors avec un code de secours (section 6).
- « Trop de tentatives de double authentification » : attendre 15 minutes.

## 5. Changer de compte administrateur

Le compte administrateur est celui de `CLERK_OWNER_USER_ID`. Pour en changer :
copier l’identifiant `user_…` du nouveau compte dans le tableau de bord Clerk,
le mettre dans cette variable sur Vercel, puis redéployer (une variable
modifiée ne s’applique qu’au déploiement suivant).

## 6. Codes de secours

Onglet **Sécurité**, bloc « Codes de secours », bouton **« Générer des codes
de secours »** : dix codes de la forme `K7QM2-XH9TD` s’affichent **une seule
fois**. Les noter tout de suite hors de l’ordinateur (papier rangé,
gestionnaire de mots de passe), puis « J’ai noté ces codes ». Le site n’en
garde qu’une empreinte : il ne peut pas les réafficher.

- **Utiliser un code** : écran « Validation de sécurité », « Utiliser un code
  de secours », saisir un code (majuscules ou minuscules, avec ou sans tiret).
  Il ouvre l’administration pour 8 heures, comme le code envoyé par email,
  puis ne sert plus. Ses essais comptent avec ceux du code envoyé par email
  (10 en 15 minutes). Le journal note « Connexion admin par un code de
  secours » ; un code erroné ou déjà utilisé y est noté « Code de secours
  admin erroné ou déjà utilisé » et vous envoie une alerte (section 7).
- **Combien il en reste** : le bloc affiche « Codes de secours restants :
  N / 10 » et la date où ils ont été générés.
- **Les remplacer** : « Remplacer les codes de secours », après confirmation,
  en génère dix nouveaux ; les anciens cessent aussitôt de fonctionner. Le
  faire quand il en reste peu, ou si la feuille a pu être vue. Le journal note
  « Nouveaux codes de secours admin générés ».
- Ils ne remplacent que le code envoyé par email : la connexion Clerk (mot de
  passe) reste demandée avant eux.
- La purge automatique ne les efface pas : ils durent jusqu’à leur
  remplacement.
- Mise en service : la table `admin_mfa_backup_codes` (migration
  `drizzle/pg/0005_admin_mfa_backup_codes.sql`) doit exister ; sans elle, le
  bloc affiche « Impossible de lire les codes de secours » et rien d’autre
  n’est touché.

## 7. Alerte « Alerte sécurité — Code de sécurité admin erroné ou expiré »

Ces codes ont été saisis après une connexion Clerk réussie au compte
administrateur. Si ce n’est pas vous, votre mot de passe est connu : le
changer dans Clerk, puis « Révoquer toutes les autres sessions » (section 2).
Même chose pour « Alerte sécurité — Code de secours admin erroné ou déjà
utilisé », puis remplacer les codes de secours (section 6).
