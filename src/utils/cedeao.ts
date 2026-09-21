/**
 * Annuaire et utilitaires CEDEAO pour PORTUS — U.J.S.R.V.
 * Gestion des indicatifs téléphoniques, formats de plaques et messages WhatsApp officiels.
 */

export interface CedeaoCountry {
  name: string;
  code: string;
  dialCode: string;
  flag: string;
  placeholder: string;
}

export const CEDEAO_COUNTRIES: CedeaoCountry[] = [
  { name: "Côte d'Ivoire", code: 'CI', dialCode: '+225', flag: '🇨🇮', placeholder: '0701020304' },
  { name: 'Mali', code: 'ML', dialCode: '+223', flag: '🇲🇱', placeholder: '70123456' },
  { name: 'Burkina Faso', code: 'BF', dialCode: '+226', flag: '🇧🇫', placeholder: '70123456' },
  { name: 'Ghana', code: 'GH', dialCode: '+233', flag: '🇬🇭', placeholder: '241234567' },
  { name: 'Guinée', code: 'GN', dialCode: '+224', flag: '🇬🇳', placeholder: '620123456' },
  { name: 'Sénégal', code: 'SN', dialCode: '+221', flag: '🇸🇳', placeholder: '771234567' },
  { name: 'Togo', code: 'TG', dialCode: '+228', flag: '🇹🇬', placeholder: '90123456' },
  { name: 'Bénin', code: 'BJ', dialCode: '+229', flag: '🇧🇯', placeholder: '97123456' },
  { name: 'Niger', code: 'NE', dialCode: '+227', flag: '🇳🇪', placeholder: '90123456' },
  { name: 'Nigéria', code: 'NG', dialCode: '+234', flag: '🇳🇬', placeholder: '8031234567' },
  { name: 'Liberia', code: 'LR', dialCode: '+231', flag: '🇱🇷', placeholder: '881234567' },
  { name: 'Sierra Leone', code: 'SL', dialCode: '+232', flag: '🇸🇱', placeholder: '76123456' },
  { name: 'Gambie', code: 'GM', dialCode: '+220', flag: '🇬🇲', placeholder: '7012345' },
  { name: 'Cap-Vert', code: 'CV', dialCode: '+238', flag: '🇨🇻', placeholder: '9912345' },
  { name: 'Guinée-Bissau', code: 'GW', dialCode: '+245', flag: '🇬🇼', placeholder: '961234567' },
];

export function formatE164Phone(dialCode: string, phoneNumber: string): string {
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  const cleanDial = dialCode.replace(/\D/g, '');
  return `+${cleanDial}${cleanPhone}`;
}

export function generateWhatsAppReceiptUrl(params: {
  dialCode: string;
  phoneNumber: string;
  ticketNumber: string;
  plateNumber: string;
  amount: number;
  agentName: string;
  dateStr: string;
}): string {
  const fullPhone = params.phoneNumber.replace(/\D/g, '');
  if (!fullPhone) return '';
  const cleanDial = params.dialCode.replace('+', '');
  const targetNumber = `${cleanDial}${fullPhone}`;

  const message = 
    `*U.J.S.R.V. — PORTUS* %0A` +
    `_Quittance Officielle de Stationnement (Poids Lourd)_ %0A%0A` +
    `🎫 *Ticket N° :* ${params.ticketNumber} %0A` +
    `🚛 *Immatriculation :* ${params.plateNumber} %0A` +
    `💵 *Montant réglé :* ${params.amount.toLocaleString()} FCFA %0A` +
    `👤 *Agent perceptteur :* ${params.agentName} %0A` +
    `📅 *Date & Heure :* ${params.dateStr} %0A%0A` +
    `✅ *Validité :* 7 jours à compter de l'émission. %0A` +
    `📍 _Zone Portuaire & Industrielle de Vridi (Port Autonome d'Abidjan)_ %0A` +
    `📞 _Contacts : 07 77 91 78 04 / 01 03 31 37 68_`;

  return `https://wa.me/${targetNumber}?text=${message}`;
}
