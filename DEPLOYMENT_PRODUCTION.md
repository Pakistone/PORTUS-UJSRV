# PORTUS U.J.S.R.V. — Déploiement production

## Architecture
- React/Vite/PWA frontend
- Express/Node backend
- Supabase Auth + PostgreSQL + RLS + RPC
- IndexedDB offline-first
- Cloud Run compatible via Dockerfile

## Variables obligatoires
Frontend:
- VITE_SUPABASE_URL
- VITE_SUPABASE_PUBLISHABLE_KEY

Backend:
- SUPABASE_URL
- SUPABASE_SECRET_KEY
- APP_ORIGIN
- PORT

## Sécurité QR
Les QR officiels sont signés côté PostgreSQL avec un secret stocké dans Supabase Vault (`portus_qr_hmac_v1`). Le navigateur ne doit jamais contenir la clé de signature.

## Déploiement
1. Installer les dépendances avec `npm install`.
2. Vérifier `npm run check`.
3. Construire avec `npm run build`.
4. Construire l'image `docker build -t portus-ujsrv .`.
5. Déployer l'image sur Cloud Run avec `SUPABASE_URL` et `SUPABASE_SECRET_KEY` fournis par Secret Manager.
6. Vérifier `/api/health` puis `/api/readyz`.

## Base de données
La migration de durcissement est enregistrée dans `supabase/migrations/20260921120000_portus_production_hardening.sql`.

Le projet Supabase de production utilisé pendant l'audit est actif et sain. Les tests SQL réalisés ont confirmé la génération d'une signature QR HMAC de 64 caractères et le refus d'un ticket inconnu.

## Avant ouverture au public
- Activer la protection contre les mots de passe compromis dans Supabase Auth.
- Configurer le domaine de production et CORS/APP_ORIGIN.
- Vérifier les sauvegardes et la politique de restauration.
- Vérifier le déploiement Cloud Run avec HTTPS.
