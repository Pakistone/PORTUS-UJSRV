import React, { useState } from 'react';
import { ShieldCheck, Lock, User, AlertCircle, Clock, CheckCircle, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { ORG_INFO } from '../../config/constants';
import { PWAInstallButton } from '../pwa/PWAInstallButton';

export const LoginView: React.FC = () => {
  const { login, loginError, sessionNotice, clearSessionNotice, lockoutRemainingSeconds, isLoading } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showForgotModal, setShowForgotModal] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (lockoutRemainingSeconds && lockoutRemainingSeconds > 0) return;

    setSubmitting(true);
    await login(username.trim(), password);
    setSubmitting(false);
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950 p-4 sm:p-6">
      <div className="w-full max-w-md space-y-6">
        {/* En-tête Organisation */}
        <div className="text-center space-y-2">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-emerald-600 to-emerald-400 shadow-xl shadow-emerald-950">
            <ShieldCheck className="h-10 w-10 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-wider text-white">
            {ORG_INFO.NAME}
          </h1>
          <p className="text-xs font-semibold uppercase tracking-widest text-emerald-400">
            {ORG_INFO.SHORT_ORG_NAME}
          </p>
          <p className="text-xs text-slate-400 max-w-xs mx-auto">
            {ORG_INFO.FULL_ORG_NAME}
          </p>
        </div>

        {/* Notification d'expiration de session */}
        {sessionNotice && (
          <div className="flex items-start justify-between gap-2.5 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5 text-xs text-sky-200">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 shrink-0 text-sky-400" />
              <span>{sessionNotice}</span>
            </div>
            <button
              onClick={clearSessionNotice}
              className="text-sky-400 hover:text-white text-xs font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}

        {/* Carte de Connexion */}
        <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-8 shadow-2xl backdrop-blur-md">
          <div className="mb-6 border-b border-slate-800 pb-4">
            <h2 className="text-lg font-bold text-white">Accès Sécurisé</h2>
            <p className="text-xs text-slate-400">
              Veuillez saisir vos identifiants professionnels
            </p>
          </div>

          {/* Alerte Compte Verrouillé (15 min) */}
          {lockoutRemainingSeconds && lockoutRemainingSeconds > 0 ? (
            <div className="mb-5 rounded-xl border border-rose-500/40 bg-rose-500/10 p-4 text-rose-300 space-y-2">
              <div className="flex items-center gap-2 font-bold text-sm">
                <Clock className="w-5 h-5 text-rose-400 animate-pulse" />
                <span>COMPTE TEMPORAIREMENT BLOQUÉ</span>
              </div>
              <p className="text-xs text-rose-200 leading-relaxed">
                5 tentatives échouées consécutives ont été détectées. Par mesure de sécurité,
                ce compte est verrouillé pendant 15 minutes.
              </p>
              <div className="pt-2 text-center text-sm font-mono font-bold text-white bg-slate-950/60 py-2 rounded-lg border border-rose-500/30">
                Temps restant : {Math.floor(lockoutRemainingSeconds / 60)}m {lockoutRemainingSeconds % 60}s
              </div>
            </div>
          ) : null}

          {/* Erreur de connexion */}
          {loginError && !lockoutRemainingSeconds && (
            <div className="mb-5 flex flex-col gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs text-amber-200">
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
                <span className="flex-1 leading-relaxed">{loginError}</span>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Nom d’utilisateur ou e-mail
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  id="input-username"
                  type="text"
                  required
                  autoCapitalize="none"
                  autoCorrect="off"
                  disabled={Boolean(lockoutRemainingSeconds && lockoutRemainingSeconds > 0) || submitting}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="ex: ypaki090 ou ypaki090@gmail.com"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 pl-9 pr-3 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Mot de passe
                </label>
                <button
                  type="button"
                  onClick={() => setShowForgotModal(true)}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 hover:underline cursor-pointer"
                >
                  Mot de passe oublié ?
                </button>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="input-password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  disabled={Boolean(lockoutRemainingSeconds && lockoutRemainingSeconds > 0) || submitting}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-slate-700 bg-slate-800/80 py-2.5 pl-9 pr-10 text-sm text-white placeholder-slate-500 focus:border-emerald-500 focus:outline-hidden focus:ring-1 focus:ring-emerald-500 disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 hover:text-white transition cursor-pointer"
                  title={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">
                Respectez scrupuleusement les majuscules et minuscules.
              </p>
            </div>

            <button
              id="btn-login-submit"
              type="submit"
              disabled={Boolean(lockoutRemainingSeconds && lockoutRemainingSeconds > 0) || submitting || isLoading}
              className="mt-2 w-full rounded-xl bg-emerald-600 py-3 text-sm font-bold text-white shadow-lg shadow-emerald-950 hover:bg-emerald-500 active:scale-98 transition disabled:opacity-50 cursor-pointer"
            >
              {submitting ? 'Vérification...' : 'Se connecter'}
            </button>
          </form>
        </div>

        {/* Modale d'assistance mot de passe oublié */}
        {showForgotModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs">
            <div className="w-full max-w-sm rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Lock className="w-4 h-4 text-emerald-400" />
                  <span>Réinitialisation du Mot de Passe</span>
                </h3>
                <button
                  onClick={() => setShowForgotModal(false)}
                  className="text-slate-400 hover:text-white text-sm"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Conformément aux protocoles de sécurité de l’<strong>Union des Jeunes de la Sécurité Routière de Vridi (U.J.S.R.V.)</strong>,
                la réinitialisation d’un mot de passe ou le déblocage manuel d’un compte est strictement réservé à la direction administrative.
              </p>
              <div className="rounded-xl bg-slate-950/70 border border-slate-800 p-3 text-xs space-y-1 text-slate-400">
                <p><span className="font-bold text-slate-300">Contact Administrateur :</span> Direction U.J.S.R.V.</p>
                <p><span className="font-bold text-slate-300">Zone d’intervention :</span> Vridi — Port Autonome d'Abidjan</p>
                <p><span className="font-bold text-slate-300">Procédure :</span> Présentez votre badge professionnel à votre Responsable de secteur ou à l’Administrateur.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowForgotModal(false)}
                className="w-full rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-white hover:bg-slate-700 transition"
              >
                J’ai compris
              </button>
            </div>
          </div>
        )}

        {/* Bouton PWA et Mention Sécurité */}
        <div className="flex flex-col items-center justify-center gap-3 text-center">
          <PWAInstallButton />
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
            <span>Application PWA disponible hors ligne • Sécurité U.J.S.R.V.</span>
          </p>
        </div>
      </div>
    </div>
  );
};
