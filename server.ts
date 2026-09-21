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

// Récupération de tous les utilisateurs depuis Supabase profiles
app.get('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*, sector:sectors(name)')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ users: data || [] });
  } catch (err: any) {
    console.error('[API Admin] Erreur fetch users:', err);
    res.status(500).json({ error: err.message });
  }
});

// Création d'un utilisateur officiel (Supabase Auth + public.profiles)
app.post('/api/admin/users', requireAdmin, async (req, res) => {
  try {
    const { username, fullName, role, sectorId, phone, passwordRaw } = req.body;

    if (!username || !fullName || !passwordRaw) {
      return res.status(400).json({ error: 'Nom d’utilisateur, nom complet et mot de passe sont obligatoires' });
    }
    if (passwordRaw.length < 12) return res.status(400).json({ error: 'Le mot de passe doit comporter au moins 12 caractères.' });

    const cleanUsername = username.trim().toLowerCase();
    const email = cleanUsername.includes('@') ? cleanUsername : `${cleanUsername}@portus.ujsrv.ci`;

    // Vérifier l'unicité de l'identifiant
    const { data: existing } = await supabaseAdmin
      .from('profiles')
      .select('id')
      .eq('username', cleanUsername)
      .maybeSingle();

    if (existing) {
      return res.status(409).json({ error: `Le nom d’utilisateur "${cleanUsername}" est déjà utilisé dans la base.` });
    }

    // 1. Création dans Supabase Auth (autorité de mot de passe)
    const { data: authData, error: authErr } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: passwordRaw,
      email_confirm: true,
      user_metadata: {
        username: cleanUsername,
        full_name: fullName.trim(),
        role,
      },
    });

    if (authErr || !authData?.user) {
      console.error('[API Admin] Erreur auth.admin.createUser:', authErr);
      return res.status(400).json({ error: authErr?.message || 'Erreur lors de la création Supabase Auth' });
    }

    const newUserId = authData.user.id;
    const resolvedSectorId = (role === 'AGENT' || role === 'RESPONSABLE') ? await resolveSectorUuid(sectorId) : null;

    // 2. Création du profil autoritaire dans public.profiles
    const { data: newProfile, error: profileErr } = await supabaseAdmin
      .from('profiles')
      .upsert({
        id: newUserId,
        username: cleanUsername,
        full_name: fullName.trim(),
        role,
        sector_id: resolvedSectorId,
        phone: phone?.trim() || null,
        is_active: true,
        failed_attempts: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select('*, sector:sectors(name)')
      .single();

    if (profileErr) {
      console.error('[API Admin] Erreur profiles upsert:', profileErr);
      // Rollback auth
      await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
      return res.status(500).json({ error: `Erreur insertion profil : ${profileErr.message}` });
    }

    console.log(`[API Admin] Utilisateur créé avec succès : ${cleanUsername} (${newUserId}) - Rôle: ${role}`);
    res.status(201).json({ user: newProfile });
  } catch (err: any) {
    console.error('[API Admin] Erreur création:', err);
    res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
});

// Modification d'un utilisateur
app.patch('/api/admin/users/:id', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, phone, sectorId, role, isActive } = req.body;

    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (fullName !== undefined) updates.full_name = fullName.trim();
    if (phone !== undefined) updates.phone = phone?.trim() || null;
    if (sectorId !== undefined) updates.sector_id = sectorId ? await resolveSectorUuid(sectorId) : null;
    if (role !== undefined) updates.role = role;
    if (isActive !== undefined) updates.is_active = isActive;

    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update(updates)
      .eq('id', id)
      .select('*, sector:sectors(name)')
      .single();

    if (error) throw error;
    res.json({ user: data });
  } catch (err: any) {
    console.error('[API Admin] Erreur mise à jour:', err);
    res.status(500).json({ error: err.message });
  }
});

// Réinitialisation du mot de passe d'un utilisateur par l'admin
app.post('/api/admin/users/:id/reset-password', requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { newPasswordRaw } = req.body;

    if (!newPasswordRaw || newPasswordRaw.length < 12) {
      return res.status(400).json({ error: 'Le nouveau mot de passe doit comporter au moins 12 caractères' });
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(id, {
      password: newPasswordRaw,
    });

    if (error) throw error;
    console.log(`[API Admin] Mot de passe réinitialisé pour l'utilisateur ${id}`);
    res.json({ success: true, message: 'Mot de passe mis à jour avec succès dans Supabase Auth' });
  } catch (err: any) {
    console.error('[API Admin] Erreur reset password:', err);
    res.status(500).json({ error: err.message });
  }
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
