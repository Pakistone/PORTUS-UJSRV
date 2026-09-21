/**
 * Générateur PDF pour PORTUS — U.J.S.R.V.
 * 
 * RÈGLES MÉTIER :
 * 1. Format physique : A4 Paysage (297 x 210 mm)
 * 2. Disposition : 9 tickets par page (grille 3 colonnes x 3 lignes)
 * 3. Zones obligatoires sur chaque ticket physique :
 *    - Image du logo / cachet officiel U.J.S.R.V. (/logoss.jpg ou /cachet-ujsrv.png)
 *    - Numéro de ticket (clairement visible)
 *    - QR Code unique haute définition (20 x 20 mm)
 *    - Immatriculation (zone vierge avec ligne pointillée)
 *    - Date manuscrite (____ / ____ / 2026)
 *    - Signature de l'agent & Cachet officiel avec image intégrée (16x16 mm)
 *    - Contacts officiels U.J.S.R.V.
 * 4. ⚠️ INTERDICTION STRICTE D'IMPRIMER DES PRIX OU MONTANTS
 */

import QRCode from 'qrcode';
import type { Carnet, Ticket, Remise } from '../types';
import { ORG_INFO } from '../config/constants';
import { formatFCFA, formatDate, formatDateTime } from './normalization';

/**
 * Génère un Data URL PNG d'un cachet officiel rond d'entreprise (vectoriel flat design)
 * Couleurs : vert forêt (#0F4C3A) et gris ardoise (#1E293B) sur fond parfaitement blanc.
 */
function getFallbackStampDataUrl(): string {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 500;
    canvas.height = 500;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    // Fond blanc pur
    ctx.clearRect(0, 0, 500, 500);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 500, 500);

    const cx = 250;
    const cy = 250;
    const rOuter = 220;
    const rInner = 205;

    // 1. Double cercle extérieur fin (Vert forêt #0F4C3A)
    ctx.strokeStyle = '#0F4C3A';
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(cx, cy, rOuter, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, rInner, 0, Math.PI * 2);
    ctx.stroke();

    // 2. Texte circulaire supérieur 'U.J.S.R.V.'
    ctx.save();
    ctx.fillStyle = '#0F4C3A';
    ctx.font = '900 42px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const topText = 'U . J . S . R . V .';
    ctx.translate(cx, cy);
    ctx.rotate(-Math.PI / 2 - 0.35);
    const radiusTop = 175;
    for (let i = 0; i < topText.length; i++) {
      ctx.save();
      const angle = (i - topText.length / 2 + 0.5) * 0.12;
      ctx.rotate(angle);
      ctx.translate(0, -radiusTop);
      ctx.fillText(topText[i], 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // 3. Texte circulaire inférieur 'CACHET OFFICIEL'
    ctx.save();
    ctx.fillStyle = '#0F4C3A';
    ctx.font = '700 24px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const bottomText = '• CACHET OFFICIEL •';
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 2 + 0.55);
    const radiusBottom = 172;
    for (let i = 0; i < bottomText.length; i++) {
      ctx.save();
      const angle = (i - bottomText.length / 2 + 0.5) * 0.085;
      ctx.rotate(-angle);
      ctx.translate(0, radiusBottom);
      ctx.fillText(bottomText[i], 0, 0);
      ctx.restore();
    }
    ctx.restore();

    // 4. Silhouette centrale minimaliste et moderne d'un camion de face & branches de laurier
    // Branches de laurier latérales (gris ardoise #1E293B)
    ctx.fillStyle = '#1E293B';
    ctx.strokeStyle = '#1E293B';
    ctx.lineWidth = 3;

    // Laurier gauche
    for (let i = -2; i <= 2; i++) {
      const ly = cy + i * 22;
      const lx = cx - 95 - Math.abs(i) * 4;
      ctx.beginPath();
      ctx.ellipse(lx, ly, 10, 5, Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    }
    // Laurier droit
    for (let i = -2; i <= 2; i++) {
      const ly = cy + i * 22;
      const rx = cx + 95 + Math.abs(i) * 4;
      ctx.beginPath();
      ctx.ellipse(rx, ly, 10, 5, -Math.PI / 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Camion semi-remorque de face (Flat Design géométrique épuré)
    // Cabine principale
    ctx.fillStyle = '#0F4C3A';
    ctx.fillRect(cx - 50, cy - 35, 100, 75);

    // Pare-brise
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(cx - 40, cy - 25, 80, 30);

    // Séparateur pare-brise
    ctx.fillStyle = '#0F4C3A';
    ctx.fillRect(cx - 3, cy - 25, 6, 30);

    // Phares et calandre
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(cx - 42, cy + 12, 84, 15);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx - 32, cy + 19, 5, 0, Math.PI * 2);
    ctx.arc(cx + 32, cy + 19, 5, 0, Math.PI * 2);
    ctx.fill();

    // Roues latérales
    ctx.fillRect(cx - 62, cy + 25, 14, 25);
    ctx.fillRect(cx + 48, cy + 25, 14, 25);

    return canvas.toDataURL('image/png');
  } catch {
    return '';
  }
}


/**
 * Charge l'image de manière fiable en Base64 via Fetch/Blob (très fiable en local) ou Canvas
 */
const loadImageDataUrl = async (url: string): Promise<string> => {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          resolve(reader.result);
        } else {
          reject(new Error('FileReader result is not a string'));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (fetchErr) {
    console.warn(`Fetch method failed for ${url}, trying canvas fallback:`, fetchErr);
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'Anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width || 400;
          canvas.height = img.naturalHeight || img.height || 400;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } else {
            reject(new Error('Canvas context failed'));
          }
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = reject;
      img.src = url;
    });
  }
};

async function loadLogoImage(): Promise<string> {
  try {
    return await loadImageDataUrl('/logoss.jpg');
  } catch {
    return getFallbackStampDataUrl();
  }
}

async function loadStampImage(): Promise<string> {
  try {
    return await loadImageDataUrl('/cachet-ujsrv.png');
  } catch {
    return getFallbackStampDataUrl();
  }
}

/**
 * Génère le PDF d'impression complet d'un carnet prêt à imprimer (9 tickets par feuille A4 Paysage)
 * Modèle officiel PORTUS — U.J.S.R.V. (Titre de circulation / Surveillance Camion)
 */
export async function generateCarnetPrintPDF(
  carnet: Carnet,
  tickets: Ticket[],
  onProgress?: (progress: number, total: number) => void
): Promise<void> {
  // Chargement dynamique de jspdf et des images
  const [{ jsPDF }, logoDataUrl, stampDataUrl] = await Promise.all([
    import('jspdf'),
    loadLogoImage(),
    loadStampImage(),
  ]);

  // Format A4 paysage standard : 297mm x 210mm
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = 297;
  const pageHeight = 210;

  // Grille 3 colonnes x 3 lignes = 9 tickets par page
  const cols = 3;
  const rows = 3;
  const ticketsPerPage = 9;

  // 3 × 3 tickets couvrant exactement la feuille A4 paysage.
  // Chaque ticket mesure donc exactement 99 × 70 mm.
  const marginX = 0;
  const marginY = 0;
  const ticketWidth = pageWidth / cols; // 99 mm
  const ticketHeight = pageHeight / rows; // 70 mm

  const totalTickets = tickets.length;
  const totalPages = Math.ceil(totalTickets / ticketsPerPage);

  // Génération optimisée des QR Codes par lots
  const qrCodes: string[] = new Array(totalTickets);
  const batchSize = 18;

  for (let i = 0; i < totalTickets; i += batchSize) {
    const end = Math.min(i + batchSize, totalTickets);
    const batch = tickets.slice(i, end);
    const rendered = await Promise.all(
      batch.map(async (t) => {
        try {
          return await QRCode.toDataURL(t.qrPayload || t.ticketNumber, {
            width: 180,
            margin: 0,
            errorCorrectionLevel: 'M',
            color: {
              dark: '#0F4C3A',
              light: '#ffffff',
            },
          });
        } catch {
          return '';
        }
      })
    );
    for (let j = 0; j < rendered.length; j++) {
      qrCodes[i + j] = rendered[j];
    }
    if (onProgress) {
      onProgress(Math.min(end, totalTickets), totalTickets);
    }
  }

  // Construction des pages A4 paysage
  for (let pageIdx = 0; pageIdx < totalPages; pageIdx++) {
    if (pageIdx > 0) {
      doc.addPage('a4', 'landscape');
    }

    const startIndex = pageIdx * ticketsPerPage;
    const pageTickets = tickets.slice(startIndex, startIndex + ticketsPerPage);

    pageTickets.forEach((ticket, idx) => {
      const globalIdx = startIndex + idx;
      const col = idx % cols;
      const row = Math.floor(idx / cols);

      const x0 = marginX + col * ticketWidth;
      const y0 = marginY + row * ticketHeight;

      // 1. Ligne de découpe extérieure (tirets fins et coins marqués)
      doc.setDrawColor(148, 163, 184);
      doc.setLineDashPattern([2, 2], 0);
      doc.setLineWidth(0.2);
      doc.rect(x0, y0, ticketWidth, ticketHeight);
      doc.setLineDashPattern([], 0);

      // 2. Fond blanc du ticket
      doc.setFillColor(255, 255, 255);
      doc.rect(x0 + 0.5, y0 + 0.5, ticketWidth - 1, ticketHeight - 1, 'F');

      // 3. Cadre externe fin et élégant (0.5 pt)
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.3);
      doc.rect(x0 + 1.2, y0 + 1.2, ticketWidth - 2.4, ticketHeight - 2.4);

      // =========================================================================
      // 1. EN-TÊTE DU TICKET (Fond clair épuré, double liseré vert / ardoise)
      // =========================================================================
      doc.setFillColor(248, 250, 252);
      doc.rect(x0 + 1.3, y0 + 1.3, ticketWidth - 2.6, 14.5, 'F');

      // Double liseré séparateur de l'en-tête (Vert foncé #0F4C3A et Ardoise #1E293B)
      doc.setDrawColor(15, 76, 58); // Vert foncé #0F4C3A
      doc.setLineWidth(0.6);
      doc.line(x0 + 1.2, y0 + 15.8, x0 + ticketWidth - 1.2, y0 + 15.8);
      doc.setDrawColor(30, 41, 59); // Ardoise #1E293B
      doc.setLineWidth(0.2);
      doc.line(x0 + 1.2, y0 + 16.1, x0 + ticketWidth - 1.2, y0 + 16.1);

      // LOGO EN HAUT À GAUCHE : x = x0 + 2.5 mm, y = y0 + 2 mm, taille 12 × 12 mm
      if (logoDataUrl) {
        doc.addImage(logoDataUrl, 'PNG', x0 + 2.5, y0 + 2.0, 12, 12);
      }

      // EN-TÊTE : coordonnées absolues, sans maxWidth.
      const textX = x0 + 17;

      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6);
      doc.setTextColor(30, 41, 59);
      doc.text('UNION DES JEUNES DE LA SÉCURITÉ', textX, y0 + 4.0);
      doc.text('ROUTIÈRE DE VRIDI', textX, y0 + 6.5);

      doc.setFontSize(10.5);
      doc.setTextColor(15, 76, 58);
      doc.text('SURVEILLANCE CAMION', textX, y0 + 11.0);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(5);
      doc.setTextColor(100, 116, 139);
      doc.text('Zone Portuaire & Industrielle de Vridi — Port-Bouët', textX, y0 + 14.0);

      // Référence du carnet en haut à droite (sans superposition)
      doc.setFontSize(4.5);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 76, 58);
      doc.text(`CARNET : ${carnet.carnetNumber}`, x0 + ticketWidth - 2.5, y0 + 4.0, { align: 'right' });

      // =========================================================================
      // 2. CARTOUCHE NUMÉRO & QR CODE
      // =========================================================================
      const contentTopY = y0 + 17.5;

      // Cartouche Numéro
      doc.setFillColor(241, 245, 249); // #F1F5F9
      doc.setDrawColor(203, 213, 225);
      doc.setLineWidth(0.3);
      doc.roundedRect(x0 + 2.5, contentTopY, ticketWidth - 28, 8.0, 1, 1, 'FD');

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(9);
      doc.text(`TICKET N° : ${ticket.ticketNumber}`, x0 + 4, contentTopY + 5.2);

      // QR Code
      const qrX = x0 + ticketWidth - 23;
      const qrY = y0 + 17.0;
      const qrSize = 20;

      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(30, 41, 59);
      doc.setLineWidth(0.3);
      doc.roundedRect(qrX, qrY, qrSize, qrSize, 1, 1, 'FD');

      const qrData = qrCodes[globalIdx];
      if (qrData) {
        doc.addImage(qrData, 'PNG', qrX + 1, qrY + 1, qrSize - 2, qrSize - 2);
      }

      // =========================================================================
      // 3. CORPS DU TICKET (IMMATRICULATION & DATE)
      // =========================================================================
      const leftWidth = ticketWidth - 28;
      const immY = contentTopY + 9.0;
      const immHeight = 8;

      // Boîte IMMATRICULATION
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.35);
      doc.roundedRect(x0 + 2.5, immY, leftWidth, immHeight, 1, 1, 'FD');

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.2);
      doc.text('IMMATRICULATION :', x0 + 3.5, immY + 5.2);

      // Ligne pointillée
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.2);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.line(x0 + 29.5, immY + 5.2, x0 + ticketWidth - 28, immY + 5.2);
      doc.setLineDashPattern([], 0);

      // DATE
      const dateY = immY + 8.8;
      doc.setFillColor(255, 255, 255);
      doc.setDrawColor(148, 163, 184);
      doc.roundedRect(x0 + 2.5, dateY, leftWidth, 6.5, 1, 1, 'FD');

      doc.setTextColor(15, 23, 42);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4.5);
      doc.text('DATE :', x0 + 3.5, dateY + 4.2);

      doc.setFont('courier', 'normal');
      doc.setFontSize(5.8);
      doc.setTextColor(100, 116, 139);
      doc.text('____ / ____ / 2026', x0 + 13, dateY + 4.2);

      // =========================================================================
      // 4. CADRES INFÉRIEURS (SIGNATURE AGENT & CACHET OFFICIEL)
      // =========================================================================
      const boxY = dateY + 7.5;
      const boxW = (leftWidth - 1) / 2; // ~31.5 mm chacun
      const boxH = 14;

      // Encadré 1 : SIGNATURE AGENT (vierge)
      doc.setDrawColor(148, 163, 184);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.roundedRect(x0 + 2.5, boxY, boxW, boxH, 1, 1, 'D');
      doc.setLineDashPattern([], 0);

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x0 + 3, boxY + 0.5, boxW - 1, 3.2, 0.5, 0.5, 'F');
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4);
      doc.text('SIGNATURE AGENT', x0 + 3.8, boxY + 2.5);

      // Encadré 2 : CACHET OFFICIEL (tampon image 14 × 14 mm parfaitement centré)
      doc.setDrawColor(148, 163, 184);
      doc.setLineDashPattern([0.8, 0.8], 0);
      doc.roundedRect(x0 + 3.5 + boxW, boxY, boxW, boxH, 1, 1, 'D');
      doc.setLineDashPattern([], 0);

      doc.setFillColor(248, 250, 252);
      doc.roundedRect(x0 + 4 + boxW, boxY + 0.5, boxW - 1, 3.2, 0.5, 0.5, 'F');
      doc.setTextColor(51, 65, 85);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(4);
      doc.text('CACHET OFFICIEL', x0 + 4.8 + boxW, boxY + 2.5);

      if (stampDataUrl) {
        const stampImgSize = 16; // 16 x 16 mm
        const stampImgX = x0 + 3.5 + boxW + (boxW - stampImgSize) / 2;
        const stampImgY = boxY + 3.0;
        doc.addImage(stampDataUrl, 'PNG', stampImgX, stampImgY, stampImgSize, stampImgSize);
      }

      // =========================================================================
      // 5. BAS DU TICKET (PIED DE PAGE NET)
      // =========================================================================
      const footerY = y0 + ticketHeight - 2.5;

      doc.setTextColor(15, 76, 58); // Vert officiel #0F4C3A
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.5);
      doc.text(
        'CONTACTS OFFICIELS : 07 77 91 78 04 / 01 03 31 37 68',
        x0 + ticketWidth / 2,
        footerY,
        { align: 'center' }
      );
    });
  }

  // Téléchargement immédiat
  doc.save(`PORTUS_CARNET_${carnet.carnetNumber}_${totalTickets}TICKETS.pdf`);
}

/**
 * Génère le reçu officiel d'une Remise Financière (A5 Portrait)
 */
export async function generateRemiseReceiptPDF(remise: Remise): Promise<void> {
  const { jsPDF } = await import('jspdf');
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a5',
  });
  const pw = 148;

  // En-tête
  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, pw, 28, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(ORG_INFO.FULL_ORG_NAME, pw / 2, 10, { align: 'center' });
  doc.setFontSize(9);
  doc.setTextColor(16, 185, 129);
  doc.text(`PORTUS — REÇU OFFICIEL DE REMISE FINANCIÈRE`, pw / 2, 16, { align: 'center' });
  doc.setTextColor(203, 213, 225);
  doc.setFontSize(7);
  doc.text(`${ORG_INFO.COMMUNE} — ${ORG_INFO.COUNTRY}`, pw / 2, 22, { align: 'center' });

  // Référence
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(`RÉFÉRENCE : ${remise.reference}`, 14, 40);

  // Cadre montant
  doc.setFillColor(240, 253, 244);
  doc.setDrawColor(16, 185, 129);
  doc.setLineWidth(0.8);
  doc.roundedRect(14, 46, pw - 28, 22, 3, 3, 'FD');
  doc.setTextColor(22, 101, 52);
  doc.setFontSize(9);
  doc.text('MONTANT VERSÉ', pw / 2, 53, { align: 'center' });
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(formatFCFA(remise.amount), pw / 2, 63, { align: 'center' });

  // Détails
  doc.setTextColor(15, 23, 42);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  let curY = 78;
  const lineGap = 7;

  const addRow = (label: string, val: string) => {
    doc.setFont('helvetica', 'bold');
    doc.text(label, 14, curY);
    doc.setFont('helvetica', 'normal');
    doc.text(val, 70, curY);
    doc.setDrawColor(226, 232, 240);
    doc.line(14, curY + 2, pw - 14, curY + 2);
    curY += lineGap;
  };

  addRow('Date et heure :', `${formatDate(remise.date)} à ${remise.time}`);
  addRow('Agent concerné :', remise.agentName);
  addRow('Responsable receveur :', remise.responsableName);
  addRow('Secteur de versement :', remise.sectorName);
  addRow('Tickets couverts :', `${remise.ticketsCount} tickets (à 5 000 FCFA/unité)`);
  if (remise.note) {
    addRow('Observation :', remise.note);
  }

  // Signatures
  curY += 15;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Signature de l’Agent :', 20, curY);
  doc.text('Signature du Responsable :', pw - 70, curY);

  doc.setDrawColor(148, 163, 184);
  doc.setLineDashPattern([1, 1], 0);
  doc.rect(18, curY + 4, 45, 20);
  doc.rect(pw - 72, curY + 4, 45, 20);

  // Bas de page
  doc.setLineDashPattern([], 0);
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'italic');
  doc.text(
    `Reçu généré par le système PORTUS le ${formatDateTime(new Date().toISOString())} — Traçabilité garantie`,
    pw / 2,
    200,
    { align: 'center' }
  );

  doc.save(`REMISE_${remise.reference}.pdf`);
}
