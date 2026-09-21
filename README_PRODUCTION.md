# PORTUS U.J.S.R.V. — Guide de Déploiement en Production

## 1. Vue d'ensemble
PORTUS est une application web progressive (PWA) conçue pour la gestion des tickets de stationnement poids lourds, le contrôle des QR Codes sur le corridor de Vridi, et la synchronisation sécurisée hors-ligne (Offline-First via IndexedDB et Supabase).

## 2. Configuration Supabase (Production)
- **Project ID** : `wbbpaebrhobuaoherwmg`
- **Region** : `eu-west-3`
- **URL** : `https://wbbpaebrhobuaoherwmg.supabase.co`

### Variables d'environnement requises (`.env` ou secrets de l'hébergeur) :
```env
VITE_SUPABASE_URL=https://wbbpaebrhobuaoherwmg.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=votre_clé_anonyme_publique_supabase
```

## 3. Sécurité & Rôles
- **Authentification** : Exclusivement via Supabase Auth (pas de comptes fictifs ou d'accès par défaut non sécurisés).
- **Rôles Officiels** : `ADMINISTRATEUR`, `RESPONSABLE`, `AGENT`, `CONTROLEUR`.
- **Row Level Security (RLS)** : Activé sur toutes les tables PostgreSQL pour garantir l'isolation des données par secteur et par rôle.
- **HMAC-SHA256** : Signature cryptographique des QR Codes des tickets.
