import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { createClient } from '@supabase/supabase-js';

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(self), geolocation=(self), microphone=()');
  next();
});

const rateWindowMs = 60_000;
const rateLimit = 120;
const rateBuckets = new Map<string, { started: number; count: number }>();
app.use((req, res, next) => {
  const key = req.ip || 'unknown';
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || now - bucket.started >= rateWindowMs) rateBuckets.set(key, { started: now, count: 1 });
  else if (++bucket.count > rateLimit) return res.status(429).json({ error: 'Trop de requêtes. Réessayez dans un instant.' });
  next();
});

// Client Supabase Administrateur (côté serveur uniquement - SUPABASE_SECRET_KEY)
const supabaseUrl = process.env.SUPABASE_URL?.trim() || process.env.VITE_SUPABASE_URL?.trim() || '';
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY || '';

if (process.env.NODE_ENV === 'production' && (!supabaseUrl || !supabaseSecretKey)) {
  throw new Error('SUPABASE_URL et SUPABASE_SECRET_KEY sont obligatoires en production.');
}

if (!supabaseSecretKey) {
  console.warn('[PORTUS Server] ATTENTION: SUPABASE_SECRET_KEY n’est pas défini dans process.env!');
}

const supabaseAdmin = createClient(supabaseUrl || 'http://127.0.0.1:54321', supabaseSecretKey || 'development-only-placeholder', {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

// Middleware de vérification du rôle Administrateur
async function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Session non authentifiée (Jeton Bearer manquant)' });
  }

  const token = authHeader.split(' ')[1];
  try {
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) {
      console.warn('[PORTUS Server requireAdmin] authErr:', authErr?.message);
      return res.status(401).json({ error: 'Jeton de session invalide ou expiré' });
    }

    const { data: profile, error: profErr } = await supabaseAdmin
      .from('profiles')
      .select('role, is_active')
      .eq('id', user.id)
      .maybeSingle();

    if (profErr || !profile || profile.role !== 'ADMINISTRATEUR' || !profile.is_active) {
      return res.status(403).json({ error: 'Action strictement réservée à l’administrateur général PORTUS' });
    }

    (req as any).adminUser = user;
    next();
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Erreur interne d’authentification' });
  }
}

// Helper pour convertir un ID frontend (ex: sec-vridi-canal) en UUID Supabase valide
async function resolveSectorUuid(sectorIdOrCode?: string): Promise<string | null> {
  if (!sectorIdOrCode) return null;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuidRegex.test(sectorIdOrCode)) {
    return sectorIdOrCode;
  }

  const mapping: Record<string, string> = {
    'sec-vridi-port': 'VRD-PORT',
    'sec-vridi-canal': 'VRD-CANAL',
    'sec-vridi-zi': 'VRD-ZONE-IND',
    'sec-vridi-sir': 'VRD-TERMINAL',
  };

  const code = mapping[sectorIdOrCode] || sectorIdOrCode;

  const { data: sector } = await supabaseAdmin
    .from('sectors')
    .select('id')
    .or(`code.eq.${code},name.ilike.%${sectorIdOrCode}%`)
    .maybeSingle();

  return sector?.id || null;
}

// ------------------------------------------------------------------
// ROUTES API ADMINISTRATEUR (PROXY SÉCURISÉ)
// ------------------------------------------------------------------

app.get('/api/health', async (_req, res) => {
  if (!supabaseSecretKey || !supabaseUrl) return res.status(503).json({ status: 'degraded', supabase: false });
  const { error } = await supabaseAdmin.from('app_settings').select('key').limit(1);
  res.status(error ? 503 : 200).json({ status: error ? 'degraded' : 'ok', supabase: !error, timestamp: new Date().toISOString() });
});
app.get('/api/readyz', async (_req, res) => {
  const { error } = await supabaseAdmin.from('sectors').select('id').limit(1);
  if (error) return res.status(503).json({ ready: false });
  res.json({ ready: true });
});

// ------------------------------------------------------------------
// CONFIGURATION SERVEUR ET VITE MIDDLEWARE
// ------------------------------------------------------------------

async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PORTUS Server] En écoute sur http://0.0.0.0:${PORT}`);
  });
}

startServer();
