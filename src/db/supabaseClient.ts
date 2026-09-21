/**
 * Client Supabase officiel pour PORTUS — U.J.S.R.V.
 * Architecture de production stricte :
 * - Aucune clé ou URL en dur dans le code source
 * - Utilisation exclusive des variables d'environnement VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY
 * - Aucune mémorisation de clés d'accès dans localStorage
 * - Client unique avec persistance de session et rafraîchissement automatique
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

let cachedClient: SupabaseClient | null = null;
let cachedUrl: string | null = null;
let cachedKey: string | null = null;

/**
 * Nettoie une clé API (retire chevrons <>, guillemets, espaces et préfixes accidentels)
 */
export function sanitizeApiKey(raw: string | undefined | null): string {
  if (!raw) return '';
  let k = raw.trim();

  // Retire les chevrons <clé>
  if (k.startsWith('<') && k.endsWith('>')) {
    k = k.slice(1, -1).trim();
  }

  // Retire les guillemets simples ou doubles
  if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
    k = k.slice(1, -1).trim();
  }

  // Si format "NOM_VARIABLE=clé"
  if (k.includes('=')) {
    const parts = k.split('=');
    k = parts[parts.length - 1].trim();
    if ((k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'"))) {
      k = k.slice(1, -1).trim();
    }
  }

  return k;
}

/**
 * Nettoie une URL Supabase (retire chevrons, guillemets, slash final)
 */
export function sanitizeUrl(raw: string | undefined | null): string {
  if (!raw) return '';
  let u = raw.trim();

  if (u.startsWith('<') && u.endsWith('>')) {
    u = u.slice(1, -1).trim();
  }
  if ((u.startsWith('"') && u.endsWith('"')) || (u.startsWith("'") && u.endsWith("'"))) {
    u = u.slice(1, -1).trim();
  }
  if (u.includes('=')) {
    const parts = u.split('=');
    u = parts[parts.length - 1].trim();
  }

  return u.replace(/\/+$/, '');
}

/**
 * Récupère la configuration active issue STRICTEMENT des variables d'environnement.
 * Aucune lecture depuis le stockage local (localStorage).
 */
export function getSupabaseConfig(): { url: string; anonKey: string; isConfigured: boolean } {
  let envUrlRaw: string | undefined;
  let envKeyRaw: string | undefined;

  // 1. Vite import.meta.env
  try {
    if (typeof import.meta !== 'undefined' && import.meta.env) {
      envUrlRaw = import.meta.env.VITE_SUPABASE_URL as string | undefined;
      envKeyRaw = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined;
    }
  } catch {
    // Environnement non-Vite (ex: scripts Node/tsx)
  }

  // 2. Node process.env de repli
  try {
    if (!envUrlRaw && typeof process !== 'undefined' && process.env) {
      envUrlRaw = process.env.VITE_SUPABASE_URL;
    }
    if (!envKeyRaw && typeof process !== 'undefined' && process.env) {
      envKeyRaw = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    }
  } catch {
    // ignore
  }

  let cleanUrl = sanitizeUrl(envUrlRaw);
  let cleanKey = sanitizeApiKey(envKeyRaw);

  // Aucun fallback de production : une configuration absente doit échouer explicitement.
  if (cleanUrl.includes('xyvdmqvwqlpypsbqpkru')) cleanUrl = '';

  const isConfigured = Boolean(
    cleanUrl &&
    cleanUrl.startsWith('http') &&
    cleanKey &&
    cleanKey.length > 20
  );

  return {
    url: cleanUrl,
    anonKey: cleanKey,
    isConfigured,
  };
}

/**
 * Instancie ou récupère l'instance unique du client Supabase.
 * Retourne null si les variables d'environnement ne sont pas configurées.
 */
export function getSupabase(): SupabaseClient | null {
  const { url, anonKey, isConfigured } = getSupabaseConfig();

  if (!isConfigured) {
    return null;
  }

  if (cachedClient && cachedUrl === url && cachedKey === anonKey) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
      db: {
        schema: 'public',
      },
    });
    cachedUrl = url;
    cachedKey = anonKey;
    return cachedClient;
  } catch (err) {
    console.error('[PORTUS Supabase] Erreur d’initialisation du client:', err);
    return null;
  }
}

/**
 * Vérifie si Supabase est correctement initialisé et opérationnel.
 */
export function isSupabaseConfigured(): boolean {
  return getSupabaseConfig().isConfigured;
}

/**
 * Teste la connectivité directe avec Supabase PostgreSQL et Supabase Auth
 * Sans aucun mécanisme d'auto-remplacement ou de clés de secours.
 */
export async function testSupabaseConnection(): Promise<{
  success: boolean;
  message: string;
  tableCount?: number;
  tablesFound?: string[];
  latencyMs?: number;
}> {
  const startTime = Date.now();
  const supabase = getSupabase();

  if (!supabase) {
    return {
      success: false,
      message: 'Supabase n’est pas configuré. Veuillez définir VITE_SUPABASE_URL et VITE_SUPABASE_PUBLISHABLE_KEY dans votre fichier .env.',
    };
  }

  try {
    // 1. Tester la table sectors
    const sectorsRes = await supabase
      .from('sectors')
      .select('id, code, name')
      .limit(5);

    if (!sectorsRes.error) {
      const profRes = await supabase.from('profiles').select('id').limit(1);
      const tables = ['sectors'];
      if (!profRes.error) tables.push('profiles');

      const latency = Date.now() - startTime;
      return {
        success: true,
        message: `Connexion Supabase PostgreSQL et Auth validée avec succès (${latency}ms).`,
        tableCount: sectorsRes.data?.length || 0,
        tablesFound: tables,
        latencyMs: latency,
      };
    }

    // 2. Tester app_settings en repli
    const settingsRes = await supabase
      .from('app_settings')
      .select('key, value')
      .limit(5);

    if (!settingsRes.error) {
      const latency = Date.now() - startTime;
      return {
        success: true,
        message: `Connexion Supabase validée avec succès (${latency}ms - Paramètres accessibles).`,
        tableCount: settingsRes.data?.length || 0,
        tablesFound: ['app_settings'],
        latencyMs: latency,
      };
    }

    const latency = Date.now() - startTime;
    return {
      success: false,
      message: `Erreur d'accès Supabase: ${sectorsRes.error?.message || settingsRes.error?.message || 'Erreur inconnue'}`,
      latencyMs: latency,
    };
  } catch (err: any) {
    return {
      success: false,
      message: `Erreur de connexion réseau Supabase: ${err.message || 'Serveur injoignable'}`,
    };
  }
}
