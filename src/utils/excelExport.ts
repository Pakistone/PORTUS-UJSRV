/**
 * Module d'export Excel XLSX pour PORTUS — U.J.S.R.V.
 * Utilise un import dynamique de 'xlsx' pour le code-splitting des performances.
 */

import type { Sale, Ticket, Remise, Control, AuditLog } from '../types';
import { formatDateTime } from './normalization';

export async function exportSalesToExcel(sales: Sale[]): Promise<void> {
  const XLSX = await import('xlsx');
  const data = sales.map((s) => ({
    'ID Vente': s.id,
    'Numéro Ticket': s.ticketNumber,
    'Agent': s.agentName,
    'Secteur': s.sectorName || '—',
    'Immatriculation': s.plateNumber,
    'Téléphone Chauffeur': s.driverPhone || '—',
    'Date/Heure Vente': formatDateTime(s.soldAt),
    'Montant (FCFA)': s.price,
    'Statut Synchro': s.syncStatus === 'SYNCED' ? 'SYNCHRONISÉ' : 'EN ATTENTE',
    'Date Synchro': formatDateTime(s.syncedAt),
    'GPS Latitude': s.gpsLatitude ?? 'Indisponible',
    'GPS Longitude': s.gpsLongitude ?? 'Indisponible',
    'Précision GPS (m)': s.gpsAccuracy ?? '—',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventes');
  XLSX.writeFile(workbook, `PORTUS_VENTES_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportTicketsToExcel(tickets: Ticket[]): Promise<void> {
  const XLSX = await import('xlsx');
  const data = tickets.map((t) => ({
    'ID Unique': t.id,
    'Numéro Ticket': t.ticketNumber,
    'Carnet': t.carnetNumber,
    'Statut': t.status,
    'Responsable': t.assignedResponsableName || '—',
    'Agent': t.assignedAgentName || '—',
    'Secteur': t.sectorName || '—',
    'Immatriculation': t.plateNumber || '—',
    'Date Vente': formatDateTime(t.soldAt),
    'Téléphone Chauffeur': t.driverPhone || '—',
    'Contrôlé (fois)': t.controlCount,
    'Dernier Contrôle': formatDateTime(t.lastControlledAt),
    'Actif / Remplacé': t.isSuperseded ? 'REMPLACÉ' : 'VALIDE',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Tickets');
  XLSX.writeFile(workbook, `PORTUS_TICKETS_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportRemisesToExcel(remises: Remise[]): Promise<void> {
  const XLSX = await import('xlsx');
  const data = remises.map((r) => ({
    'Référence': r.reference,
    'Date': r.date,
    'Heure': r.time,
    'Agent': r.agentName,
    'Responsable': r.responsableName,
    'Secteur': r.sectorName,
    'Montant Remis (FCFA)': r.amount,
    'Tickets Couverts': r.ticketsCount,
    'Observation': r.note || '—',
    'Corrigé par Admin': r.isCorrected ? 'OUI' : 'NON',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Remises');
  XLSX.writeFile(workbook, `PORTUS_REMISES_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportVentesARemettreToExcel(sales: Sale[]): Promise<void> {
  const XLSX = await import('xlsx');
  const data = sales.map((s) => ({
    'Numéro Ticket': s.ticketNumber,
    'Immatriculation': s.plateNumber,
    'Date/Heure Vente': formatDateTime(s.soldAt),
    'Montant (FCFA)': s.price,
    'Agent': s.agentName,
    'Secteur': s.sectorName || '—',
    'Statut': 'À REMETTRE (Non couvert)',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventes à Remettre');
  XLSX.writeFile(workbook, `PORTUS_VENTES_A_REMETTRE_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportControlsToExcel(controls: Control[]): Promise<void> {
  const XLSX = await import('xlsx');
  const data = controls.map((c) => ({
    'ID Contrôle': c.id,
    'Numéro Ticket': c.ticketNumber,
    'Immatriculation': c.plateNumber,
    'Contrôleur': c.controleurName,
    'Date/Heure': formatDateTime(c.controlledAt),
    'Résultat': c.isValid ? 'VALIDE' : 'NON CONFORME',
    'Message': c.validationMessage,
    'GPS Lat': c.gpsLatitude ?? '—',
    'GPS Lng': c.gpsLongitude ?? '—',
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Contrôles');
  XLSX.writeFile(workbook, `PORTUS_CONTROLES_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export async function exportAuditToExcel(logs: AuditLog[]): Promise<void> {
  const XLSX = await import('xlsx');
  const data = logs.map((l) => ({
    'ID Log': l.id,
    'Date/Heure': formatDateTime(l.timestamp),
    'Acteur': l.actorName,
    'Rôle': l.actorRole,
    'Action': l.action,
    'Entité Cible': l.targetEntity,
    'ID Cible': l.targetId,
    'Détails': l.details || '—',
    'Ancienne Valeur': typeof l.oldValue === 'object' ? JSON.stringify(l.oldValue) : String(l.oldValue ?? '—'),
    'Nouvelle Valeur': typeof l.newValue === 'object' ? JSON.stringify(l.newValue) : String(l.newValue ?? '—'),
  }));

  const worksheet = XLSX.utils.json_to_sheet(data);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Audit_Trail');
  XLSX.writeFile(workbook, `PORTUS_AUDIT_${new Date().toISOString().slice(0, 10)}.xlsx`);
}

export const exportAuditLogsToExcel = exportAuditToExcel;

export async function exportFullAuditPackage(data: {
  tickets: Ticket[];
  sales: Sale[];
  remises: Remise[];
  controls: Control[];
  auditLogs: AuditLog[];
}): Promise<void> {
  const XLSX = await import('xlsx');
  const workbook = XLSX.utils.book_new();

  const salesSheet = XLSX.utils.json_to_sheet(
    data.sales.map((s) => ({
      'ID Vente': s.id,
      'Numéro Ticket': s.ticketNumber,
      'Agent': s.agentName,
      'Secteur': s.sectorName || '—',
      'Immatriculation': s.plateNumber,
      'Téléphone': s.driverPhone || '—',
      'Date/Heure': formatDateTime(s.soldAt),
      'Prix (FCFA)': s.price,
      'Statut Synchro': s.syncStatus,
    }))
  );
  XLSX.utils.book_append_sheet(workbook, salesSheet, 'Ventes');

  const remisesSheet = XLSX.utils.json_to_sheet(
    data.remises.map((r) => ({
      'Référence': r.reference,
      'Date': r.date,
      'Heure': r.time,
      'Agent': r.agentName,
      'Responsable': r.responsableName,
      'Secteur': r.sectorName,
      'Montant (FCFA)': r.amount,
      'Tickets': r.ticketsCount,
      'Observation': r.note || '—',
      'Correction Admin': r.isCorrected ? 'OUI' : 'NON',
    }))
  );
  XLSX.utils.book_append_sheet(workbook, remisesSheet, 'Remises');

  const ticketsSheet = XLSX.utils.json_to_sheet(
    data.tickets.map((t) => ({
      'Numéro Ticket': t.ticketNumber,
      'Carnet': t.carnetNumber,
      'Statut': t.status,
      'Responsable': t.assignedResponsableName || '—',
      'Agent': t.assignedAgentName || '—',
      'Plaque': t.plateNumber || '—',
      'Date Vente': formatDateTime(t.soldAt),
      'Contrôlé': t.controlCount,
    }))
  );
  XLSX.utils.book_append_sheet(workbook, ticketsSheet, 'Tickets');

  const controlsSheet = XLSX.utils.json_to_sheet(
    data.controls.map((c) => ({
      'Ticket': c.ticketNumber,
      'Plaque': c.plateNumber,
      'Contrôleur': c.controleurName,
      'Date/Heure': formatDateTime(c.controlledAt),
      'Résultat': c.isValid ? 'VALIDE' : 'NON CONFORME',
      'Message': c.validationMessage,
    }))
  );
  XLSX.utils.book_append_sheet(workbook, controlsSheet, 'Contrôles');

  const auditSheet = XLSX.utils.json_to_sheet(
    data.auditLogs.map((l) => ({
      'Date/Heure': formatDateTime(l.timestamp),
      'Acteur': l.actorName,
      'Rôle': l.actorRole,
      'Action': l.action,
      'Cible': l.targetEntity,
      'Détails': l.details || '—',
    }))
  );
  XLSX.utils.book_append_sheet(workbook, auditSheet, 'Audit');

  XLSX.writeFile(workbook, `PORTUS_PACKAGE_AUDIT_COMPLET_${new Date().toISOString().slice(0, 10)}.xlsx`);
}
