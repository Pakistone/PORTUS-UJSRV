# PORTUS — U.J.S.R.V.
**Système officiel de gestion des tickets de stationnement poids lourds, ventes terrain, contrôles corridor et traçabilité.**

- **Organisation** : Union des Jeunes de la Sécurité Routière de Vridi (U.J.S.R.V.)
- **Zone d'intervention** : Corridor portuaire et industriel de Vridi — Port Autonome d'Abidjan
- **Contacts** : 0777917804 / 0103313768
- **Projet Supabase** : `PORTUS-UJSRV` (`wbbpaebrhobuaoherwmg`)

## Architecture & Technologies
- **Frontend** : React 19, TypeScript, Tailwind CSS, Lucide Icons, Vite.
- **Persistance & Hors-Ligne** : IndexedDB (Offline-First) avec file d'attente de synchronisation (`sync_queue`).
- **Backend & Auth** : Supabase PostgreSQL, Supabase Auth, Row Level Security (RLS), Edge Functions.
- **Sécurité** : Signatures cryptographiques HMAC-SHA256 pour les QR Codes des tickets, hachage PBKDF2.
