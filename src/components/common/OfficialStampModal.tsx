import React, { useRef } from 'react';
import { X, Download, Printer, Shield, CheckCircle2 } from 'lucide-react';

interface OfficialStampModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function OfficialStampModal({ isOpen, onClose }: OfficialStampModalProps) {
  const svgRef = useRef<SVGSVGElement>(null);

  if (!isOpen) return null;

  const handleDownloadPNG = () => {
    if (!svgRef.current) return;
    const svgElement = svgRef.current;
    const svgString = new XMLSerializer().serializeToString(svgElement);
    const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
    const URL = window.URL || window.webkitURL || window;
    const blobURL = URL.createObjectURL(svgBlob);
    
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = 800;
      canvas.height = 800;
      const context = canvas.getContext('2d');
      if (context) {
        context.fillStyle = '#ffffff';
        context.fillRect(0, 0, canvas.width, canvas.height);
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        
        const pngUrl = canvas.toDataURL('image/png');
        const downloadLink = document.createElement('a');
        downloadLink.href = pngUrl;
        downloadLink.download = 'CACHET_OFFICIEL_UJSRV_PORTUS.png';
        document.body.appendChild(downloadLink);
        downloadLink.click();
        document.body.removeChild(downloadLink);
      }
    };
    image.src = blobURL;
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    
    const svgHTML = svgRef.current ? svgRef.current.outerHTML : '';
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Cachet Officiel U.J.S.R.V. — PORTUS</title>
          <style>
            body { display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; font-family: sans-serif; background: #fff; }
            .stamp-container { width: 400px; height: 400px; }
            .info { margin-top: 20px; text-align: center; color: #334155; }
          </style>
        </head>
        <body>
          <div class="stamp-container">${svgHTML}</div>
          <div class="info">
            <h3>U.J.S.R.V. — Cachet Officiel de Surveillance Camion</h3>
            <p>Zone Industrielle & Portuaire de Vridi | Contacts : 07 77 91 78 04 / 01 03 31 37 68</p>
          </div>
          <script>
            window.onload = () => { window.print(); };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-sm p-4 animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-xl overflow-hidden flex flex-col">
        {/* En-tête */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 dark:bg-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
              <Shield className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-lg">Cachet Officiel U.J.S.R.V.</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">Modèle vectoriel HD haute précision (Portus)</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Corps - Aperçu du Cachet SVG */}
        <div className="p-8 flex flex-col items-center justify-center bg-slate-100 dark:bg-slate-950/50">
          <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-800 flex flex-col items-center">
            <svg
              ref={svgRef}
              viewBox="0 0 400 400"
              className="w-72 h-72 sm:w-80 sm:h-80 drop-shadow-sm"
              xmlns="http://www.w3.org/2000/svg"
            >
              {/* Fond blanc pur */}
              <rect width="400" height="400" fill="#ffffff" rx="20" />

              {/* Définition des chemins circulaires pour le texte */}
              <defs>
                <path
                  id="textPathTop"
                  d="M 60,200 A 140,140 0 1,1 340,200"
                />
                <path
                  id="textPathBottom"
                  d="M 80,225 A 130,130 0 1,0 320,225"
                />
              </defs>

              {/* Blason / Écusson extérieur double contour */}
              <path
                d="M 200,35 C 310,35 365,80 365,180 C 365,270 290,340 200,375 C 110,340 35,270 35,180 C 35,80 90,35 200,35 Z"
                fill="#f8fafc"
                stroke="#0f172a"
                strokeWidth="4"
              />
              <path
                d="M 200,45 C 300,45 350,85 350,180 C 350,262 280,328 200,360 C 120,328 50,262 50,180 C 50,85 100,45 200,45 Z"
                fill="none"
                stroke="#059669"
                strokeWidth="2"
                strokeDasharray="4 2"
              />

              {/* Couronne de laurier / Étoile supérieure */}
              <polygon points="200,50 203,58 211,59 205,65 207,73 200,69 193,73 195,65 189,59 197,58" fill="#059669" />

              {/* Texte en arc supérieur */}
              <text
                fontSize="12.5"
                fontWeight="bold"
                fill="#0f172a"
                letterSpacing="1.2"
              >
                <textPath href="#textPathTop" startOffset="50%" textAnchor="middle">
                  UNION DES JEUNES DE LA SÉCURITÉ ROUTIÈRE DE VRIDI
                </textPath>
              </text>

              {/* Cadre central du logo (Blason intérieur) */}
              <g transform="translate(110, 115)">
                <rect x="0" y="0" width="180" height="120" rx="12" fill="#0f172a" stroke="#059669" strokeWidth="2.5" />
                
                {/* Badge titre */}
                <rect x="15" y="12" width="150" height="26" rx="6" fill="#059669" />
                <text x="90" y="30" fill="#ffffff" fontSize="11" fontWeight="bold" textAnchor="middle" letterSpacing="1">
                  SURVEILLANCE CAMION
                </text>

                {/* Icône Camion Semi-Remorque vectorielle */}
                <g transform="translate(45, 45)">
                  {/* Remorque */}
                  <rect x="10" y="10" width="55" height="30" rx="3" fill="#ffffff" />
                  {/* Cabine */}
                  <path d="M 65,22 L 80,22 L 90,32 L 90,40 L 65,40 Z" fill="#ffffff" />
                  <rect x="70" y="25" width="12" height="10" rx="1" fill="#0f172a" />
                  {/* Roues */}
                  <circle cx="25" cy="43" r="6" fill="#059669" stroke="#ffffff" strokeWidth="2" />
                  <circle cx="75" cy="43" r="6" fill="#059669" stroke="#ffffff" strokeWidth="2" />
                </g>

                {/* Sigle U.J.S.R.V. */}
                <text x="90" y="108" fill="#38bdf8" fontSize="13" fontWeight="bold" textAnchor="middle" letterSpacing="2">
                  U. J. S. R. V.
                </text>
              </g>

              {/* Texte en arc inférieur (Contacts & Localisation) */}
              <text
                fontSize="10"
                fontWeight="bold"
                fill="#047857"
                letterSpacing="0.8"
              >
                <textPath href="#textPathBottom" startOffset="50%" textAnchor="middle">
                  CONTACTS : 07 77 91 78 04 / 01 03 31 37 68
                </textPath>
              </text>

              {/* Mention Zone Industrielle */}
              <text x="200" y="342" fill="#64748b" fontSize="9" fontWeight="bold" textAnchor="middle" letterSpacing="0.5">
                Zone Industrielle &amp; Portuaire de Vridi
              </text>
            </svg>
          </div>

          <div className="mt-4 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-medium bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1.5 rounded-lg border border-emerald-200 dark:border-emerald-800">
            <CheckCircle2 className="w-4 h-4" />
            Cachet vectoriel HD prêt pour l'impression officielle et l'apposition sur les carnets PORTUS.
          </div>
        </div>

        {/* Pied d'actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            Fermer
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl shadow-sm transition-colors"
          >
            <Printer className="w-4 h-4" />
            Imprimer
          </button>
          <button
            onClick={handleDownloadPNG}
            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-lg shadow-emerald-600/20 transition-all"
          >
            <Download className="w-4 h-4" />
            Télécharger HD (PNG)
          </button>
        </div>
      </div>
    </div>
  );
};
