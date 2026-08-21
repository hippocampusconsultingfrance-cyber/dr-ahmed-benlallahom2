# Délivrabilité des emails d’activation candidat

**Date du diagnostic :** 21 août 2026  
**Périmètre :** emails transactionnels d’activation du portail candidat.

## Diagnostic vérifié

Le dernier email d’activation consulté dans Resend a le statut **delivered** : il a été accepté par le serveur destinataire. Ce statut ne garantit toutefois pas son placement dans la boîte de réception plutôt que dans le dossier spam, décision qui appartient au fournisseur de messagerie du destinataire.

| Élément | État observé | Conclusion |
|---|---|---|
| Domaine d’envoi | `drahmedbenlallahom.com`, vérifié dans Resend | Conforme pour l’envoi transactionnel. |
| SPF Resend | Vérifié sur le sous-domaine `send` | Conforme. |
| DKIM Resend | Vérifié | Conforme. |
| Suivi de clics et d’ouvertures | Désactivé | Adapté à un email transactionnel contenant un lien d’activation. |
| Lien du bouton et image | Hébergés sur `drahmedbenlallahom.com` | Alignés avec le domaine d’envoi. |
| DMARC | Aucun enregistrement détecté dans la zone DNS Cloudflare | Amélioration prioritaire à effectuer après validation du propriétaire. |

Resend recommande l’usage de DMARC, l’alignement des URL avec le domaine d’envoi, l’absence de suivi pour les messages transactionnels et une version texte. [1] Google indique également que SPF, DKIM et DMARC réduisent le risque de classement en spam ; une politique DMARC `p=none` constitue un point de départ non bloquant pour l’observation. [2]

## Correctifs appliqués dans l’application

Le message d’activation a été clarifié afin d’expliquer pourquoi il est reçu, de confirmer explicitement qu’il finalise l’adresse email — et non un accès immédiat à des données — et d’utiliser un bouton **« Confirmer mon adresse email »**. La version HTML et la version texte nomment clairement l’expéditeur `recrutement@drahmedbenlallahom.com`. Les tests confirment que le lien reste signé, sur le bon domaine et que l’activation demeure obligatoire.

## Action DNS proposée, avec confirmation requise

L’ajout suivant est recommandé dans Cloudflare afin de publier DMARC sans modifier le flux d’envoi :

| Type | Nom | Valeur |
|---|---|---|
| TXT | `_dmarc` | `v=DMARC1; p=none; adkim=r; aspf=r; pct=100` |

La politique `p=none` n’ordonne pas le rejet ou la mise en quarantaine des messages ; elle publie l’authentification DMARC nécessaire aux fournisseurs de messagerie. Toute montée ultérieure vers `quarantine` ou `reject` doit être effectuée seulement après examen de rapports DMARC. [1] [2]

## Publication DNS : prérequis externe identifié

La publication a été tentée dans le compte Cloudflare connecté, mais ce compte ne contient actuellement aucune zone DNS accessible pour `drahmedbenlallahom.com`. L’enregistrement ne peut donc pas être ajouté depuis cette connexion, sans que cela ne modifie les emails existants.

Le DNS actif doit être administré depuis le fournisseur qui héberge réellement la zone — historiquement Namecheap pour ce domaine. Dans **Namecheap → Domain List → Manage → Advanced DNS**, ajouter un enregistrement **TXT Record** avec :

| Champ Namecheap | Valeur |
|---|---|
| Host | `_dmarc` |
| Value | `v=DMARC1; p=none; adkim=r; aspf=r; pct=100` |
| TTL | Automatic |

Après enregistrement, la vérification peut être relancée depuis Resend et par une résolution DNS publique. Aucun envoi réel ne doit être forcé avant la propagation du TXT.

### Mise à jour après contrôle Namecheap

La capture fournie par le propriétaire confirme qu’un enregistrement **TXT `_dmarc`** existe déjà dans Namecheap et commence bien par `v=DMARC1; p=none; rua=mailto:…`. Il ne faut pas créer de seconde ligne DMARC, car un domaine ne doit publier qu’un seul enregistrement DMARC. La zone Cloudflare connectée n’était pas la zone DNS active, ce qui explique son absence lors de la tentative de lecture dans ce compte.

## Conseils destinataire

Lorsqu’un message légitime est arrivé dans le spam, le destinataire peut l’ouvrir puis choisir **« Non spam »** et ajouter `recrutement@drahmedbenlallahom.com` à ses contacts. Gmail indique que les messages provenant d’une adresse enregistrée dans les contacts sont moins susceptibles d’être classés comme spam. [2]

## Références

[1] [Resend — Top 10 Email Deliverability Tips](https://resend.com/blog/top-10-email-deliverability-tips)  
[2] [Gmail Help — Email sender guidelines](https://support.google.com/mail/answer/81126?hl=en)
