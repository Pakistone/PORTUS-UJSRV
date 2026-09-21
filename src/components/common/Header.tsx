import React, { useState } from 'react';
import {
  ShieldAlert,
  LogOut,
  Users,
  Wifi,
  WifiOff,
  Database,
  Menu,
  X,
  FileText,
  Bell,
  CheckCheck,
  Search,
  Stamp,
  KeyRound,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useData } from '../../context/DataContext';
import { PWAInstallButton } from '../pwa/PWAInstallButton';
import { ChangePasswordModal } from './ChangePasswordModal';
import { ORG_INFO } from '../../config/constants';
import { formatDateTime } from '../../utils/normalization';
import type { Role } from '../../types';

interface HeaderProps {
  onOpenAudit?: () => void;
  onOpenUsers?: () => void;
  onOpenSupabase?: () => void;
  onOpenSearch?: () => void;
  onOpenStamp?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  onOpenAudit,
  onOpenUsers,
  onOpenSupabase,
  onOpenSearch,
  onOpenStamp,
}) => {
  const { currentUser, logout } = useAuth();
  const { isOnline, notifications, markNotificationAsRead, markAllNotificationsAsRead } = useData();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifModalOpen, setNotifModalOpen] = useState(false);
  const [changePasswordOpen, setChangePasswordOpen] = useState(false);

  const handleNotificationClick = (n: any) => {
    if (!n.isRead) {
      markNotificationAsRead(n.id);
    }
    setNotifModalOpen(false);
    window.dispatchEvent(new CustomEvent('portus-notification-clicked', { detail: n }));
  };

  // Notifications pertinentes pour l'utilisateur actuel
  const myNotifications = notifications.filter((n) => {
    if (!currentUser) return false;
    if (n.recipientId && n.recipientId !== currentUser.id) {
      // Les alertes de fraude destinées aux admins et responsables
      if (n.type === 'FRAUD_ALERT' && currentUser.role === 'ADMINISTRATEUR') return true;
      if (n.type === 'FRAUD_ALERT' && currentUser.role === 'RESPONSABLE') return true;
      // Les alertes financières concernent l'agent, le responsable et l'administrateur
      if (n.type === 'FINANCIAL_ALERT') {
        if (currentUser.role === 'ADMINISTRATEUR') return true;
        if (currentUser.role === 'RESPONSABLE') {
          const metaSector = (n.metadata as any)?.sectorId;
          return !currentUser.sectorId || !metaSector || metaSector === currentUser.sectorId;
        }
      }
      return false;
    }
    return true;
  });

  const unreadCount = myNotifications.filter((n) => !n.isRead).length;

  const roleColors: Record<Role, string> = {
    ADMINISTRATEUR: 'bg-rose-500/20 text-rose-300 border-rose-500/30',
    RESPONSABLE: 'bg-blue-500/20 text-blue-300 border-blue-500/30',
    AGENT: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    CONTROLEUR: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  };

  const roleLabels: Record<Role, string> = {
    ADMINISTRATEUR: 'ADMINISTRATEUR',
    RESPONSABLE: 'RESPONSABLE SECTEUR',
    AGENT: 'AGENT DE TERRAIN',
    CONTROLEUR: 'CONTRÔLEUR ROUTIER',
  };

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-900/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-3 py-2.5 sm:px-6">
        {/* Logo & Titre */}
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 shadow-md shadow-emerald-950/50">
            <ShieldAlert className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-base font-black tracking-wider text-white">
                {ORG_INFO.NAME}
              </span>
              <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] font-bold text-emerald-400">
                {ORG_INFO.SHORT_ORG_NAME}
              </span>
            </div>
            <p className="hidden text-[11px] font-medium text-slate-400 sm:block">
              {ORG_INFO.FULL_ORG_NAME}
            </p>
          </div>
        </div>

        {/* Section droite (Desktop) */}
        <div className="hidden items-center gap-3 lg:flex">
          {/* Indicateur Réseau */}
          <div
            className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
              isOnline
                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
            }`}
          >
            {isOnline ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
            <span>{isOnline ? 'En ligne' : 'Hors ligne'}</span>
          </div>

          {/* Bouton Recherche Avancée (Accessible à tous les rôles) */}
          {onOpenSearch && (
            <button
              id="btn-header-search"
              onClick={onOpenSearch}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-amber-500/30 px-3 py-1.5 text-xs font-bold text-amber-300 hover:bg-slate-700 hover:border-amber-400 transition cursor-pointer shadow-xs"
              title="Recherches avancées & filtres"
            >
              <Search className="w-3.5 h-3.5 text-amber-400" />
              <span>Recherches</span>
            </button>
          )}

          {/* Bouton Cachet Officiel U.J.S.R.V. */}
          {onOpenStamp && (
            <button
              onClick={onOpenStamp}
              className="flex items-center gap-1.5 rounded-xl bg-slate-800 border border-emerald-500/30 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-slate-700 hover:border-emerald-400 transition cursor-pointer shadow-xs"
              title="Afficher & Télécharger le cachet officiel vectoriel"
            >
              <Stamp className="w-3.5 h-3.5 text-emerald-400" />
              <span>Cachet Officiel</span>
            </button>
          )}

          {/* Bouton PWA */}
          <PWAInstallButton />

          {/* Liens Admin / Audit / Supabase */}
          {currentUser?.role === 'ADMINISTRATEUR' && (
            <div className="flex items-center gap-1.5 border-l border-slate-700 pl-3">
              {onOpenUsers && (
                <button
                  onClick={onOpenUsers}
                  className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition"
                  title="Gestion des Comptes"
                >
                  <Users className="w-3.5 h-3.5 text-blue-400" />
                  <span>Comptes</span>
                </button>
              )}
              {onOpenAudit && (
                <button
                  onClick={onOpenAudit}
                  className="flex items-center gap-1 rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 transition"
                  title="Audit Trail"
                >
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  <span>Audit</span>
                </button>
              )}
              {onOpenSupabase && (
                <button
                  onClick={onOpenSupabase}
                  className="flex items-center gap-1 rounded-lg bg-emerald-950/60 border border-emerald-800/60 px-2.5 py-1.5 text-xs font-medium text-emerald-300 hover:bg-emerald-900/60 transition"
                  title="Configuration Supabase"
                >
                  <Database className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Supabase SQL</span>
                </button>
              )}
            </div>
          )}

          {/* Cloche de Notifications */}
          <div className="relative">
            <button
              onClick={() => setNotifModalOpen(true)}
              className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700 transition"
              title="Centre de notifications & alertes"
            >
              <Bell className="w-4 h-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white shadow-xs">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>
          </div>

          {/* Utilisateur connecté & Logout */}
          {currentUser && (
            <div className="flex items-center gap-2 border-l border-slate-700 pl-3">
              <div className="text-right">
                <p className="text-xs font-bold text-white leading-tight">
                  {currentUser.fullName}
                </p>
                <div className="flex items-center justify-end gap-1">
                  <span
                    className={`inline-block rounded-full border px-1.5 py-0.2 text-[9px] font-bold ${
                      roleColors[currentUser.role]
                    }`}
                  >
                    {roleLabels[currentUser.role]}
                  </span>
                  {currentUser.sectorName && (
                    <span className="text-[9px] text-slate-400 truncate max-w-[120px]">
                      • {currentUser.sectorName}
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={() => setChangePasswordOpen(true)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition"
                title="Modifier mon mot de passe"
              >
                <KeyRound className="w-4 h-4" />
              </button>

              <button
                onClick={() => logout()}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-rose-500/20 hover:text-rose-400 transition"
                title="Déconnexion"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>

        {/* Bouton Mobile Hamburger */}
        <div className="flex items-center gap-2 lg:hidden">
          <button
            onClick={() => setNotifModalOpen(true)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
            title="Notifications"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-500 text-[10px] font-black text-white">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>
          <PWAInstallButton />
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="flex h-9 w-9 items-center justify-center rounded-lg bg-slate-800 text-slate-300 hover:bg-slate-700"
            title="Menu de navigation"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Modal / Panneau des Notifications */}
      {notifModalOpen && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
          onClick={() => setNotifModalOpen(false)}
        >
          <div 
            className="w-full max-w-md my-auto rounded-2xl border border-slate-700 bg-slate-900 p-5 shadow-2xl text-slate-100 max-h-[90vh] flex flex-col space-y-3 animate-in fade-in-50 zoom-in-95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-amber-400" />
                <h3 className="text-base font-bold text-white">Notifications & Alertes</h3>
                {unreadCount > 0 && (
                  <span className="rounded-full bg-rose-500/20 text-rose-300 px-2 py-0.5 text-xs font-bold border border-rose-500/30">
                    {unreadCount}
                  </span>
                )}
              </div>
              <button
                onClick={() => setNotifModalOpen(false)}
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-white transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {unreadCount > 0 && (
              <div className="flex justify-end">
                <button
                  onClick={() => markAllNotificationsAsRead()}
                  className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition py-1 px-2 rounded bg-slate-800/60"
                >
                  <CheckCheck className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Tout marquer comme lu</span>
                </button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1 max-h-[60vh]">
              {myNotifications.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-sm">
                  Aucune notification pour le moment.
                </div>
              ) : (
                myNotifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleNotificationClick(n)}
                    className={`p-3 rounded-xl border text-xs cursor-pointer transition space-y-1 ${
                      n.isRead
                        ? 'border-slate-800/80 bg-slate-950/40 text-slate-400'
                        : n.level === 'CRITICAL'
                        ? 'border-rose-500/40 bg-rose-950/20 text-rose-200 shadow-sm'
                        : 'border-slate-700 bg-slate-800 text-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-bold text-white text-xs leading-snug">
                        {n.title}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono shrink-0">
                        {formatDateTime(n.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs leading-relaxed text-slate-300">
                      {n.message}
                    </p>
                  </div>
                ))
              )}
            </div>

            <div className="border-t border-slate-800 pt-3 text-center">
              <button
                type="button"
                onClick={() => setNotifModalOpen(false)}
                className="w-full rounded-xl bg-slate-800 py-2.5 text-xs font-bold text-slate-200 hover:bg-slate-700 transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Menu Déroulant Mobile */}
      {mobileMenuOpen && (
        <div className="border-t border-slate-800 bg-slate-900 p-4 lg:hidden space-y-4">
          {currentUser && (
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div>
                <p className="text-sm font-bold text-white">{currentUser.fullName}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className={`rounded border px-2 py-0.5 text-[10px] font-bold ${
                      roleColors[currentUser.role]
                    }`}
                  >
                    {roleLabels[currentUser.role]}
                  </span>
                  {currentUser.sectorName && (
                    <span className="text-[11px] text-slate-400">
                      {currentUser.sectorName}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setChangePasswordOpen(true);
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-amber-500/20 px-3 py-1.5 text-xs font-bold text-amber-300"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Mot de passe</span>
                </button>
                <button
                  onClick={() => {
                    logout();
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-1.5 rounded-lg bg-rose-500/20 px-3 py-1.5 text-xs font-bold text-rose-300"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Quitter</span>
                </button>
              </div>
            </div>
          )}

          {/* Bouton Recherche Avancée en Mobile */}
          {onOpenSearch && (
            <button
              onClick={() => {
                onOpenSearch();
                setMobileMenuOpen(false);
              }}
              className="w-full flex items-center justify-center gap-2 rounded-xl bg-amber-600/20 border border-amber-500/40 p-2.5 text-xs font-bold text-amber-300 hover:bg-amber-600/30 transition"
            >
              <Search className="w-4 h-4 text-amber-400" />
              <span>Recherches Avancées & Filtres</span>
            </button>
          )}

          {/* Menus Admin en Mobile */}
          {currentUser?.role === 'ADMINISTRATEUR' && (
            <div className="space-y-2 pt-2 border-t border-slate-800">
              {onOpenUsers && (
                <button
                  onClick={() => {
                    onOpenUsers();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl bg-slate-800 p-2.5 text-xs font-semibold text-slate-200"
                >
                  <Users className="w-4 h-4 text-blue-400" />
                  <span>Gestion des Utilisateurs</span>
                </button>
              )}
              {onOpenAudit && (
                <button
                  onClick={() => {
                    onOpenAudit();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl bg-slate-800 p-2.5 text-xs font-semibold text-slate-200"
                >
                  <FileText className="w-4 h-4 text-amber-400" />
                  <span>Journal d’Audit Trail</span>
                </button>
              )}
              {onOpenSupabase && (
                <button
                  onClick={() => {
                    onOpenSupabase();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-2.5 rounded-xl bg-slate-800 p-2.5 text-xs font-semibold text-emerald-300"
                >
                  <Database className="w-4 h-4 text-emerald-400" />
                  <span>Schéma Supabase SQL</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
      
      <ChangePasswordModal
        isOpen={changePasswordOpen}
        onClose={() => setChangePasswordOpen(false)}
      />
    </header>
  );
};
