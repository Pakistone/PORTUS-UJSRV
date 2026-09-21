import React, { useState, useMemo } from 'react';
import {
  Receipt,
  Banknote,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Plus,
  Calendar,
  Filter,
  FileSpreadsheet,
  FileText,
  Building2,
  Clock,
  Edit3,
  Trash2,
  Eye,
  Check,
  X,
  ShieldCheck,
  ArrowUpRight,
  Search,
} from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import type { Expense, ExpenseCategory, ExpenseStatus } from '../../types';
import { formatFCFA, formatDate, formatDateTime } from '../../utils/normalization';
import { TICKET_PRICE_FCFA } from '../../config/constants';
import { PeriodFilterState, filterItemByPeriod, PeriodSelector } from '../dashboard/DashboardCharts';
import { jsPDF } from 'jspdf';
import * as XLSX from 'xlsx';

export const ExpensesModule: React.FC = () => {
  const { currentUser } = useAuth();
  const { expenses, createExpense, validateExpense, rejectExpense, cancelExpense, correctExpense, remises, sales, users } = useData();

  const isAdmin = currentUser?.role === 'ADMINISTRATEUR';
  const isResponsable = currentUser?.role === 'RESPONSABLE';

  // State filters
  const [period, setPeriod] = useState<PeriodFilterState>({ type: 'month' });
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [selectedResponsableId, setSelectedResponsableId] = useState<string>('ALL');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedExpenseForAction, setSelectedExpenseForAction] = useState<Expense | null>(null);
  const [actionType, setActionType] = useState<'VALIDATE' | 'REJECT' | 'CANCEL' | 'CORRECT' | 'DETAILS' | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [newCorrectAmount, setNewCorrectAmount] = useState('');
  const [receiptModalUrl, setReceiptModalUrl] = useState<string | null>(null);

  // Form creation state
  const [amountInput, setAmountInput] = useState('');
  const [categoryInput, setCategoryInput] = useState<ExpenseCategory>('MATÉRIEL');
  const [descriptionInput, setDescriptionInput] = useState('');
  const [dateInput, setDateInput] = useState(new Date().toISOString().slice(0, 10));
  const [receiptUrlInput, setReceiptUrlInput] = useState('');
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Responsables list for admin filter
  const responsablesList = useMemo(() => {
    return users.filter((u) => u.role === 'RESPONSABLE' && u.isActive);
  }, [users]);

  // Filter expenses based on user role and filters
  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      // Role isolation
      if (isResponsable && exp.responsibleId !== currentUser?.id && exp.createdBy !== currentUser?.id) {
        return false;
      }
      if (isAdmin && selectedResponsableId !== 'ALL' && exp.responsibleId !== selectedResponsableId) {
        return false;
      }

      // Status filter
      if (statusFilter !== 'ALL' && exp.status !== statusFilter) {
        return false;
      }

      // Category filter
      if (categoryFilter !== 'ALL' && exp.category !== categoryFilter) {
        return false;
      }

      // Period filter
      if (!filterItemByPeriod(exp.expenseDate, period)) {
        return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const matchNum = exp.expenseNumber.toLowerCase().includes(q);
        const matchDesc = exp.description.toLowerCase().includes(q);
        const matchAuthor = exp.createdByName.toLowerCase().includes(q);
        const matchResp = exp.responsibleName?.toLowerCase().includes(q) || false;
        if (!matchNum && !matchDesc && !matchAuthor && !matchResp) return false;
      }

      return true;
    });
  }, [expenses, isResponsable, currentUser, isAdmin, selectedResponsableId, statusFilter, categoryFilter, period, searchTerm]);

  // Financial calculations
  const totalRemitted = useMemo(() => {
    const list = isResponsable
      ? remises.filter((r) => r.responsableId === currentUser?.id)
      : remises;
    return list.reduce((sum, r) => sum + r.amount, 0);
  }, [remises, isResponsable, currentUser]);

  const validatedExpensesAmount = useMemo(() => {
    const list = filteredExpenses.filter((e) => e.status === 'VALIDATED');
    return list.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  const pendingExpensesAmount = useMemo(() => {
    const list = filteredExpenses.filter((e) => e.status === 'PENDING');
    return list.reduce((sum, e) => sum + e.amount, 0);
  }, [filteredExpenses]);

  const availableCash = Math.max(0, totalRemitted - validatedExpensesAmount);

  // Pending expenses requiring admin validation
  const pendingValidationList = useMemo(() => {
    if (!isAdmin) return [];
    return expenses.filter((e) => e.status === 'PENDING');
  }, [expenses, isAdmin]);

  const handleCreateExpenseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    const amt = Number(amountInput || 0);
    if (isNaN(amt) || amt <= 0) {
      setFormError('Veuillez saisir un montant valide supérieur à 0 FCFA.');
      return;
    }
    if (!descriptionInput.trim()) {
      setFormError('Veuillez saisir un motif ou une description pour la dépense.');
      return;
    }

    setFormSubmitting(true);
    try {
      await createExpense({
        amount: amt,
        category: categoryInput,
        description: descriptionInput.trim(),
        expenseDate: dateInput,
        receiptUrl: receiptUrlInput.trim() || null,
      });
      // Reset form
      setAmountInput('');
      setDescriptionInput('');
      setReceiptUrlInput('');
      setCategoryInput('MATÉRIEL');
      setDateInput(new Date().toISOString().slice(0, 10));
      setIsFormOpen(false);
    } catch (err: any) {
      setFormError(err.message || "Erreur lors de l'enregistrement de la dépense.");
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleExecuteAction = async () => {
    if (!selectedExpenseForAction || !actionType) return;
    try {
      if (actionType === 'VALIDATE') {
        await validateExpense(selectedExpenseForAction.id);
      } else if (actionType === 'REJECT') {
        if (!actionReason.trim()) {
          alert('Veuillez saisir un motif de rejet.');
          return;
        }
        await rejectExpense(selectedExpenseForAction.id, actionReason.trim());
      } else if (actionType === 'CANCEL') {
        if (!actionReason.trim()) {
          alert("Veuillez saisir un motif d'annulation.");
          return;
        }
        await cancelExpense(selectedExpenseForAction.id, actionReason.trim());
      } else if (actionType === 'CORRECT') {
        const newAmt = Number(newCorrectAmount || 0);
        if (isNaN(newAmt) || newAmt <= 0) {
          alert('Veuillez saisir un nouveau montant valide.');
          return;
        }
        if (!actionReason.trim()) {
          alert('Veuillez saisir un motif de correction administrative.');
          return;
        }
        await correctExpense(selectedExpenseForAction.id, newAmt, actionReason.trim());
      }
      setSelectedExpenseForAction(null);
      setActionType(null);
      setActionReason('');
      setNewCorrectAmount('');
    } catch (err: any) {
      alert(err.message || "Erreur lors de l'exécution de l'action.");
    }
  };

  // Excel Export
  const handleExportExcel = () => {
    const wsData = filteredExpenses.map((exp) => ({
      'N° Dépense': exp.expenseNumber,
      'Date': exp.expenseDate,
      'Catégorie': exp.category,
      'Motif / Description': exp.description,
      'Montant (FCFA)': exp.amount,
      'Statut': exp.status,
      'Créé par': `${exp.createdByName} (${exp.createdByRole})`,
      'Responsable': exp.responsibleName || '—',
      'Validé par': exp.approvedByName || '—',
      'Date validation': exp.approvedAt ? formatDateTime(exp.approvedAt) : '—',
    }));

    const ws = XLSX.utils.json_to_sheet(wsData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dépenses');
    XLSX.writeFile(wb, `PORTUS_RAPPORT_DEPENSES_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  // PDF Export
  const handleExportPDF = () => {
    const doc = new jsPDF('p', 'mm', 'a4');
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 14;
    let y = 14;

    // Header U.J.S.R.V.
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('UNION DES JEUNES DE LA SÉCURITÉ ROUTIÈRE DE VRIDI — U.J.S.R.V.', margin, y);
    y += 5;

    doc.setFontSize(13);
    doc.setTextColor(30, 58, 138);
    doc.text('PORTUS — RAPPORT OFFICIEL DES DÉPENSES', margin, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(`Généré le ${formatDateTime(new Date().toISOString())} par ${currentUser?.fullName} (${currentUser?.role})`, margin, y);
    y += 8;

    doc.setDrawColor(203, 213, 225);
    doc.line(margin, y, pageWidth - margin, y);
    y += 8;

    // Summary block
    doc.setFillColor(241, 245, 249);
    doc.roundedRect(margin, y, pageWidth - margin * 2, 16, 2, 2, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text(`Total Dépenses Validées : ${formatFCFA(validatedExpensesAmount)}`, margin + 4, y + 6);
    doc.text(`En Attente : ${formatFCFA(pendingExpensesAmount)}`, margin + 4, y + 12);
    doc.text(`Caisse Disponible : ${formatFCFA(availableCash)}`, margin + 110, y + 6);
    y += 22;

    // Table Header
    doc.setFillColor(30, 58, 138);
    doc.rect(margin, y, pageWidth - margin * 2, 8, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(255, 255, 255);
    doc.text('Réf.', margin + 2, y + 5.5);
    doc.text('Date', margin + 22, y + 5.5);
    doc.text('Catégorie', margin + 42, y + 5.5);
    doc.text('Motif', margin + 72, y + 5.5);
    doc.text('Montant', pageWidth - margin - 35, y + 5.5, { align: 'right' });
    doc.text('Statut', pageWidth - margin - 5, y + 5.5, { align: 'right' });
    y += 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);

    filteredExpenses.forEach((exp, idx) => {
      if (y > pageHeight - 20) {
        doc.addPage();
        y = 14;
      }
      if (idx % 2 === 1) {
        doc.setFillColor(248, 250, 252);
        doc.rect(margin, y - 4, pageWidth - margin * 2, 7, 'F');
      }

      doc.setTextColor(15, 23, 42);
      doc.text(exp.expenseNumber, margin + 2, y);
      doc.text(formatDate(exp.expenseDate), margin + 22, y);
      doc.text(exp.category.slice(0, 16), margin + 42, y);
      doc.text(exp.description.slice(0, 32), margin + 72, y);
      doc.setFont('helvetica', 'bold');
      doc.text(formatFCFA(exp.amount), pageWidth - margin - 35, y, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.text(exp.status, pageWidth - margin - 5, y, { align: 'right' });
      y += 7;
    });

    doc.save(`PORTUS_RAPPORT_DEPENSES_${new Date().toISOString().slice(0, 10)}.pdf`);
  };

  const getStatusBadge = (status: ExpenseStatus) => {
    switch (status) {
      case 'VALIDATED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="w-3 h-3" /> Validée
          </span>
        );
      case 'PENDING':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-xs font-semibold text-amber-400 border border-amber-500/20">
            <Clock className="w-3 h-3" /> En attente
          </span>
        );
      case 'REJECTED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-0.5 text-xs font-semibold text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" /> Rejetée
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-700/50 px-2.5 py-0.5 text-xs font-semibold text-slate-400 border border-slate-600/30">
            <X className="w-3 h-3" /> Annulée
          </span>
        );
    }
  };

  return (
    <div className="space-y-6 p-4 sm:p-6 max-w-7xl mx-auto">
      {/* En-tête du module */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
              <Receipt className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-white tracking-tight">Gestion des Dépenses</h1>
              <p className="text-xs sm:text-sm text-slate-400">
                {isAdmin ? 'Vue globale administrateur — Suivi et validation des décaissements' : `Secteur : ${currentUser?.sectorName || 'Mon Périmètre'}`}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            onClick={handleExportExcel}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition shadow-xs"
            title="Exporter en Excel"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            <span>Excel</span>
          </button>
          <button
            onClick={handleExportPDF}
            className="flex items-center gap-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 px-3 py-2 text-xs font-semibold text-slate-200 transition shadow-xs"
            title="Imprimer le rapport PDF"
          >
            <FileText className="w-4 h-4 text-rose-400" />
            <span>PDF</span>
          </button>
          <button
            onClick={() => setIsFormOpen(true)}
            className="flex items-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2 text-xs sm:text-sm font-bold text-white transition shadow-md shadow-emerald-900/30"
          >
            <Plus className="w-4 h-4" />
            <span>Nouvelle Dépense</span>
          </button>
        </div>
      </div>

      {/* Blocs de synthèse financière */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Caisse Disponible</span>
            <Banknote className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-emerald-400">{formatFCFA(availableCash)}</div>
          <p className="text-[11px] text-slate-500">Recettes encaissées - Dépenses validées</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Dépenses Validées</span>
            <CheckCircle2 className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-white">{formatFCFA(validatedExpensesAmount)}</div>
          <p className="text-[11px] text-slate-500">Total déccaissé et approuvé</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>En Attente de Validation</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-amber-400">{formatFCFA(pendingExpensesAmount)}</div>
          <p className="text-[11px] text-slate-500">{filteredExpenses.filter((e) => e.status === 'PENDING').length} demande(s) en attente</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold">
            <span>Total Remises Encaissées</span>
            <Building2 className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-xl sm:text-2xl font-black text-purple-300">{formatFCFA(totalRemitted)}</div>
          <p className="text-[11px] text-slate-500">Base de calcul de la trésorerie</p>
        </div>
      </div>

      {/* Section Administrateur : Dépenses à valider en priorité */}
      {isAdmin && pendingValidationList.length > 0 && (
        <div className="bg-amber-950/20 border border-amber-500/40 rounded-2xl p-5 shadow-lg space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-amber-200">Dépenses en attente de validation administrateur</h2>
                <p className="text-xs text-amber-300/80">Ces demandes requièrent votre validation explicite pour impacter la caisse.</p>
              </div>
            </div>
            <span className="rounded-full bg-amber-500/20 px-3 py-1 text-xs font-black text-amber-300 border border-amber-500/30">
              {pendingValidationList.length} en attente
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {pendingValidationList.map((exp) => (
              <div key={exp.id} className="bg-slate-900 border border-amber-500/30 rounded-xl p-4 space-y-3 flex flex-col justify-between">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-amber-400">{exp.expenseNumber}</span>
                    <span className="text-xs text-slate-400">{formatDate(exp.expenseDate)}</span>
                  </div>
                  <div className="text-lg font-black text-white">{formatFCFA(exp.amount)}</div>
                  <div className="text-xs font-semibold text-slate-300 bg-slate-800 px-2 py-0.5 rounded inline-block">
                    {exp.category}
                  </div>
                  <p className="text-xs text-slate-300 line-clamp-2">{exp.description}</p>
                  <div className="text-[11px] text-slate-400 pt-1 border-t border-slate-800">
                    Demandeur : <span className="text-slate-200 font-medium">{exp.createdByName}</span> ({exp.createdByRole})
                    {exp.responsibleName && <span className="block">Responsable : {exp.responsibleName}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-800">
                  <button
                    onClick={() => {
                      setSelectedExpenseForAction(exp);
                      setActionType('VALIDATE');
                    }}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 py-1.5 text-xs font-bold text-white transition"
                  >
                    <Check className="w-3.5 h-3.5" /> Valider
                  </button>
                  <button
                    onClick={() => {
                      setSelectedExpenseForAction(exp);
                      setActionType('REJECT');
                    }}
                    className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-rose-600 hover:bg-rose-500 py-1.5 text-xs font-bold text-white transition"
                  >
                    <X className="w-3.5 h-3.5" /> Rejeter
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Barre de filtres et recherche */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-sm space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Recherche */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Rechercher par numéro, motif, demandeur..."
              className="w-full rounded-xl bg-slate-800 border border-slate-700 pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
            />
          </div>

          {/* Sélecteur de période */}
          <PeriodSelector period={period} onChange={setPeriod} />
        </div>

        {/* Filtres secondaires */}
        <div className="flex flex-wrap items-center gap-3 pt-2 border-t border-slate-800">
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Statut :</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">Tous les statuts</option>
              <option value="PENDING">En attente</option>
              <option value="VALIDATED">Validées</option>
              <option value="REJECTED">Rejetées</option>
              <option value="CANCELLED">Annulées</option>
            </select>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Catégorie :</span>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="ALL">Toutes les catégories</option>
              <option value="MATÉRIEL">Matériel</option>
              <option value="AGENT">Agent</option>
              <option value="AUTORITÉS">Autorités</option>
              <option value="RÉPARATION / ENTRETIEN">Réparation / Entretien</option>
              <option value="CARBURANT">Carburant</option>
              <option value="TRANSPORT">Transport</option>
              <option value="AUTRE">Autre</option>
            </select>
          </div>

          {isAdmin && responsablesList.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Responsable :</span>
              <select
                value={selectedResponsableId}
                onChange={(e) => setSelectedResponsableId(e.target.value)}
                className="rounded-xl bg-slate-800 border border-slate-700 px-3 py-1.5 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="ALL">Tous les responsables</option>
                {responsablesList.map((resp) => (
                  <option key={resp.id} value={resp.id}>
                    {resp.fullName} ({resp.sectorName || 'Secteur'})
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Liste des Dépenses */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="px-5 py-4 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <Receipt className="w-4 h-4 text-emerald-400" />
            <span>Registre des Dépenses ({filteredExpenses.length})</span>
          </h3>
          <span className="text-xs text-slate-400">Total affiché : <strong className="text-white">{formatFCFA(filteredExpenses.reduce((s, e) => s + (e.status === 'VALIDATED' ? e.amount : 0), 0))}</strong> (validées)</span>
        </div>

        {filteredExpenses.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <Receipt className="w-10 h-10 text-slate-600 mx-auto" />
            <p className="text-sm text-slate-400">Aucune dépense ne correspond aux critères sélectionnés.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800">
            {filteredExpenses.map((exp) => (
              <div key={exp.id} className="p-4 sm:p-5 hover:bg-slate-850/50 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1.5 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-2 py-0.5 rounded">
                      {exp.expenseNumber}
                    </span>
                    {getStatusBadge(exp.status)}
                    <span className="text-xs font-semibold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                      {exp.category}
                    </span>
                    <span className="text-xs text-slate-400 font-mono ml-auto sm:ml-0">
                      {formatDate(exp.expenseDate)}
                    </span>
                  </div>

                  <h4 className="text-sm font-bold text-white leading-snug">{exp.description}</h4>

                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400 pt-1">
                    <span>Demandeur : <strong className="text-slate-300">{exp.createdByName}</strong> ({exp.createdByRole})</span>
                    {exp.responsibleName && <span>Responsable : <strong className="text-slate-300">{exp.responsibleName}</strong></span>}
                    {exp.approvedByName && <span className="text-emerald-400">Validé par {exp.approvedByName}</span>}
                    {exp.rejectionReason && <span className="text-rose-400">Motif rejet : {exp.rejectionReason}</span>}
                    {exp.cancellationReason && <span className="text-slate-400">Motif annulation : {exp.cancellationReason}</span>}
                  </div>
                </div>

                <div className="flex items-center justify-between sm:justify-end gap-3 pt-3 sm:pt-0 border-t sm:border-t-0 border-slate-800">
                  <div className="text-right">
                    <div className="text-lg font-black text-white">{formatFCFA(exp.amount)}</div>
                    {exp.receiptUrl && (
                      <button
                        onClick={() => setReceiptModalUrl(exp.receiptUrl || null)}
                        className="text-[11px] text-blue-400 hover:text-blue-300 flex items-center gap-1 mt-0.5 ml-auto"
                      >
                        <Eye className="w-3 h-3" /> Voir justificatif
                      </button>
                    )}
                  </div>

                  {/* Actions Admin ou Responsable */}
                  <div className="flex items-center gap-1.5">
                    {isAdmin && exp.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedExpenseForAction(exp);
                            setActionType('VALIDATE');
                          }}
                          className="p-2 rounded-xl bg-emerald-600/20 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-600 hover:text-white transition"
                          title="Valider"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedExpenseForAction(exp);
                            setActionType('REJECT');
                          }}
                          className="p-2 rounded-xl bg-rose-600/20 border border-rose-500/30 text-rose-400 hover:bg-rose-600 hover:text-white transition"
                          title="Rejeter"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </>
                    )}

                    {isAdmin && exp.status === 'VALIDATED' && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedExpenseForAction(exp);
                            setActionType('CORRECT');
                            setNewCorrectAmount(String(exp.amount));
                          }}
                          className="p-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-blue-400 hover:bg-blue-600 hover:text-white transition"
                          title="Correction administrative"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => {
                            setSelectedExpenseForAction(exp);
                            setActionType('CANCEL');
                          }}
                          className="p-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white transition"
                          title="Annuler la dépense"
                        >
                          <Trash2 className="w-4 h-4 text-rose-400" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal : Nouvelle Dépense */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg my-auto p-6 pb-28 sm:pb-32 shadow-2xl space-y-5 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <Receipt className="w-5 h-5 text-emerald-400" />
                <h3 className="text-base font-bold text-white">Enregistrer une Nouvelle Dépense</h3>
              </div>
              <button
                onClick={() => setIsFormOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-xl bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-medium">
                {formError}
              </div>
            )}

            <form onSubmit={handleCreateExpenseSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Montant (FCFA) *</label>
                <input
                  type="text"
                  inputMode="numeric"
                  required
                  value={amountInput}
                  onChange={(e) => {
                    const cleaned = e.target.value.replace(/[^\d]/g, '').replace(/^0+/, '');
                    setAmountInput(cleaned);
                  }}
                  placeholder="0"
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Catégorie *</label>
                <select
                  value={categoryInput}
                  onChange={(e) => setCategoryInput(e.target.value as ExpenseCategory)}
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="MATÉRIEL">Matériel</option>
                  <option value="AGENT">Agent</option>
                  <option value="AUTORITÉS">Autorités</option>
                  <option value="RÉPARATION / ENTRETIEN">Réparation / Entretien</option>
                  <option value="CARBURANT">Carburant</option>
                  <option value="TRANSPORT">Transport</option>
                  <option value="AUTRE">Autre</option>
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Date de la dépense *</label>
                <input
                  type="date"
                  required
                  value={dateInput}
                  onChange={(e) => setDateInput(e.target.value)}
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Motif / Description détaillée *</label>
                <textarea
                  required
                  rows={3}
                  value={descriptionInput}
                  onChange={(e) => setDescriptionInput(e.target.value)}
                  placeholder="Précisez l'objet exact de la dépense..."
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">Justificatif (URL photo ou base64 optionnel)</label>
                <input
                  type="text"
                  value={receiptUrlInput}
                  onChange={(e) => setReceiptUrlInput(e.target.value)}
                  placeholder="https://... ou laissez vide"
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 px-4 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="rounded-xl bg-emerald-600 hover:bg-emerald-500 px-5 py-2 text-xs font-bold text-white transition shadow-md shadow-emerald-900/30 disabled:opacity-50"
                >
                  {formSubmitting ? 'Enregistrement...' : 'Soumettre la Dépense'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal d'action Admin (Valider / Rejeter / Annuler / Corriger) */}
      {selectedExpenseForAction && actionType && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md my-auto p-6 pb-28 sm:pb-32 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-white">
                {actionType === 'VALIDATE' && 'Validation de la dépense'}
                {actionType === 'REJECT' && 'Rejet de la dépense'}
                {actionType === 'CANCEL' && 'Annulation de la dépense'}
                {actionType === 'CORRECT' && 'Correction administrative'}
              </h3>
              <button
                onClick={() => {
                  setSelectedExpenseForAction(null);
                  setActionType(null);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-slate-800/60 rounded-xl p-3 space-y-1 text-xs">
              <div className="text-emerald-400 font-mono font-bold">{selectedExpenseForAction.expenseNumber}</div>
              <div className="text-white font-bold">{formatFCFA(selectedExpenseForAction.amount)}</div>
              <p className="text-slate-300">{selectedExpenseForAction.description}</p>
            </div>

            {actionType === 'VALIDATE' && (
              <p className="text-xs text-slate-300">
                Êtes-vous sûr de vouloir valider cette dépense ? Elle sera immédiatement déduite de la caisse disponible.
              </p>
            )}

            {(actionType === 'REJECT' || actionType === 'CANCEL') && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300">
                  Motif {actionType === 'REJECT' ? 'de rejet' : "d'annulation"} obligatoire *
                </label>
                <textarea
                  rows={3}
                  required
                  value={actionReason}
                  onChange={(e) => setActionReason(e.target.value)}
                  placeholder="Précisez le motif..."
                  className="w-full rounded-xl bg-slate-800 border border-slate-700 p-3 text-xs text-white focus:outline-none focus:border-emerald-500 resize-none"
                />
              </div>
            )}

            {actionType === 'CORRECT' && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Nouveau montant (FCFA) *</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    required
                    value={newCorrectAmount}
                    onChange={(e) => {
                      const cleaned = e.target.value.replace(/[^\d]/g, '').replace(/^0+/, '');
                      setNewCorrectAmount(cleaned);
                    }}
                    placeholder="0"
                    className="w-full rounded-xl bg-slate-800 border border-slate-700 p-2.5 text-sm text-white font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold text-slate-300">Motif de la correction administrative *</label>
                  <textarea
                    rows={2}
                    required
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder="Pourquoi cette correction ?"
                    className="w-full rounded-xl bg-slate-800 border border-slate-700 p-3 text-xs text-white focus:outline-none focus:border-emerald-500 resize-none"
                  />
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-800">
              <button
                onClick={() => {
                  setSelectedExpenseForAction(null);
                  setActionType(null);
                }}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                Fermer
              </button>
              <button
                onClick={handleExecuteAction}
                className={`rounded-xl px-4 py-2 text-xs font-bold text-white transition ${
                  actionType === 'REJECT' || actionType === 'CANCEL'
                    ? 'bg-rose-600 hover:bg-rose-500'
                    : 'bg-emerald-600 hover:bg-emerald-500'
                }`}
              >
                Confirmer l'action
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal visualisation justificatif */}
      {receiptModalUrl && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 max-w-2xl w-full space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Justificatif de la dépense</h4>
              <button onClick={() => setReceiptModalUrl(null)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="bg-slate-950 p-2 rounded-xl flex items-center justify-center overflow-hidden">
              <img
                src={receiptModalUrl}
                alt="Justificatif"
                className="max-h-[70vh] object-contain rounded-lg"
                onError={(e) => {
                  (e.target as HTMLElement).style.display = 'none';
                }}
              />
            </div>
            <div className="text-right">
              <button
                onClick={() => setReceiptModalUrl(null)}
                className="rounded-xl bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
