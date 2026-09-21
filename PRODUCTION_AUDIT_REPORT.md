# RAPPORT D'AUDIT ET DE CONFORMITÉ SÉCURITÉ DE PRODUCTION
## PORTUS — Union des Jeunes de la Sécurité Routière de Vridi (U.J.S.R.V.)
**Version de Durcissement :** 2.0 (Passe Finale de Production)  
**Date :** 2026-09-20  
**Statut :** Conforme & Prêt pour Mise en Production  

---

### 1. SYNTHÈSE EXÉCUTIVE

Dans le cadre du durcissement final de l'application **PORTUS U.J.S.R.V.**, l'ensemble des vulnérabilités de conception résiduelles a été éradiqué. L'application sépare désormais de manière étanche :
1. **L'autorité de vérité métier et cryptographique**, centralisée exclusivement au niveau de **Supabase PostgreSQL** via des fonctions RPC `SECURITY DEFINER` et des politiques RLS rigoureuses.
2. **La résilience opérationnelle hors-ligne**, assurée par un cache local **IndexedDB** agissant strictement comme tampon opérationnel asynchrone sans autorité décisionnelle finale.

---

### 2. ARCHITECTURE D'AUTHENTIFICATION & SÉCURITÉ DES ACCÈS

#### 2.1 Élimination des Faiblesses Antérieures
- **Suppression du Guessing de Domaines** : Suppression définitive de toute génération spéculative d'adresses (`@gmail.com`, `@ujsrv.ci`) et de boucles d'essais multiples dans le navigateur.
- **Suppression du Cache d'E-mails en `localStorage`** : Aucune correspondance nom d'utilisateur/adresse e-mail n'est conservée dans le stockage persistant non chiffré du navigateur.
- **Suppression de tout Hachage Client** : Le navigateur n'implémente aucun `hashPassword()` ni `verifyPassword()`. **Supabase Auth** est l'unique autorité de validation des mots de passe.

#### 2.2 Flux de Connexion Unifié
1. **Entrée Utilisateur** : L'agent ou le contrôleur saisit son identifiant unique (nom d'utilisateur ou e-mail) et son mot de passe brut.
2. **Vérification du Verrouillage** : Appel de la fonction `public.get_account_lockout_status`. Si le compte est verrouillé (5 échecs consécutifs), l'accès est bloqué immédiatement pendant 15 minutes avec décompte temps réel.
3. **Résolution Autoritaire** : Si l'identifiant est un nom d'utilisateur, appel de la RPC sécurisée `public.resolve_username_for_auth(p_username)`. Cette fonction `SECURITY DEFINER` résout l'adresse associée directement depuis `auth.users` et `public.profiles` sans divulguer l'annuaire des utilisateurs.
4. **Authentification Supabase Auth** : Une seule tentative est exécutée via `supabase.auth.signInWithPassword`.
5. **Gestion des Tentatives & Verrouillage** : En cas d'échec ou de succès, la RPC `public.record_login_attempt` met à jour le compteur d'échecs et le verrouillage sur le serveur.
6. **Vérification du Profil & Rôle** : L'accès à l'application est subordonné à la présence d'un enregistrement actif (`is_active = true`) dans `public.profiles`. Si le compte a été désactivé par l'administrateur, la session est immédiatement révoquée.

---

### 3. SÉCURISATION CRYPTOGRAPHIQUE DES QR CODES (ANTI-CONTREFAÇON)

#### 3.1 Signature HMAC-SHA256 Côté Serveur
- **Clé Secrète de Signature** : Stockée dans la table sécurisée `public.app_settings` sous la clé `server_hmac_signing_key`. L'accès en lecture à cette table est strictement restreint au rôle `service_role` et aux fonctions `SECURITY DEFINER`. Aucun client authentifié standard ne peut lire cette clé.
- **Format Canonique de Signature** : La fonction `public.sign_ticket_canonical` signe l'ensemble canonique `TICKET_ID:CARNET_ID:TICKET_NUMBER:SECURITY_TOKEN` à l'aide de l'algorithme `HMAC-SHA256` (extension `pgcrypto`).
- **Génération Automatique** : Le trigger `trg_generate_secure_ticket_qr` génère et injecte la signature cryptographique (`sig`) ainsi que le jeton aléatoire (`tok`) dès l'insertion de chaque ticket.

#### 3.2 Vérification Routière Inviolable
- **RPC `verify_ticket_secure`** : Lors du scan ou de la saisie d'un ticket, le contrôleur interroge le serveur qui recalcule et compare la signature HMAC.
- **Détection des Faux Tickets** :
  - Si un ticket physique est cloné ou que le QR est falsifié sans signature valide, le statut `FORGED_SIGNATURE` ou `FORGED_TOKEN` est renvoyé avec alerte rouge immédiate.
  - La vérification contrôle également l'état de remplacement (`is_superseded`), le statut de vente (`SOLD` requis pour circuler) et la concordance d'immatriculation.

---

### 4. TRANSACTIONS ATOMIQUES & RPC MÉTIER SÉCURISÉES

Toutes les opérations sensibles ont été migrées vers des procédures stockées PostgreSQL garantissant l'atomicité et l'idempotence :

| Nom de la RPC | Rôle & Permissions | Garanties de Sécurité |
|---|---|---|
| `verify_ticket_secure` | Public / Authentifié | Validation HMAC côté serveur, contrôle anti-doublon et historique de passage. |
| `record_control_secure` | Contrôleur / Admin | Enregistrement atomique du contrôle, incrémentation du compteur et création automatique d'un rapport de fraude si anomalie détectée. |
| `sell_ticket_secure` | Agent / Admin | Verrouillage de ligne `FOR UPDATE` sur le ticket pour empêcher toute double-vente simultanée ; vérification de l'affectation de l'agent ; idempotence via clé unique `sync_idempotency_key`. |
| `assign_tickets_to_agent_secure` | Responsable / Admin | Affectation transactionnelle de carnets entiers ou par plages de tickets à un agent identifié. |
| `supersede_ticket_secure` | Agent / Admin | Désactivation immédiate de l'ancien ticket lors de l'émission d'un nouveau ticket pour un même véhicule. |
| `resolve_username_for_auth` | Public (Anon) | Résolution aveugle d'identifiant vers e-mail sans fuite de métadonnées utilisateur. |
| `get_account_lockout_status` | Public (Anon) | Consultation de l'état de verrouillage d'un compte (brute-force protection). |
| `record_login_attempt` | Public (Anon) | Enregistrement de tentative et déclenchement automatique du verrouillage de 15 min après 5 échecs. |

---

### 5. DURCISSEMENT ROW LEVEL SECURITY (RLS)

Chaque table du schéma `public` dispose de politiques RLS étanches interdisant toute altération frauduleuse directe :

- **`tickets`** :
  - Seuls les administrateurs et responsables peuvent insérer des tickets (création de carnets).
  - Les agents ne peuvent mettre à jour que les tickets qui leur sont affectés, ou via la RPC `sell_ticket_secure`.
  - La lecture est ouverte aux utilisateurs authentifiés pour les besoins de contrôle et de vérification.
- **`sales`** :
  - Insertion protégée réservée à l'agent ayant vendu le ticket ou via `sell_ticket_secure`.
  - Modification et suppression formellement interdites aux rôles opérationnels (intégrité financière totale).
- **`remittances`** :
  - Validation financière stricte : seul le responsable de secteur ou l'administrateur peut valider une remise.
- **`controls` & `fraud_reports`** :
  - Création autorisée pour les contrôleurs et administrateurs ; suppression interdite.
- **`app_settings`** :
  - Accès public ou direct via API REST anonyme/authentifiée désactivé. Seules les fonctions internes `SECURITY DEFINER` peuvent lire la clé de signature.

---

### 6. POSITIONNEMENT DE LA COUCHE HORS-LIGNE (INDEXEDDB)

- **Tampon Opérationnel** : IndexedDB stocke localement les ventes et contrôles réalisés en zone blanche (sans réseau).
- **Non-Autorité** : IndexedDB ne constitue en aucun cas l'autorité finale sur les droits d'administration, les rôles ou l'état définitif d'un ticket.
- **Synchronisation Idempotente** : Chaque vente hors-ligne dispose d'un identifiant UUID unique et d'un horodatage immuable généré à l'émission. Lors du retour de la connectivité, la synchronisation applique les transactions de façon idempotente sans risque de duplication comptable.

---

### 7. VÉRIFICATION TECHNIQUE & COMPILATION

- **Linter TypeScript (`tsc --noEmit`)** : 0 erreur, 0 avertissement bloquant.
- **Compilateur Vite (`npm run build`)** : Construction de production validée avec succès (`compile_applet`).
- **Absence de Fonctions Prohibées** : Vérification par analyse statique de l'absence totale de `hashPassword()`, `verifyPassword()`, ou de devinettes de domaines.
