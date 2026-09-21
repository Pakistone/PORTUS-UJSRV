# MANUEL TECHNIQUE D'EXPLOITATION & PROTOCOLES DE SÉCURITÉ
## PORTUS — UNION DES JEUNES DE LA SÉCURITÉ ROUTIÈRE DE VRIDI (U.J.S.R.V.)
**Système officiel de perception, traçabilité et contrôle des vignettes poids lourds sur le corridor portuaire et industriel d'Abidjan - Vridi.**

---

> ### RAPPEL DU MANDAT OFFICIEL
> **L'U.J.S.R.V. ne gère pas les parkings.**  
> Sa mission exclusive est la régulation, la fluidité, la traçabilité et la perception des droits de passage et de sécurité routière pour les camions poids lourds et véhicules de fret transitant sur le corridor portuaire et industriel de Vridi.

---

## 1. ARCHITECTURE TECHNIQUE & SÉCURITÉ DE PRODUCTION

PORTUS est une application Web Progressive (PWA) de niveau industriel, conçue selon le principe **Offline-First**, interconnectée à **Supabase (PostgreSQL & Supabase Auth)**.

### Composants Clés
* **Interface & Moteur Client** : React 19, TypeScript, Tailwind CSS, Lucide Icons, moteur d'animation fluide.
* **Persistance & Cache Hors-Ligne** : IndexedDB (`idb`) stockant les tickets attribués, les ventes hors-ligne et les logs d'audit.
* **Moteur d'Authentification & RLS** : Supabase Auth (autorité exclusive de sécurité). Les mots de passe ne sont **jamais** stockés en clair ni dans le cache local.
* **Lecteur Optique Haute Température** : Module QR Code (`jsQR`) optimisé pour éviter l'échauffement des smartphones sous forte chaleur tropicale (bridage à 10-12 FPS, zone centrale 360×360 px).
* **Génération de Quittances & Preuves** : Impression locale de reçus PDF (`jspdf`), export Excel (`xlsx`), et intégration WhatsApp (`wa.me`).

---

## 2. INITIALISATION SÉCURISÉE DU PREMIER ADMINISTRATEUR

Conformément aux normes de sécurité, **aucun compte administrateur par défaut n'est pré-créé avec mot de passe générique**.

### Procédure de création du premier Administrateur en production :
1. **Création dans Supabase Auth** :
   * Accéder à la console Supabase du projet (`https://wbbpaebrhobuaoherwmg.supabase.co`).
   * Ouvrir la section **Authentication > Users**.
   * Cliquer sur **Add User > Create User** et renseigner un e-mail officiel (ex: `admin.ujsrv@gmail.com`) avec un mot de passe fort (minimum 12 caractères, comprenant majuscules, chiffres et symboles).
2. **Récupération de l'UUID** :
   * Copier l'identifiant unique UUID généré par Supabase (ex: `a1b2c3d4-e5f6-7890-abcd-1234567890ab`).
3. **Création du profil professionnel dans `public.profiles`** :
   * Ouvrir l'éditeur SQL de Supabase et exécuter la requête d'association :
   ```sql
   INSERT INTO public.profiles (id, username, full_name, role, is_active)
   VALUES (
     'VOTRE_UUID_SUPABASE_AUTH_ICI',
     'admin.ujsrv',
     'Administrateur Général U.J.S.R.V.',
     'ADMINISTRATEUR',
     true
   )
   ON CONFLICT (id) DO UPDATE SET 
     role = 'ADMINISTRATEUR', 
     is_active = true;
   ```
4. **Vérification** :
   * Se connecter sur l'application avec l'e-mail (ou le nom d'utilisateur) et le mot de passe configuré.
   * L'accès au tableau de bord **ADMINISTRATEUR** est immédiatement effectif avec l'ensemble des privilèges RLS.

---

## 3. GUIDE OPÉRATIONNEL DES RÔLES TERRAIN

```
+-----------------------------------------------------------------------------------+
|                            HIÉRARCHIE DES RÔLES U.J.S.R.V.                        |
+-----------------------------------------------------------------------------------+
|  [ADMINISTRATEUR]  -> Paramétrage, génération de carnets, audits, registre camions|
|         |                                                                         |
|  [RESPONSABLE]     -> Distribution de carnets, réattribution, encaissement remises|
|         |                                                                         |
|     +---+---+                                                                     |
|     |       |                                                                     |
|  [AGENT] [CONTRÔLEUR]                                                             |
|  (Perception)  (Vérification corridor & détection de fraudes)                     |
+-----------------------------------------------------------------------------------+
```

---

### A. RÔLE : AGENT PERCEPTEUR TERRAIN

**Mission** : Percevoir le droit de passage officiel (5 000 FCFA) par camion, saisir l'immatriculation et délivrer la quittance.

#### 1. Prise de service
* Se connecter sur l'application avec ses identifiants.
* Vérifier dans l'onglet **« Mes Tickets »** le lot de tickets qui lui a été confié par son responsable de secteur.
* Vérifier l'état du réseau (indicateur En Ligne / Hors-Ligne dans l'en-tête).

#### 2. Procédure de vente d'un ticket
1. Cliquer sur **« VENDRE UN TICKET »** (ou sélectionner le premier ticket disponible).
2. **Saisie de la plaque d'immatriculation** :
   * Taper les caractères de la plaque (ex: `1234AB01` ou `AB-123-CD`). Le système convertit automatiquement en majuscules et normalise la chaîne.
   * **Recherche automatique** : Si le camion est déjà connu dans le registre de la flotte, le numéro du chauffeur s'auto-complète instantanément.
3. **Sélection du pays d'immatriculation** :
   * Sélectionner le pays CEDEAO (Côte d'Ivoire, Burkina Faso, Mali, Niger, Ghana, Togo, Bénin, etc.).
4. **Saisie du téléphone chauffeur** :
   * Indiquer le numéro pour l'envoi de la quittance WhatsApp.
5. **Validation et encaissement** :
   * Encaisser la somme exacte de **5 000 FCFA**.
   * Cliquer sur **« Confirmer la vente »**. La géolocalisation GPS est relevée en arrière-plan sans bloquer la vente.
6. **Délivrance de la quittance** :
   * Cliquer sur **« Envoyer Quittance WhatsApp »** pour transmettre le reçu numérique officiel au chauffeur, ou présenter le reçu à l'écran.

#### 3. Fonctionnement Hors-Ligne
* Si la connexion Internet faiblit ou disparaît sur le corridor de Vridi, l'application bascule automatiquement en mode hors-ligne sans message bloquant.
* Les ventes sont mémorisées dans la file d'attente sécurisée du terminal (`sync_queue`).
* Dès le retour d'une connexion réseau, la synchronisation se déclenche automatiquement.

---

### B. RÔLE : RESPONSABLE DE SECTEUR

**Mission** : Encadrer les agents du secteur portuaire, leur allouer les tickets, enregistrer les remises en espèces et gérer les invendus.

#### 1. Réception et affectation des carnets
* Les carnets sont émis par l'Administrateur Général (taille obligatoire : multiple de 3 tickets).
* Le Responsable attribue des tickets ou des carnets entiers aux agents actifs de son secteur.
* Une attribution transversale permet d'allouer des tickets à des agents en renfort.

#### 2. Suivi financier étanche
* Le Responsable consulte en temps réel dans **« Suivi Financier »** :
  * **Montant Attendu** = $\text{Tickets vendus de ses lots} \times 5\,000\text{ FCFA}$.
  * **Montant Encaissé (Remises)** = Somme des versements confirmés en espèces.
  * **Solde Restant Dû** par chaque agent.
* **Règle d'étanchéité** : Si un agent vend des tickets émis par un *autre* responsable, le système isole rigoureusement les flux pour qu'aucune interférence financière n'intervienne.

#### 3. Enregistrement d'une Remise
1. Lors du versement physique des espèces par un agent, cliquer sur **« Enregistrer une Remise »**.
2. Sélectionner l'agent concerné et saisir le montant en FCFA (qui doit être un multiple de 5 000 FCFA).
3. Le système calcule automatiquement le nombre de tickets soldés et génère une référence unique d'encaissement.
4. Une fois validée, la remise est immuable et tracée dans le journal d'audit.

#### 4. Gestion des invendus et fin de vacation
* Si un agent termine sa rotation avec des tickets non vendus, le responsable peut les réaffecter à un autre agent ou les réintégrer à son stock disponible sans perte de traçabilité.

---

### C. RÔLE : CONTRÔLEUR ROUTIER

**Mission** : Vérifier sur le corridor la régularité des camions en circulation et sanctionner les falsifications.

#### 1. Contrôle d'un véhicule
1. Ouvrir l'onglet **« Contrôles & Vérifications »** et cliquer sur **« Scanner un Ticket »**.
2. **Scan Optique** : Pointer l'objectif sur le QR code présenté par le chauffeur.
   * L'application analyse la signature cryptographique (`tok`) et le numéro de ticket.
   * En cas de caméra non disponible ou de QR code endommagé, utiliser la **« Saisie Manuelle »** de la plaque ou du numéro de ticket.
3. **Résultat immédiat du contrôle** :
   * 🟢 **TICKET VALIDE** : Le ticket est officiel, vendu pour ce camion précis, et actif.
   * 🔴 **ANOMALIE / INFRACTION** : L'alerte détaille la cause exacte :
     * *Camion différent* : La plaque du camion contrôlé ne correspond pas à celle enregistrée lors de la vente.
     * *Ticket non vendu ou falsifié* : Le numéro n'existe pas ou le token de sécurité est corrompu.
     * *Ticket réutilisé / expiré* : Déjà contrôlé sous des conditions suspectes ou annulé.

#### 2. Signalement d'une fraude
1. En cas d'irrégularité avérée, cliquer sur **« Signaler une Fraude »**.
2. Sélectionner le type d'infraction :
   * `CAMION_DIFFERENT`
   * `TICKET_SUSPECT`
   * `TICKET_FALSIFIE`
   * `TICKET_DEJA_PRESENTE`
   * `AUTRE`
3. Renseigner l'immatriculation exacte constatée et joindre une photo de preuve si disponible.
4. Valider le rapport : une notification critique est transmise instantanément au tableau de bord de l'Administrateur et du Responsable.

#### 3. Annuaire & Sécurité des équipes sur le terrain
* Accéder à l'onglet **« Annuaire & Localisation Agents »**.
* Joindre instantanément un collègue par appel téléphonique direct en un clic (`tel:`).
* Visualiser l'heure et la position de la dernière vente enregistrée de chaque agent pour coordonner les patrouilles sur les axes portuaires.

---

### D. RÔLE : ADMINISTRATEUR GÉNÉRAL

**Mission** : Piloter l'ensemble du dispositif, garantir la conformité financière et administrer les comptes.

#### 1. Paramétrage des séries et carnets
* Générer les nouveaux lots de carnets (série officielle `VRD`, format multiple de 3).
* Affecter les carnets aux responsables de secteur.

#### 2. Registre centralisé des flottes poids lourds (`truck_registry`)
* Consultation de l'historique complet de tous les camions ayant circulé à Vridi.
* Recherche instantanée par plaque, identification du transporteur et récurrence de passage.
* Exportation certifiée au format Excel pour les bilans de circulation portuaire.

#### 3. Sécurité des comptes & Règle des 15 minutes
* Création et désactivation des comptes utilisateurs.
* En cas de 5 tentatives infructueuses de mot de passe, le compte est automatiquement **verrouillé pendant 15 minutes** (protection anti-brute-force). L'administrateur peut lever ce verrouillage manuellement en cas d'urgence opérationnelle.

---

## 4. PROTOCOLES D'URGENCE & GESTION D'INCIDENTS

### PROTOCOLE 1 : Coupure Réseau Prolongée sur le Corridor
1. **Consigne aux agents** : Poursuivre la perception normalement. L'application continue d'enregistrer les ventes dans IndexedDB.
2. **Consigne aux contrôleurs** : Utiliser la vérification locale en mémoire cache ou la saisie de plaque.
3. **Retour du réseau** : La file d'attente locale synchronise les opérations sans doublon grâce à la clé d'idempotence UUID (`sync_idempotency_key`). Ne pas forcer le rechargement brutal du navigateur.

---

### PROTOCOLE 2 : Remplacement d'un Ticket Erroné (Protocole de Remplacement)
Si un agent commet une erreur de saisie sur la plaque ou si un ticket est imprimé de manière défectueuse :
1. Seul l'**Administrateur** ou le **Responsable habilité** peut effectuer la procédure de remplacement.
2. Un nouveau ticket valide est émis en remplacement.
3. L'ancien ticket est marqué du statut `SUPERSEDED` (`is_superseded = true`), avec liaison obligatoire vers le nouveau ticket (`superseded_by_ticket_id`).
4. L'ancien ticket devient immédiatement invalide lors des contrôles routiers pour empêcher toute double utilisation.

---

### PROTOCOLE 3 : Réorganisation ou Clôture d'un Secteur
Lorsqu'un secteur géographique de Vridi doit être restructuré ou fermé :
1. **Vérification des dépendances actives** :
   * Contrôler les agents actuellement rattachés au secteur.
   * Contrôler les carnets et tickets non encore épuisés attribués à ce secteur.
2. **Interdiction de suppression directe** :
   * Le système **rejette** la suppression d'un secteur tant que des dépendances actives y sont rattachées.
3. **Réattribution obligatoire** :
   * Transférer tous les utilisateurs vers un autre secteur actif.
   * Réaffecter les carnets au nouveau secteur.
4. **Archivage sans orphelin** : Une fois toutes les liaisons réaffectées, désactiver le secteur (`is_active = false`). Les données historiques des ventes passées demeurent intactes et auditables.

---

### PROTOCOLE 4 : Détection de Ticket Falsifié en Contrôle
1. Le contrôleur bloque le véhicule sur l'aire sécurisée.
2. Photographier le faux ticket physique et la plaque d'immatriculation du camion.
3. Soumettre le signalement de fraude sur l'application (`TICKET_FALSIFIE`).
4. Prévenir le Responsable de secteur via le bouton d'appel direct de l'annuaire pour intervention conjointe avec les forces de sécurité portuaire.
5. Consigner le faux ticket physique comme pièce à conviction.

---

*Document de référence technique et opérationnel — U.J.S.R.V. Direction des Systèmes d'Information et de la Sécurité.*
