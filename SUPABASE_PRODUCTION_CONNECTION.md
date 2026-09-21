# PORTUS — Connexion à la Base de Données Supabase (Production)

## 1. Paramètres du Projet Supabase
- **Nom du Projet** : `PORTUS-UJSRV`
- **Reference ID** : `wbbpaebrhobuaoherwmg`
- **URL API** : `https://wbbpaebrhobuaoherwmg.supabase.co`

## 2. Procédure de Création du Premier Administrateur
1. Dans le tableau de bord Supabase (`Authentication > Users`), créez manuellement le compte administrateur (ex: `admin@ujsrv.ci`).
2. Récupérez l'UUID généré par Supabase Auth.
3. Dans la table `profiles` ou `users`, associez cet UUID avec le rôle `ADMINISTRATEUR`.
4. Connectez-vous sur l'application PORTUS avec ces identifiants.
