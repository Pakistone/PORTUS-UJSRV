import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { OfflineIndicator } from './components/pwa/OfflineIndicator';
import { Header } from './components/common/Header';
import { LoginView } from './components/auth/LoginView';
import { ErrorBoundary } from './components/common/ErrorBoundary';

// Dashboards par rôle
import { AdminDashboard } from './components/dashboard/AdminDashboard';
import { ResponsableDashboard } from './components/dashboard/ResponsableDashboard';
import { AgentDashboard } from './components/dashboard/AgentDashboard';
import { ControleurDashboard } from './components/dashboard/ControleurDashboard';

// Modals accessibles globalement (Header)
import { AuditTrailModal } from './components/audit/AuditTrailModal';
import { UserManagementModal } from './components/admin/UserManagementModal';
import { SupabaseModal } from './components/admin/SupabaseModal';
import { AdvancedSearchModal } from './components/search/AdvancedSearchModal';
import { OfficialStampModal } from './components/common/OfficialStampModal';

const AppContent: React.FC = () => {
  const { currentUser } = useAuth();

  const [auditModalOpen, setAuditModalOpen] = useState(false);
  const [usersModalOpen, setUsersModalOpen] = useState(false);
  const [supabaseModalOpen, setSupabaseModalOpen] = useState(false);
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [stampModalOpen, setStampModalOpen] = useState(false);

  // Si l'utilisateur n'est pas connecté, afficher la page de connexion
  if (!currentUser) {
    return (
      <>
        <OfflineIndicator />
        <LoginView />
      </>
    );
  }

  // Rendu conditionnel du tableau de bord selon le rôle de l'utilisateur
  const renderDashboard = () => {
    switch (currentUser.role) {
      case 'ADMINISTRATEUR':
        return <AdminDashboard />;
      case 'RESPONSABLE':
        return <ResponsableDashboard />;
      case 'AGENT':
        return <AgentDashboard />;
      case 'CONTROLEUR':
        return <ControleurDashboard />;
      default:
        return <AgentDashboard />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-emerald-500 selection:text-white">
      {/* Indicateur de connectivité PWA */}
      <OfflineIndicator />

      {/* Barre supérieure commune */}
      <Header
        onOpenAudit={() => setAuditModalOpen(true)}
        onOpenUsers={() => setUsersModalOpen(true)}
        onOpenSupabase={() => setSupabaseModalOpen(true)}
        onOpenSearch={() => setSearchModalOpen(true)}
        onOpenStamp={() => setStampModalOpen(true)}
      />

      {/* Contenu principal selon le rôle */}
      <main className="flex-1 pb-12">{renderDashboard()}</main>

      {/* Modals globaux */}
      <AdvancedSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
      />
      <AuditTrailModal
        isOpen={auditModalOpen}
        onClose={() => setAuditModalOpen(false)}
      />
      <UserManagementModal
        isOpen={usersModalOpen}
        onClose={() => setUsersModalOpen(false)}
      />
      <SupabaseModal
        isOpen={supabaseModalOpen}
        onClose={() => setSupabaseModalOpen(false)}
      />
      <OfficialStampModal
        isOpen={stampModalOpen}
        onClose={() => setStampModalOpen(false)}
      />
    </div>
  );
};

export default function App() {
  return (
    <ErrorBoundary>
      <AuthProvider>
        <DataProvider>
          <AppContent />
        </DataProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}

