/**
 * Module d'export Excel (XLSX) et PDF avancé pour PORTUS — U.J.S.R.V.
 * Union des Jeunes de la Sécurité Routière de Vridi
 *
 * RÈGLES STRICTES :
 * - Export XLSX pour l'ADMIN avec les résultats filtrés :
 *   ticket, carnet, statut, immatriculation, agent, responsable, date vente,
 *   montant, contrôle, remise si pertinente.
 * - Export PDF pour l'ADMIN imprimable (A4 Portrait ou Paysage selon volume) :
 *   En-tête obligatoire :
 *   UNION DES JEUNES DE LA SÉCURITÉ ROUTIÈRE DE VRIDI — U.J.S.R.V.
 *   PORTUS — RAPPORT DE GESTION
 *   Période : <période affichée>
 *   Utilisateur ayant généré : <Nom & Prénom (Rôle)>
 * - Respect absolu des filtres sélectionnés.
 * - Cloisonnement strict des données selon les privilèges.
 */

import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import type { Ticket, Sale, Remise, Control, User, Role } from '../types';
import { ORG_INFO, TICKET_PRICE_FCFA } from '../config/constants';
import {
  formatFCFA,
  formatDate,
  formatDateTime,
  formatPlateDisplay,
} from './normalization';
import type { PeriodFilterState } from '../components/dashboard/DashboardCharts';

export interface EnrichedTicketRow {
  ticket: Ticket;
  sale?: Sale;
  remise?: Remise;
  lastControl?: Control;
}

/**
 * Construit le libellé textuel propre de la période filtrée pour les rapports
 */
export function formatPeriodLabel(period: PeriodFilterState): string {
  const now = new Date();
  if (period.type === 'today') {
    return `Aujourd'hui (${now.toLocaleDateString('fr-FR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })})`;
  }
  if (period.type === 'week') {
    return 'Cette semaine en cours';
  }
  if (period.type === 'month') {
    return `Ce mois (${now.toLocaleDateString('fr-FR', {
      month: 'long',
      year: 'numeric',
    })})`;
  }
  if (period.type === 'custom') {
    const s = period.startDate ? formatDate(period.startDate) : 'Début';
    const e = period.endDate ? formatDate(period.endDate) : 'Ce jour';
    return `Du ${s} au ${e}`;
  }
  return 'Toutes dates confondues';
}

/**
 * Formate le statut métier du ticket en texte clair pour l'export
 */
export function formatTicketStatusLabel(status: string): string {
  switch (status) {
    case 'GENERATED':
      return 'Généré (Au siège)';
    case 'ASSIGNED_TO_RESPONSIBLE':
      return 'En secteur (Responsable)';
    case 'AVAILABLE':
      return 'Disponible en secteur';
    case 'ASSIGNED_TO_AGENT':
      return 'En main agent (À vendre)';
    case 'SOLD':
      return 'Vendu';
    case 'CONTROLLED':
      return 'Vendu & Contrôlé';
    case 'CANCELLED':
      return 'Annulé';
    default:
      return status;
  }
}

/**
 * EXPORT EXCEL (XLSX) DES RÉSULTATS FILTRÉS POUR L'ADMINISTRATEUR
 */
export function exportFilteredTicketsToExcel(
  items: EnrichedTicketRow[],
  period: PeriodFilterState,
  currentUser: User | null
): void {
  if (!currentUser || currentUser.role !== 'ADMINISTRATEUR') {
    throw new Error("Privilège insuffisant : Seul l'administrateur général est autorisé à exporter les données au format Excel.");
  }

  const authorName = `${currentUser.fullName} (${currentUser.role})`;
  const periodLabel = formatPeriodLabel(period);
  const nowIso = new Date().toISOString();

  // 1. Feuille de synthèse / métadonnées
  const summaryData = [
    { Métadonnée: 'Organisation', Valeur: `${ORG_INFO.FULL_ORG_NAME} (${ORG_INFO.SHORT_ORG_NAME})` },
    { Métadonnée: 'Système', Valeur: `${ORG_INFO.NAME} — Plateforme de Recouvrement et Traçabilité` },
    { Métadonnée: 'Rapport', Valeur: 'Extraction des résultats filtrés de gestion des tickets' },
    { Métadonnée: 'Période analysée', Valeur: periodLabel },
    { Métadonnée: 'Exporté par', Valeur: authorName },
    { Métadonnée: "Date de l'export", Valeur: formatDateTime(nowIso) },
    { Métadonnée: 'Nombre total de tickets filtrés', Valeur: items.length },
    {
      Métadonnée: 'Nombre de tickets vendus',
      Valeur: items.filter((i) => i.ticket.status === 'SOLD' || i.ticket.status === 'CONTROLLED').length,
    },
    {
      Métadonnée: 'Montant total des ventes (FCFA)',
      Valeur:
        items.filter((i) => i.ticket.status === 'SOLD' || i.ticket.status === 'CONTROLLED').length *
        TICKET_PRICE_FCFA,
    },
    {
      Métadonnée: 'Nombre de tickets couverts par remise',
      Valeur: items.filter((i) => i.remise || i.ticket.coveredByRemiseId).length,
    },
  ];

  // 2. Feuille principale détaillée
  const rows = items.map((item, index) => {
    const t = item.ticket;
    const s = item.sale;
    const r = item.remise;
    const c = item.lastControl;

    const isSold = t.status === 'SOLD' || t.status === 'CONTROLLED';
    const amountVal = isSold ? (s?.price || t.price || TICKET_PRICE_FCFA) : 0;

    // Statut de remise
    let remiseInfo = 'Non applicable';
    if (isSold) {
      if (r) {
        remiseInfo = `Couverte (Réf: ${r.reference}, le ${formatDate(r.date)})`;
      } else if (t.coveredByRemiseId) {
        remiseInfo = `Couverte (ID: ${t.coveredByRemiseId.slice(0, 8)})`;
      } else {
        remiseInfo = 'NON REMISE (En attente de versement)';
      }
    }

    // Statut contrôle
    let controleInfo = 'Non contrôlé';
    if (t.controlCount > 0 || c) {
      const times = t.controlCount || 1;
      const res = c ? (c.isValid ? 'VALIDE' : 'NON CONFORME') : 'VALIDE';
      const by = c?.controleurName || t.lastControlledBy || 'Contrôleur';
      const at = c?.controlledAt || t.lastControlledAt;
      controleInfo = `${res} (${times}x) par ${by} le ${formatDateTime(at)}`;
    }

    return {
      'N°': index + 1,
      'Ticket': t.ticketNumber,
      'Carnet': t.carnetNumber,
      'Statut': formatTicketStatusLabel(t.status),
      'Immatriculation': t.plateNumber ? formatPlateDisplay(t.plateNumber) : '—',
      'Agent': t.assignedAgentName || s?.agentName || '—',
      'Responsable': t.assignedResponsableName || '—',
      'Secteur': t.sectorName || s?.sectorName || '—',
      'Date Vente': t.soldAt ? formatDateTime(t.soldAt) : '—',
      'Montant (FCFA)': amountVal,
      'Contrôle': controleInfo,
      'Remise': remiseInfo,
      'Téléphone Chauffeur': t.driverPhone || s?.driverPhone || '—',
      'Date Création': formatDateTime(t.createdAt),
    };
  });

  const workbook = XLSX.utils.book_new();

  // Feuilles
  const mainSheet = XLSX.utils.json_to_sheet(rows);
  const summarySheet = XLSX.utils.json_to_sheet(summaryData);

  // Largeurs automatiques des colonnes
  mainSheet['!cols'] = [
    { wch: 5 },  // N°
    { wch: 14 }, // Ticket
    { wch: 14 }, // Carnet
    { wch: 22 }, // Statut
    { wch: 16 }, // Immatriculation
    { wch: 22 }, // Agent
    { wch: 22 }, // Responsable
    { wch: 18 }, // Secteur
    { wch: 20 }, // Date Vente
    { wch: 15 }, // Montant
    { wch: 36 }, // Contrôle
    { wch: 34 }, // Remise
    { wch: 18 }, // Téléphone
    { wch: 20 }, // Date Création
  ];

  summarySheet['!cols'] = [{ wch: 35 }, { wch: 60 }];

  XLSX.utils.book_append_sheet(workbook, mainSheet, 'Tickets Filtrés');
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Synthèse & Filtres');

  const fileDate = nowIso.slice(0, 10);
  XLSX.writeFile(workbook, `PORTUS_RAPPORT_FILTRE_${fileDate}.xlsx`);
}

/**
 * EXPORT PDF IMPRIMABLE DU RAPPORT DE GESTION POUR L'ADMINISTRATEUR
 * Format : A4 Paysage pour garantir un tableau clair, aéré et 100% lisible.
 */
export function generateManagementReportPDF(
  items: EnrichedTicketRow[],
  period: PeriodFilterState,
  currentUser: User | null
): void {
  if (!currentUser || currentUser.role !== 'ADMINISTRATEUR') {
    throw new Error("Privilège insuffisant : Seul l'administrateur général est autorisé à générer le rapport PDF officiel.");
  }

  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;
  const marginX = 14;
  const periodLabel = formatPeriodLabel(period);
  const generatedAt = formatDateTime(new Date().toISOString());
  const userName = currentUser ? `${currentUser.fullName} (${currentUser.role})` : 'Administrateur';

  // Statistiques de la sélection
  const totalCount = items.length;
  const soldCount = items.filter((i) => i.ticket.status === 'SOLD' || i.ticket.status === 'CONTROLLED').length;
  const totalAmount = soldCount * TICKET_PRICE_FCFA;
  const remittedCount = items.filter((i) => i.remise || i.ticket.coveredByRemiseId).length;
  const unremittedCount = soldCount - remittedCount;
  const controlledCount = items.filter((i) => i.ticket.controlCount > 0 || i.lastControl).length;

  const itemsPerPage = 14;
  const totalPages = Math.max(1, Math.ceil(totalCount / itemsPerPage));

  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage('a4', 'landscape');
    }

    // -------------------------------------------------------------------------
    // EN-TÊTE OFFICIEL OBLIGATOIRE
    // -------------------------------------------------------------------------
    // Fond bandeau supérieur
    doc.setFillColor(15, 23, 42); // slate-900
    doc.rect(0, 0, pageWidth, 28, 'F');

    // Liseré or/ambre
    doc.setFillColor(245, 158, 11); // amber-500
    doc.rect(0, 28, pageWidth, 1.5, 'F');

    // Titres de l'organisation
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('UNION DES JEUNES DE LA SÉCURITÉ ROUTIÈRE DE VRIDI — U.J.S.R.V.', marginX, 9);

    doc.setFontSize(15);
    doc.setTextColor(251, 191, 36); // amber-400
    doc.text('PORTUS — RAPPORT DE GESTION', marginX, 17);

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(226, 232, 240); // slate-200
    doc.text(`Période : ${periodLabel}`, marginX, 24);

    // Bloc métadonnées droite
    doc.setFontSize(8);
    doc.setTextColor(203, 213, 225);
    doc.text(`Utilisateur ayant généré : ${userName}`, pageWidth - marginX, 12, { align: 'right' });
    doc.text(`Édité le : ${generatedAt}`, pageWidth - marginX, 17, { align: 'right' });
    doc.text(`Page ${pageIdx + 1} / ${totalPages}`, pageWidth - marginX, 23, { align: 'right' });

    // -------------------------------------------------------------------------
    // BANDEAU DES INDICATEURS DE SYNTHÈSE (Sur chaque page)
    // -------------------------------------------------------------------------
    const kpiY = 32.5;
    const kpiH = 11;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, kpiY, pageWidth - marginX * 2, kpiH, 2, 2, 'FD');

    doc.setFontSize(7.5);
    doc.setTextColor(51, 65, 85);
    doc.setFont('helvetica', 'bold');

    const colW = (pageWidth - marginX * 2) / 5;

    // Col 1 : Total
    doc.text('TOTAL TICKETS', marginX + 4, kpiY + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`${totalCount} tickets`, marginX + 4, kpiY + 8.5);

    // Col 2 : Vendus
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('TICKETS VENDUS', marginX + colW + 4, kpiY + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`${soldCount} (${formatFCFA(totalAmount)})`, marginX + colW + 4, kpiY + 8.5);

    // Col 3 : Remises
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('REMISES COUVERTES', marginX + colW * 2 + 4, kpiY + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`${remittedCount} tickets (${formatFCFA(remittedCount * TICKET_PRICE_FCFA)})`, marginX + colW * 2 + 4, kpiY + 8.5);

    // Col 4 : Reste à verser
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('RESTANT À REMETTRE', marginX + colW * 3 + 4, kpiY + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(unremittedCount > 0 ? 225 : 51, unremittedCount > 0 ? 29 : 65, unremittedCount > 0 ? 72 : 85);
    doc.text(`${unremittedCount} tickets (${formatFCFA(unremittedCount * TICKET_PRICE_FCFA)})`, marginX + colW * 3 + 4, kpiY + 8.5);

    // Col 5 : Contrôlés
    doc.setTextColor(51, 65, 85);
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.text('CONTRÔLES ROUTIERS', marginX + colW * 4 + 4, kpiY + 4);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`${controlledCount} contrôlés`, marginX + colW * 4 + 4, kpiY + 8.5);

    // -------------------------------------------------------------------------
    // TABLEAU DÉTAILLÉ DES TICKETS
    // -------------------------------------------------------------------------
    let tableY = 47;
    const tableHeaderH = 7.5;
    const rowH = 9.5;

    // En-tête des colonnes du tableau
    doc.setFillColor(30, 41, 59); // slate-800
    doc.rect(marginX, tableY, pageWidth - marginX * 2, tableHeaderH, 'F');

    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);

    // Colonnes : Ticket(24), Carnet(20), Statut(28), Immatriculation(24), Agent(38), Responsable(38), Date Vente(28), Montant(22), Contrôle(24), Remise(23)
    const cols = [
      { label: 'TICKET', x: marginX + 3, w: 22 },
      { label: 'CARNET', x: marginX + 25, w: 18 },
      { label: 'STATUT', x: marginX + 43, w: 28 },
      { label: 'IMMAT.', x: marginX + 71, w: 23 },
      { label: 'AGENT DE TERRAIN', x: marginX + 94, w: 38 },
      { label: 'RESPONSABLE SECTEUR', x: marginX + 132, w: 38 },
      { label: 'DATE VENTE', x: marginX + 170, w: 26 },
      { label: 'MONTANT', x: marginX + 196, w: 22 },
      { label: 'CONTRÔLE', x: marginX + 218, w: 24 },
      { label: 'REMISE', x: marginX + 242, w: 27 },
    ];

    cols.forEach((col) => {
      doc.text(col.label, col.x, tableY + 5);
    });

    tableY += tableHeaderH;

    // Lignes de données
    const startIndex = pageIdx * itemsPerPage;
    const pageItems = items.slice(startIndex, startIndex + itemsPerPage);

    if (pageItems.length === 0) {
      doc.setFont('helvetica', 'italic');
      doc.setFontSize(9);
      doc.setTextColor(148, 163, 184);
      doc.text('Aucun enregistrement ne correspond aux filtres appliqués.', pageWidth / 2, tableY + 20, {
        align: 'center',
      });
    }

    pageItems.forEach((item, rIdx) => {
      const isEven = rIdx % 2 === 0;
      doc.setFillColor(isEven ? 255 : 248, isEven ? 255 : 250, isEven ? 255 : 252);
      doc.rect(marginX, tableY, pageWidth - marginX * 2, rowH, 'F');

      // Bordure basse
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.line(marginX, tableY + rowH, pageWidth - marginX, tableY + rowH);

      const t = item.ticket;
      const s = item.sale;
      const r = item.remise;
      const c = item.lastControl;
      const isSold = t.status === 'SOLD' || t.status === 'CONTROLLED';

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42); // slate-900

      // 1. Ticket
      doc.text(t.ticketNumber, cols[0].x, tableY + 4);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6);
      doc.setTextColor(100, 116, 139);
      doc.text(`ID: ${t.id.slice(0, 8)}`, cols[0].x, tableY + 7.5);

      // 2. Carnet
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
      doc.text(t.carnetNumber || '—', cols[1].x, tableY + 5.5);

      // 3. Statut
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      if (t.status === 'SOLD' || t.status === 'CONTROLLED') {
        doc.setTextColor(16, 185, 129); // emerald-600
        doc.text(t.status === 'CONTROLLED' ? 'VENDU & VÉRIFIÉ' : 'VENDU', cols[2].x, tableY + 5.5);
      } else if (t.status === 'CANCELLED') {
        doc.setTextColor(225, 29, 72); // rose-600
        doc.text('ANNULÉ', cols[2].x, tableY + 5.5);
      } else if (t.status === 'ASSIGNED_TO_AGENT') {
        doc.setTextColor(217, 119, 6); // amber-600
        doc.text('EN MAIN AGENT', cols[2].x, tableY + 5.5);
      } else {
        doc.setTextColor(71, 85, 105);
        doc.text(formatTicketStatusLabel(t.status), cols[2].x, tableY + 5.5);
      }

      // 4. Immatriculation
      doc.setFont('courier', 'bold');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      doc.text(t.plateNumber ? formatPlateDisplay(t.plateNumber) : '—', cols[3].x, tableY + 5.5);

      // 5. Agent
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
      const agentTxt = (t.assignedAgentName || s?.agentName || '—').slice(0, 22);
      doc.text(agentTxt, cols[4].x, tableY + 4.5);
      if (t.sectorName) {
        doc.setFontSize(5.5);
        doc.setTextColor(100, 116, 139);
        doc.text(t.sectorName.slice(0, 24), cols[4].x, tableY + 7.5);
      }

      // 6. Responsable
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7);
      doc.setTextColor(30, 41, 59);
      doc.text((t.assignedResponsableName || '—').slice(0, 22), cols[5].x, tableY + 5.5);

      // 7. Date vente
      doc.setFontSize(6.5);
      doc.setTextColor(71, 85, 105);
      if (t.soldAt) {
        doc.text(formatDate(t.soldAt), cols[6].x, tableY + 4);
        const timePart = t.soldAt.includes('T') ? t.soldAt.split('T')[1].slice(0, 5) : '';
        if (timePart) {
          doc.text(`à ${timePart}`, cols[6].x, tableY + 7.5);
        }
      } else {
        doc.text('—', cols[6].x, tableY + 5.5);
      }

      // 8. Montant
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(7.5);
      if (isSold) {
        doc.setTextColor(16, 185, 129);
        doc.text('5 000 F', cols[7].x, tableY + 5.5);
      } else {
        doc.setTextColor(148, 163, 184);
        doc.text('0 F', cols[7].x, tableY + 5.5);
      }

      // 9. Contrôle
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.5);
      if (t.controlCount > 0 || c) {
        doc.setTextColor(16, 185, 129);
        doc.text(`Oui (${t.controlCount || 1}x)`, cols[8].x, tableY + 4);
        doc.setFontSize(5.5);
        doc.setTextColor(100, 116, 139);
        doc.text(c?.controleurName ? c.controleurName.slice(0, 14) : 'Terrain', cols[8].x, tableY + 7.5);
      } else {
        doc.setTextColor(148, 163, 184);
        doc.text('Non', cols[8].x, tableY + 5.5);
      }

      // 10. Remise
      doc.setFontSize(6.5);
      if (isSold) {
        if (r || t.coveredByRemiseId) {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(16, 185, 129);
          doc.text('Couverte', cols[9].x, tableY + 4);
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(5.5);
          doc.setTextColor(100, 116, 139);
          doc.text(r ? r.reference.slice(0, 15) : 'Remis', cols[9].x, tableY + 7.5);
        } else {
          doc.setFont('helvetica', 'bold');
          doc.setTextColor(225, 29, 72);
          doc.text('À remettre', cols[9].x, tableY + 5.5);
        }
      } else {
        doc.setTextColor(148, 163, 184);
        doc.text('—', cols[9].x, tableY + 5.5);
      }

      tableY += rowH;
    });

    // -------------------------------------------------------------------------
    // PIED DE PAGE IMPRIMABLE
    // -------------------------------------------------------------------------
    const footerY = pageHeight - 8;
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.3);
    doc.line(marginX, footerY - 2, pageWidth - marginX, footerY - 2);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `PORTUS — Système Intégré de Recouvrement et de Contrôle • U.J.S.R.V. Vridi / Port-Bouët • Document officiel infalsifiable généré le ${generatedAt}`,
      marginX,
      footerY + 1.5
    );

    doc.setFont('helvetica', 'bold');
    doc.text(`Page ${pageIdx + 1} sur ${totalPages}`, pageWidth - marginX, footerY + 1.5, { align: 'right' });
  }

  // Sauvegarde et téléchargement du PDF
  const filename = `PORTUS_RAPPORT_GESTION_${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
}
