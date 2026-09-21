/**
 * Contexte d'authentification pour PORTUS — U.J.S.R.V.
 * 
 * RÈGLES MÉTIER :
 * - Connexion : nom d'utilisateur + mot de passe
 * - Pas de PIN, Pas de 2FA
 * - Après 5 tentatives échouées : verrouillage temporaire de 15 minutes
 * - ⚠️ RÈGLE CRITIQUE : NE JAMAIS transformer ou normaliser les mots de passe.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import type { User, Role, LoginAttempt } from '../types';
import { MAX_LOGIN_ATTEMPTS, LOCKOUT_DURATION_MS } from '../config/constants';
import { getDB } from '../db/indexedDb';
import { SupabaseDataLayer } from '../db/supabaseService';
import { getSupabase } from '../db/supabaseClient';
import type { SupabaseClient } from '@supabase/supabase-js';

interface AuthContextType {
  currentUser: User | null;
  isLoading: boolean;
  loginError: string | null;
  sessionNotice: string | null;
  lockoutRemainingSeconds: number | null;
  login: (username: string, passwordRaw: string) => Promise<boolean>;
  logout: (reason?: string) => Promise<void>;
  changePassword: (currentPasswordRaw: string, newPasswordRaw: string) => Promise<{ success: boolean; error?: string }>;
  clearSessionNotice: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const CURRENT_USER_SESSION_KEY = 'portus_session_user_id';
const SESSION_START_KEY = 'portus_session_created_at';
const SESSION_LAST_ACTIVE_KEY = 'portus_session_last_active';

// Limites de sécurité de session
const SESSION_INACTIVITY_LIMIT_MS = 30 * 60 * 1000; // 30 minutes d'inactivité
const SESSION_MAX_LIFETIME_MS = 8 * 60 * 60 * 1000; // 8 heures maximum par session

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [sessionNotice, setSessionNotice] = useState<string | null>(null);
  const [lockoutRemainingSeconds, setLockoutRemainingSeconds] = useState<number | null>(null);

  const clearSessionNotice = () => setSessionNotice(null);

  // Helper pour enregistrer chaque tentative dans IndexedDB et Supabase
  const logAttempt = async (params: {
    username: string;
    profileId?: string;
    isSuccessful: boolean;
    failureReason?: string;
  }) => {
    try {
      const db = await getDB();
      const attempt: LoginAttempt = {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        username: params.username,
        profileId: params.profileId,
        isSuccessful: params.isSuccessful,
        failureReason: params.failureReason,
        attemptedAt: new Date().toISOString(),
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
      };

      if (db.objectStoreNames.contains('login_attempts')) {
        await db.put('login_attempts', attempt);
      }

      // Envoi à Supabase si connecté
      if (SupabaseDataLayer.isAvailable()) {
        SupabaseDataLayer.recordLoginAttempt(params).catch((e) =>
          console.warn('Supabase login_attempt sync warning:', e)
        );
      }
    } catch (err) {
      console.warn('Erreur enregistrement tentative login:', err);
    }
  };

  // Déconnexion sécurisée
  const logout = async (reason?: string) => {
    const userToLog = currentUser;
    if (userToLog) {
      try {
        const db = await getDB();
        await db.put('audit_logs', {
          id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          actorId: userToLog.id,
          actorName: userToLog.fullName,
          actorRole: userToLog.role,
          action: reason ? 'SESSION_EXPIRED' : 'LOGOUT',
          timestamp: new Date().toISOString(),
          targetEntity: 'User',
          targetId: userToLog.id,
          details: reason || 'Déconnexion volontaire de l’utilisateur',
        });
      } catch (e) {
        console.warn('Erreur log logout:', e);
      }
    }

    try {
      const supabase = getSupabase();
      if (supabase) {
        await supabase.auth.signOut();
      }
    } catch (e) {
      console.warn('Erreur Supabase signOut:', e);
    }

    sessionStorage.removeItem(CURRENT_USER_SESSION_KEY);
    sessionStorage.removeItem(SESSION_START_KEY);
    sessionStorage.removeItem(SESSION_LAST_ACTIVE_KEY);
    setCurrentUser(null);

    if (reason) {
      setSessionNotice(reason);
    }
  };

  // Mettre à jour l'horodatage de dernière activité
  const touchActivity = () => {
    sessionStorage.setItem(SESSION_LAST_ACTIVE_KEY, Date.now().toString());
  };

  // Vérifier la session au démarrage (Supabase Auth en tant qu'autorité exclusive)
  useEffect(() => {
    let authSubscription: { unsubscribe: () => void } | null = null;

    async function restoreSession() {
      try {
        const supabase = getSupabase();
        if (!supabase) {
          setIsLoading(false);
          return;
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (session && session.user) {
          const authUserId = session.user.id;
          let { data: profile } = await supabase
            .from('profiles')
            .select('*, sector:sectors(name)')
            .eq('id', authUserId)
            .maybeSingle();

          if (!profile) {
            const { data: rpcProfile } = await supabase.rpc('get_my_profile');
            if (rpcProfile && typeof rpcProfile === 'object') {
              profile = {
                ...rpcProfile,
                sector: rpcProfile.sector_name ? { name: rpcProfile.sector_name } : undefined,
              };
            }
          }

          const VALID_ROLES: Role[] = ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR'];
          if (profile && profile.is_active && VALID_ROLES.includes(profile.role as Role)) {
            const formattedUser: User = {
              id: profile.id,
              username: profile.username || session.user.email?.split('@')[0] || 'agent',
              fullName: profile.full_name || session.user.email || 'Agent PORTUS',
              role: profile.role || 'AGENT',
              sectorId: profile.sector_id || undefined,
              sectorName: profile.sector?.name || undefined,
              phone: profile.phone || undefined,
              isActive: true,
              failedAttempts: 0,
              createdAt: profile.created_at || new Date().toISOString(),
              updatedAt: profile.updated_at || new Date().toISOString(),
            };
            setCurrentUser(formattedUser);
            touchActivity();

            // Cache local de consultation
            try {
              const db = await getDB();
              await db.put('users', formattedUser);
            } catch {}
          } else {
            // Aucun profil valide ou compte désactivé : accès refusé
            await supabase.auth.signOut();
            sessionStorage.removeItem(CURRENT_USER_SESSION_KEY);
            setCurrentUser(null);
          }
        } else {
          // Aucun token Supabase actif
          sessionStorage.removeItem(CURRENT_USER_SESSION_KEY);
          setCurrentUser(null);
        }

        // Écouter les changements d'état d'authentification Supabase en temps réel
        const { data: sub } = supabase.auth.onAuthStateChange(async (event, newSession) => {
          if (event === 'SIGNED_OUT' || !newSession) {
            sessionStorage.removeItem(CURRENT_USER_SESSION_KEY);
            setCurrentUser(null);
          }
        });
        authSubscription = sub.subscription;
      } catch (err) {
        console.error('Erreur chargement session Supabase', err);
      } finally {
        setIsLoading(false);
      }
    }

    restoreSession();

    return () => {
      if (authSubscription) {
        authSubscription.unsubscribe();
      }
    };
  }, []);

  // Détecteurs d'activité utilisateur (throttle toutes les 15s)
  useEffect(() => {
    if (!currentUser) return;

    let lastUpdate = 0;
    const handleUserActivity = () => {
      const now = Date.now();
      if (now - lastUpdate > 15000) {
        lastUpdate = now;
        touchActivity();
      }
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, handleUserActivity, { passive: true }));

    return () => {
      events.forEach((ev) => window.removeEventListener(ev, handleUserActivity));
    };
  }, [currentUser]);

  // Surveillance périodique de session (toutes les 15 secondes)
  useEffect(() => {
    if (!currentUser) return;

    const interval = setInterval(async () => {
      const now = Date.now();
      const sessionStart = sessionStorage.getItem(SESSION_START_KEY);
      const lastActive = sessionStorage.getItem(SESSION_LAST_ACTIVE_KEY);

      if (sessionStart && now - parseInt(sessionStart, 10) > SESSION_MAX_LIFETIME_MS) {
        clearInterval(interval);
        await logout('Votre session de travail a atteint la limite de 8h. Veuillez vous reconnecter.');
        return;
      }

      if (lastActive && now - parseInt(lastActive, 10) > SESSION_INACTIVITY_LIMIT_MS) {
        clearInterval(interval);
        await logout('Session fermée pour cause d’inactivité (30 min).');
        return;
      }

      // Vérifier si le compte est toujours actif en base
      try {
        const db = await getDB();
        const dbUser = await db.get('users', currentUser.id);
        if (dbUser && !dbUser.isActive) {
          clearInterval(interval);
          await logout('Votre compte a été désactivé par l’administrateur général.');
        }
      } catch {
        // Ignorer les erreurs ponctuelles IndexedDB
      }
    }, 15000);

    return () => clearInterval(interval);
  }, [currentUser]);

  // Décompte de verrouillage (15 minutes)
  useEffect(() => {
    if (!lockoutRemainingSeconds || lockoutRemainingSeconds <= 0) return;

    const timer = setInterval(() => {
      setLockoutRemainingSeconds((prev) => {
        if (!prev || prev <= 1) {
          clearInterval(timer);
          setLoginError(null);
          return null;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutRemainingSeconds]);

  const login = async (usernameInput: string, passwordRaw: string): Promise<boolean> => {
    setLoginError(null);
    setLockoutRemainingSeconds(null);

    const cleanInput = usernameInput.trim();
    if (!cleanInput || !passwordRaw) {
      setLoginError('Veuillez renseigner votre identifiant et votre mot de passe.');
      return false;
    }

    const supabase = getSupabase();
    if (!supabase) {
      setLoginError('Supabase n’est pas configuré. Veuillez vérifier la connexion au serveur.');
      return false;
    }

    // 1. Vérification du verrouillage de compte (serveur Supabase)
    try {
      const lockStatus = await SupabaseDataLayer.getAccountLockoutStatus(cleanInput);
      if (lockStatus.isLocked && lockStatus.remainingSeconds > 0) {
        setLockoutRemainingSeconds(lockStatus.remainingSeconds);
        setLoginError(`Compte temporairement bloqué pendant ${Math.ceil(lockStatus.remainingSeconds / 60)} min suite à 5 tentatives erronées.`);
        return false;
      }
    } catch {
      // Continuer si RPC indisponible
    }

    try {
      // 2. Résolution du compte : si format email direct, on utilise l'email.
      // Si format username, résolution stricte et autoritaire via public.resolve_username_for_auth (AUCUNE devinette de domaine, AUCUN cache local)
      let targetEmail: string;

      if (cleanInput.includes('@')) {
        targetEmail = cleanInput.toLowerCase();
      } else {
        const { data: resolvedEmail, error: rpcErr } = await supabase.rpc('resolve_username_for_auth', {
          p_username: cleanInput.toLowerCase(),
        });

        if (rpcErr) {
          const rpcMsg = rpcErr.message || '';
            if (rpcErr.code === 'PGRST202') {
              setLoginError('La configuration d’authentification Supabase est incomplète. Veuillez appliquer la migration PORTUS dans le projet de production.');
              return false;
            }
          if (rpcMsg.includes('COMPTE_VERROUILLE')) {
            setLockoutRemainingSeconds(900);
            setLoginError('Compte temporairement bloqué pendant 15 minutes suite à 5 tentatives infructueuses.');
            return false;
          }
          if (rpcMsg.includes('Compte désactivé')) {
            setLoginError('Ce compte professionnel a été désactivé par l’administrateur général.');
            return false;
          }
          if (rpcMsg.toLowerCase().includes('failed to fetch') || rpcMsg.toLowerCase().includes('network')) {
            setLoginError("Impossible de joindre le serveur d'authentification U.J.S.R.V.");
            return false;
          }
          console.warn('RPC resolve_username_for_auth error:', rpcErr.message);
        }

        if (!resolvedEmail || typeof resolvedEmail !== 'string' || !resolvedEmail.includes('@')) {
          // Échec de résolution : identifiant inconnu
          setLoginError('Identifiant ou mot de passe incorrect.');
          const lockoutRes = await SupabaseDataLayer.recordLoginAttempt({
            username: cleanInput,
            isSuccessful: false,
            failureReason: 'Identifiant introuvable ou invalide',
          });
          if (lockoutRes && lockoutRes.isLocked) {
            setLockoutRemainingSeconds(lockoutRes.remainingSeconds || 900);
            setLoginError('Compte temporairement bloqué pendant 15 minutes suite à 5 tentatives erronées.');
          }
          return false;
        }

        targetEmail = resolvedEmail.toLowerCase();
      }

      // 3. Authentification unique et stricte auprès de Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email: targetEmail,
        password: passwordRaw,
      });

      if (authError || !authData?.user) {
        const errMsg = authError?.message || '';
        const isNetworkErr =
          errMsg.toLowerCase().includes('failed to fetch') ||
          errMsg.toLowerCase().includes('network') ||
          errMsg.toLowerCase().includes('connection') ||
          errMsg.toLowerCase().includes('injoignable');

        if (isNetworkErr) {
          setLoginError("Impossible de joindre le serveur d'authentification U.J.S.R.V.");
        } else {
          setLoginError('Identifiant ou mot de passe incorrect.');
        }

        // Enregistrement de l'échec et vérification du verrouillage
        const lockoutRes = await SupabaseDataLayer.recordLoginAttempt({
          username: cleanInput,
          isSuccessful: false,
          failureReason: errMsg || 'Identifiant ou mot de passe incorrect.',
        });

        if (lockoutRes && lockoutRes.isLocked) {
          setLockoutRemainingSeconds(lockoutRes.remainingSeconds || 900);
          setLoginError('Compte temporairement bloqué pendant 15 minutes suite à 5 tentatives erronées.');
        } else if (lockoutRes && typeof lockoutRes.attemptsLeft === 'number' && lockoutRes.attemptsLeft <= 2) {
          setLoginError(`Identifiant ou mot de passe incorrect. Attention : plus que ${lockoutRes.attemptsLeft} tentative(s) avant verrouillage.`);
        }

        return false;
      }

      const authUserId = authData.user.id;

      // 4. Vérification autoritaire dans public.profiles
      let { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*, sector:sectors(name)')
        .eq('id', authUserId)
        .maybeSingle();

      if (!profile) {
        // Tentative de récupération via RPC get_my_profile()
        const { data: rpcProfile } = await supabase.rpc('get_my_profile');
        if (rpcProfile && typeof rpcProfile === 'object') {
          profile = {
            ...rpcProfile,
            sector: rpcProfile.sector_name ? { name: rpcProfile.sector_name } : undefined,
          };
          profileErr = null;
        }
      }

      if (profileErr) {
        console.error('[PORTUS Auth] Erreur récupération profil:', profileErr);
        if (profileErr.code === '42501' || profileErr.message?.toLowerCase().includes('permission denied')) {
          setLoginError(`Erreur de privilèges PostgreSQL Supabase : ${profileErr.message}. Veuillez exécuter le script SQL d’attribution des permissions (GRANT EXECUTE).`);
          await supabase.auth.signOut();
          return false;
        }
      }

      if (!profile) {
        setLoginError('Accès refusé. Aucun profil professionnel U.J.S.R.V. n’est associé à ce compte.');
        await supabase.auth.signOut();
        await SupabaseDataLayer.recordLoginAttempt({
          username: cleanInput,
          isSuccessful: false,
          failureReason: 'Profil introuvable dans public.profiles',
        });
        return false;
      }

      if (!profile.is_active) {
        setLoginError('Ce compte professionnel a été désactivé par l’administrateur général.');
        await supabase.auth.signOut();
        await SupabaseDataLayer.recordLoginAttempt({
          username: cleanInput,
          profileId: profile.id,
          isSuccessful: false,
          failureReason: 'Compte désactivé (is_active = false)',
        });
        return false;
      }

      const VALID_ROLES: Role[] = ['ADMINISTRATEUR', 'RESPONSABLE', 'AGENT', 'CONTROLEUR'];
      if (!profile.role || !VALID_ROLES.includes(profile.role as Role)) {
        setLoginError('Accès refusé. Aucun profil professionnel U.J.S.R.V. n’est associé à ce compte.');
        await supabase.auth.signOut();
        return false;
      }

      const formattedUser: User = {
        id: profile.id,
        username: profile.username || cleanInput.split('@')[0],
        fullName: profile.full_name || authData.user.email || 'Agent PORTUS',
        role: profile.role || 'AGENT',
        sectorId: profile.sector_id || undefined,
        sectorName: profile.sector?.name || undefined,
        phone: profile.phone || undefined,
        isActive: true,
        failedAttempts: 0,
        createdAt: profile.created_at || new Date().toISOString(),
        updatedAt: profile.updated_at || new Date().toISOString(),
      };

      // 5. Réinitialisation des tentatives et mise à jour de la dernière connexion
      await SupabaseDataLayer.recordLoginAttempt({
        username: cleanInput,
        profileId: formattedUser.id,
        isSuccessful: true,
      });

      // Synchronisation du profil local pour consultation
      try {
        const db = await getDB();
        await db.put('users', formattedUser);
      } catch (e) {
        console.warn('Cache local warning:', e);
      }

      sessionStorage.setItem(CURRENT_USER_SESSION_KEY, formattedUser.id);
      sessionStorage.setItem(SESSION_START_KEY, Date.now().toString());
      touchActivity();

      setCurrentUser(formattedUser);
      return true;
    } catch (err: any) {
      console.error('Erreur technique lors de la connexion:', err);
        const errorMessage = String(err?.message || '');
        const isNetworkError =
          err?.name === 'TypeError' ||
          errorMessage.toLowerCase().includes('failed to fetch') ||
          errorMessage.toLowerCase().includes('network') ||
          errorMessage.toLowerCase().includes('connection');

        setLoginError(
          isNetworkError
            ? "Impossible de joindre le serveur d'authentification U.J.S.R.V. Vérifiez l'URL Supabase, la clé publique et la connexion réseau."
            : `Erreur technique: ${errorMessage || 'Inconnue'}`
        );
      return false;
    }
  };

  // Changement de mot de passe sécurisé géré exclusivement par Supabase Auth
  const changePassword = async (
    _currentPasswordRaw: string,
    newPasswordRaw: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) {
      return { success: false, error: 'Session non active.' };
    }

    if (!newPasswordRaw || newPasswordRaw.length < 12) {
      return { success: false, error: 'Le nouveau mot de passe doit comporter au moins 12 caractères.' };
    }

    const supabase = getSupabase();
    if (!supabase) {
      return { success: false, error: 'Supabase n’est pas configuré.' };
    }

    try {
      // 1. Mettre à jour le mot de passe dans Supabase Auth
      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPasswordRaw,
      });

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }

      // 2. Journaliser l'événement d'audit
      try {
        const db = await getDB();
        await db.put('audit_logs', {
          id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          actorId: currentUser.id,
          actorName: currentUser.fullName,
          actorRole: currentUser.role,
          action: 'PASSWORD_CHANGED',
          timestamp: new Date().toISOString(),
          targetEntity: 'User',
          targetId: currentUser.id,
          details: `Modification réussie du mot de passe par ${currentUser.username} via Supabase Auth`,
        });
      } catch {}

      return { success: true };
    } catch (err: any) {
      console.error('Erreur changement mot de passe:', err);
      return { success: false, error: err?.message || 'Erreur technique lors du changement de mot de passe.' };
    }
  };

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        isLoading,
        loginError,
        sessionNotice,
        lockoutRemainingSeconds,
        login,
        logout,
        changePassword,
        clearSessionNotice,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth doit être utilisé à l’intérieur d’un AuthProvider');
  }
  return context;
}
