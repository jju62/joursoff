import { useMemo, useState } from 'react';
import {
  CalendarRange,
  Check,
  Copy,
  Download,
  FileSpreadsheet,
  FileText,
  Lock,
  ShieldCheck,
  X,
} from 'lucide-react';
import ExcelJS from 'exceljs';
import { jsPDF } from 'jspdf';
import type { LeaveItem } from '../App';

type ExportCalendarModalProps = {
  isOpen: boolean;
  onClose: () => void;
  isPro: boolean;
  leaves: LeaveItem[];
  year: number;
  user: { id?: string; email?: string | null } | null;
  onUpgrade?: () => Promise<void> | void;
  quotas?: {
    cp?: number;
    rtt?: number;
  };
};

function formatFrNumber(value: number) {
  return value.toFixed(2).replace(/\.0+$/, '').replace(/(\.\d)0+$/, '$1').replace('.', ',');
}

function toLocalIsoDate(date: Date) {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function formatDateFr(date: string) {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('fr-FR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function buildCalendarToken(userId: string) {
  const payload = JSON.stringify({
    userId,
    exp: Date.now() + 1000 * 60 * 60 * 24 * 365,
    version: 1,
  });
  const bytes = new TextEncoder().encode(payload);
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function buildIcsContent(leaves: LeaveItem[]) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//CongesZen//FR//EN',
    'CALSCALE:GREGORIAN',
  ];

  leaves.forEach((leave) => {
    const startDate = leave.date.replace(/-/g, '');
    const endDate = new Date(`${leave.date}T12:00:00`);
    endDate.setDate(endDate.getDate() + 1);
    const endStamp = toLocalIsoDate(endDate).replace(/-/g, '');
    const summary = `${leave.type} ${leave.label ? `- ${leave.label}` : ''}`.trim();
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${leave.id}@joursoff.local`);
    lines.push(`DTSTAMP:${toLocalIsoDate(new Date()).replace(/-/g, '')}T000000Z`);
    lines.push(`DTSTART;VALUE=DATE:${startDate}`);
    lines.push(`DTEND;VALUE=DATE:${endStamp}`);
    lines.push(`SUMMARY:${summary}`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

function drawLeaveChart(cpDays: number, rttDays: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1000;
  canvas.height = 420;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Impossible de créer le graphique du bilan.');

  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#0f172a';
  context.font = 'bold 30px Arial';
  context.fillText('Jours de congés posés', 36, 52);

  const maxDays = Math.max(cpDays, rttDays, 1);
  const chartLeft = 210;
  const chartWidth = 700;
  const bars = [
    { label: 'Congés payés', days: cpDays, color: '#10b981' },
    { label: 'RTT', days: rttDays, color: '#6366f1' },
  ];

  bars.forEach((bar, index) => {
    const y = 125 + index * 135;
    const width = (bar.days / maxDays) * chartWidth;
    context.fillStyle = '#334155';
    context.font = 'bold 25px Arial';
    context.fillText(bar.label, 36, y + 43);
    context.fillStyle = '#e2e8f0';
    context.fillRect(chartLeft, y, chartWidth, 58);
    context.fillStyle = bar.color;
    context.fillRect(chartLeft, y, width, 58);
    context.fillStyle = '#0f172a';
    context.font = 'bold 24px Arial';
    context.fillText(`${formatFrNumber(bar.days)} j`, Math.min(chartLeft + width + 14, 875), y + 40);
  });

  return canvas.toDataURL('image/png').split(',')[1];
}

function drawPdfBar(
  document: jsPDF,
  label: string,
  value: number,
  maximum: number,
  y: number,
  color: [number, number, number],
) {
  document.setFontSize(11);
  document.setTextColor(51, 65, 85);
  document.text(label, 20, y + 5);
  document.setFillColor(226, 232, 240);
  document.roundedRect(63, y, 93, 8, 2, 2, 'F');
  document.setFillColor(...color);
  document.roundedRect(63, y, Math.max(1, (value / maximum) * 93), 8, 2, 2, 'F');
  document.setFont('helvetica', 'bold');
  document.text(`${formatFrNumber(value)} j`, 162, y + 5);
  document.setFont('helvetica', 'normal');
}

function buildCsvContent(leaves: LeaveItem[]) {
  const rows = [
    ['Date', 'Type', 'Durée (jours)', 'Demi-journée', 'Libellé'],
    ...leaves.map((leave) => [
      leave.date,
      leave.type,
      String(leave.days),
      leave.halfDay === 'morning' ? 'Matin' : leave.halfDay === 'afternoon' ? 'Après-midi' : '',
      leave.label ?? '',
    ]),
  ];

  return `\uFEFF${rows
    .map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(';'))
    .join('\r\n')}`;
}

function downloadBlob(filename: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function addExportChart(workbook: ExcelJS.Workbook, worksheet: ExcelJS.Worksheet, cpDays: number, rttDays: number) {
  const imageId = workbook.addImage({
    base64: drawLeaveChart(cpDays, rttDays),
    extension: 'png',
  });
  worksheet.addImage(imageId, 'A18:H34');
}

export function ExportCalendarModal({
  isOpen,
  onClose,
  isPro,
  leaves,
  year,
  user,
  onUpgrade,
  quotas,
}: ExportCalendarModalProps) {
  const [copied, setCopied] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const annualLeaves = useMemo(
    () => leaves.filter((leave) => leave.date.startsWith(`${year}-`)).sort((a, b) => a.date.localeCompare(b.date)),
    [leaves, year],
  );

  const summary = useMemo(() => {
    const cpDays = annualLeaves.filter((leave) => leave.type === 'CP').reduce((sum, leave) => sum + (Number(leave.days) || 0), 0);
    const rttDays = annualLeaves.filter((leave) => leave.type === 'RTT').reduce((sum, leave) => sum + (Number(leave.days) || 0), 0);
    const total = annualLeaves.reduce((sum, leave) => sum + (Number(leave.days) || 0), 0);

    return {
      cpDays,
      rttDays,
      total,
      remainingCp: Math.max((quotas?.cp ?? 25) - cpDays, 0),
      remainingRtt: Math.max((quotas?.rtt ?? 10) - rttDays, 0),
    };
  }, [annualLeaves, quotas]);

  const dynamicCalendarUrl = useMemo(() => {
    if (!user?.id) return '';
    const token = buildCalendarToken(user.id);
    const origin = window.location.origin || 'https://joursoff.app';
    return `${origin}/calendar.ics?token=${encodeURIComponent(token)}`;
  }, [user?.id]);

  const handleExportPdf = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      pdf.setFillColor(15, 23, 42);
      pdf.rect(0, 0, 210, 43, 'F');
      pdf.setTextColor(255, 255, 255);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(23);
      pdf.text('CongésZen', 18, 19);
      pdf.setFontSize(15);
      pdf.text(`Bilan annuel des congés ${year}`, 18, 31);
      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(9);
      pdf.text(`Genere le ${new Date().toLocaleDateString('fr-FR')}`, 158, 19);

      const stats = [
        { label: 'CONGÉS POSÉS', value: `${formatFrNumber(summary.total)} j`, color: [15, 23, 42] as [number, number, number] },
        { label: 'CONGÉS PAYÉS', value: `${formatFrNumber(summary.cpDays)} j`, color: [16, 185, 129] as [number, number, number] },
        { label: 'RTT', value: `${formatFrNumber(summary.rttDays)} j`, color: [99, 102, 241] as [number, number, number] },
      ];
      stats.forEach((stat, index) => {
        const x = 18 + index * 59;
        pdf.setFillColor(248, 250, 252);
        pdf.roundedRect(x, 53, 53, 25, 3, 3, 'F');
        pdf.setTextColor(100, 116, 139);
        pdf.setFontSize(7);
        pdf.setFont('helvetica', 'bold');
        pdf.text(stat.label, x + 4, 61);
        pdf.setTextColor(...stat.color);
        pdf.setFontSize(15);
        pdf.text(stat.value, x + 4, 72);
      });

      pdf.setTextColor(15, 23, 42);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.text('Répartition des congés', 18, 96);
      const maxDays = Math.max(summary.cpDays, summary.rttDays, 1);
      drawPdfBar(pdf, 'Congés payés', summary.cpDays, maxDays, 104, [16, 185, 129]);
      drawPdfBar(pdf, 'RTT', summary.rttDays, maxDays, 121, [99, 102, 241]);

      pdf.setTextColor(15, 23, 42);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(13);
      pdf.text('Détail des jours posés', 18, 146);
      pdf.setFillColor(238, 242, 255);
      pdf.roundedRect(18, 151, 174, 9, 2, 2, 'F');
      pdf.setFontSize(8);
      pdf.setTextColor(49, 46, 129);
      pdf.text('DATE', 22, 157);
      pdf.text('TYPE / DUREE', 75, 157);
      pdf.text('LIBELLE', 126, 157);

      let y = 167;
      annualLeaves.forEach((leave, index) => {
        if (y > 278) {
          pdf.addPage();
          y = 22;
          pdf.setFillColor(238, 242, 255);
          pdf.roundedRect(18, 13, 174, 9, 2, 2, 'F');
          pdf.setFont('helvetica', 'bold');
          pdf.setFontSize(8);
          pdf.setTextColor(49, 46, 129);
          pdf.text('DATE', 22, 19);
          pdf.text('TYPE / DUREE', 75, 19);
          pdf.text('LIBELLE', 126, 19);
          y = 29;
        }

        if (index % 2 === 0) {
          pdf.setFillColor(248, 250, 252);
          pdf.rect(18, y - 5, 174, 11, 'F');
        }
        pdf.setFont('helvetica', 'normal');
        pdf.setFontSize(8);
        pdf.setTextColor(51, 65, 85);
        pdf.text(formatDateFr(leave.date), 22, y + 1);
        pdf.setTextColor(leave.type === 'CP' ? 4 : 67, leave.type === 'CP' ? 120 : 56, leave.type === 'CP' ? 87 : 202);
        pdf.setFont('helvetica', 'bold');
        const leaveType = leave.type === 'CP' ? 'CP' : 'RTT';
        const halfDay = leave.halfDay === 'morning' ? ' - Matin' : leave.halfDay === 'afternoon' ? ' - Après-midi' : '';
        pdf.text(`${leaveType} - ${formatFrNumber(Number(leave.days) || 0)} j${halfDay}`, 75, y + 1);
        pdf.setFont('helvetica', 'normal');
        pdf.setTextColor(71, 85, 105);
        const label = leave.label?.trim() || '-';
        pdf.text(pdf.splitTextToSize(label, 62)[0] ?? '-', 126, y + 1);
        y += 11;
      });

      pdf.setFont('helvetica', 'normal');
      pdf.setFontSize(8);
      pdf.setTextColor(148, 163, 184);
      pdf.text(`CongésZen - ${year}`, 18, 289);
      pdf.save(`congeszen-bilan-${year}.pdf`);
    } catch (error) {
      setExportError(error instanceof Error ? `Export PDF impossible : ${error.message}` : 'Export PDF impossible.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportExcel = async () => {
    setExportError(null);
    setExporting(true);
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'CongésZen';
      workbook.created = new Date();
      workbook.modified = new Date();

      const summarySheet = workbook.addWorksheet('Bilan', {
        views: [{ state: 'frozen', ySplit: 3 }],
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
      });
      summarySheet.columns = [
        { width: 24 }, { width: 16 }, { width: 4 },
        { width: 18 }, { width: 14 }, { width: 14 }, { width: 14 }, { width: 14 },
      ];
      summarySheet.mergeCells('A1:H1');
      summarySheet.getCell('A1').value = `CongésZen - Bilan annuel ${year}`;
      summarySheet.getCell('A1').font = { name: 'Aptos Display', size: 20, bold: true, color: { argb: 'FFFFFFFF' } };
      summarySheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      summarySheet.getRow(1).height = 38;
      summarySheet.mergeCells('A2:H2');
      summarySheet.getCell('A2').value = `Export du ${new Date().toLocaleDateString('fr-FR')} - Synthese annuelle et detail complet`;
      summarySheet.getCell('A2').font = { size: 10, italic: true, color: { argb: 'FF64748B' } };

      summarySheet.getCell('A4').value = 'Indicateur';
      summarySheet.getCell('B4').value = 'Jours';
      summarySheet.getCell('D4').value = 'Mois';
      summarySheet.getCell('E4').value = 'Conges payes';
      summarySheet.getCell('F4').value = 'RTT';
      summarySheet.getCell('G4').value = 'Total';
      for (const cellAddress of ['A4', 'B4', 'D4', 'E4', 'F4', 'G4']) {
        const cell = summarySheet.getCell(cellAddress);
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      }
      summarySheet.getRow(4).height = 24;

      const metrics: [string, number, string][] = [
        ['Congés posés', summary.total, 'FF0F172A'],
        ['Congés payés', summary.cpDays, 'FF059669'],
        ['RTT', summary.rttDays, 'FF4F46E5'],
        ['Solde CP estimé', summary.remainingCp, 'FF047857'],
        ['Solde RTT estimé', summary.remainingRtt, 'FF4338CA'],
      ];
      metrics.forEach(([label, value, color], index) => {
        const row = index + 5;
        const nameCell = summarySheet.getCell(`A${row}`);
        const valueCell = summarySheet.getCell(`B${row}`);
        nameCell.value = label;
        nameCell.font = { bold: true, color: { argb: color } };
        nameCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
        valueCell.value = value;
        valueCell.numFmt = '0.## "j"';
        valueCell.font = { bold: true, color: { argb: color }, size: 12 };
        valueCell.alignment = { horizontal: 'center' };
        valueCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
      });

      const months = Array.from({ length: 12 }, (_, monthIndex) => {
        const month = String(monthIndex + 1).padStart(2, '0');
        const monthLeaves = annualLeaves.filter((leave) => leave.date.slice(5, 7) === month);
        const cp = monthLeaves.filter((leave) => leave.type === 'CP').reduce((sum, leave) => sum + (Number(leave.days) || 0), 0);
        const rtt = monthLeaves.filter((leave) => leave.type === 'RTT').reduce((sum, leave) => sum + (Number(leave.days) || 0), 0);
        return { label: new Date(year, monthIndex, 1).toLocaleDateString('fr-FR', { month: 'long' }), cp, rtt };
      });
      months.forEach((month, index) => {
        const row = index + 5;
        summarySheet.getCell(`D${row}`).value = month.label;
        summarySheet.getCell(`E${row}`).value = month.cp;
        summarySheet.getCell(`F${row}`).value = month.rtt;
        summarySheet.getCell(`G${row}`).value = month.cp + month.rtt;
        if (index % 2 === 1) {
          for (const column of ['D', 'E', 'F', 'G']) {
            summarySheet.getCell(`${column}${row}`).fill = {
              type: 'pattern',
              pattern: 'solid',
              fgColor: { argb: 'FFF8FAFC' },
            };
          }
        }
      });
      addExportChart(workbook, summarySheet, summary.cpDays, summary.rttDays);

      const detailSheet = workbook.addWorksheet('Detail des conges', {
        views: [{ state: 'frozen', ySplit: 4 }],
        pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
      });
      detailSheet.mergeCells('A1:E1');
      detailSheet.getCell('A1').value = 'Historique complet des conges';
      detailSheet.getCell('A1').font = { size: 18, bold: true, color: { argb: 'FFFFFFFF' } };
      detailSheet.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F172A' } };
      detailSheet.getRow(1).height = 34;
      detailSheet.mergeCells('A2:E2');
      detailSheet.getCell('A2').value = 'Toutes les dates enregistrées, tous exercices confondus';
      detailSheet.getCell('A2').font = { italic: true, color: { argb: 'FF64748B' } };
      detailSheet.columns = [
        { key: 'date', width: 23 },
        { key: 'type', width: 18 },
        { key: 'days', width: 18 },
        { key: 'halfDay', width: 20 },
        { key: 'label', width: 48 },
      ];
      const header = detailSheet.getRow(4);
      header.values = ['Date', 'Type', 'Duree (jours)', 'Demi-journee', 'Libelle'];
      header.height = 26;
      header.eachCell((cell) => {
        cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF334155' } };
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      });
      detailSheet.autoFilter = 'A4:E4';
      leaves
        .slice()
        .sort((a, b) => a.date.localeCompare(b.date))
        .forEach((leave, index) => {
          const row = detailSheet.addRow({
            date: (() => {
              const [dateYear, month, day] = leave.date.split('-').map(Number);
              return new Date(dateYear, month - 1, day);
            })(),
            type: leave.type === 'CP' ? 'Congé payé' : 'RTT',
            days: Number(leave.days) || 0,
            halfDay: leave.halfDay === 'morning' ? 'Matin' : leave.halfDay === 'afternoon' ? 'Après-midi' : '',
            label: leave.label ?? '',
          });
          row.getCell(1).numFmt = 'dd mmmm yyyy';
          row.getCell(3).numFmt = '0.## "j"';
          row.getCell(2).font = {
            bold: true,
            color: { argb: leave.type === 'CP' ? 'FF047857' : 'FF4338CA' },
          };
          if (index % 2 === 1) {
            row.eachCell((cell) => {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
            });
          }
          row.alignment = { vertical: 'middle' };
        });

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `congeszen-conges-${year}.xlsx`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) {
      setExportError(error instanceof Error ? `Export Excel impossible : ${error.message}` : 'Export Excel impossible.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportIcs = () => {
    downloadBlob('congeszen-conges.ics', buildIcsContent(leaves), 'text/calendar;charset=utf-8');
  };

  const handleExportCsv = () => {
    downloadBlob('congeszen-conges.csv', buildCsvContent(leaves), 'text/csv;charset=utf-8');
  };

  const handleCopyDynamicLink = async () => {
    if (!dynamicCalendarUrl) return;
    try {
      await navigator.clipboard.writeText(dynamicCalendarUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      const input = document.createElement('input');
      input.value = dynamicCalendarUrl;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm">
      <div className="w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-2xl shadow-slate-900/15">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-emerald-700">Exports & sync</p>
            <h2 className="text-xl font-black text-slate-900">Exporter / Synchroniser mes congés</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl bg-white text-slate-500 transition hover:bg-slate-100"
            aria-label="Fermer la modale"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

          <div className="space-y-5 p-5">
          {!isPro ? (
            <>
              <div className="grid gap-3 md:grid-cols-2">
                <button
                  type="button"
                  onClick={handleExportPdf}
                  disabled={exporting}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-emerald-200 hover:bg-emerald-50"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">{exporting ? 'Création du PDF…' : 'Export PDF'}</p>
                  <p className="text-xs text-slate-500">Bilan visuel {year}, avec graphique</p>
                  </div>
                  <Download className="h-5 w-5 text-emerald-600" />
                </button>

                <button
                  type="button"
                  onClick={handleExportIcs}
                  className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-sky-200 hover:bg-sky-50"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-900">Export iCal</p>
                    <p className="text-xs text-slate-500">Fichier .ics</p>
                  </div>
                  <CalendarRange className="h-5 w-5 text-sky-600" />
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-white/60 p-4">
                  <div className="blur-[2px] select-none pointer-events-none">
                    <p className="text-sm font-bold text-slate-700">Flux dynamique Google Calendar / Outlook</p>
                    <div className="mt-3 space-y-2">
                      <div className="h-10 rounded-xl bg-slate-100" />
                      <div className="h-10 rounded-xl bg-slate-100" />
                    </div>
                  </div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (onUpgrade) void onUpgrade();
                      }}
                      className="inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-amber-600"
                    >
                      <Lock className="h-4 w-4" />
                      Débloquer la synchronisation automatique en Mode Pro
                    </button>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="flex items-center gap-3">
                  <div className="rounded-xl bg-emerald-600 p-2 text-white">
                    <ShieldCheck className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-emerald-900">Mode Pro activé</p>
                    <p className="text-xs text-emerald-700">Synchronisation dynamique et exports avancés disponibles</p>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-2 text-sm font-bold text-slate-800">Lien d’abonnement iCal</p>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={dynamicCalendarUrl || 'Connectez-vous pour générer le lien.'}
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-700 outline-none"
                    />
                    <button
                      type="button"
                      onClick={handleCopyDynamicLink}
                      disabled={!dynamicCalendarUrl}
                      className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-3 py-2 text-xs font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                      {copied ? 'Copié' : 'Copier'}
                    </button>
                  </div>
                  {dynamicCalendarUrl && (
                    <a
                      href={dynamicCalendarUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-flex text-xs font-semibold text-indigo-700 hover:text-indigo-800"
                    >
                      Ouvrir le flux dans Google Calendar / Outlook
                    </a>
                  )}
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => void handleExportExcel()}
                    disabled={exporting}
                    className="flex items-center justify-between rounded-2xl border border-indigo-200 bg-indigo-50 p-4 text-left transition hover:bg-indigo-100 disabled:cursor-wait disabled:opacity-60"
                  >
                    <div>
                      <p className="text-sm font-bold text-indigo-950">{exporting ? 'Création du fichier…' : 'Exporter en Excel'}</p>
                      <p className="text-xs text-indigo-700">Classeur .xlsx mis en forme</p>
                    </div>
                    <FileSpreadsheet className="h-5 w-5 text-indigo-600" />
                  </button>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    className="flex items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-slate-300 hover:bg-slate-100"
                  >
                    <div>
                      <p className="text-sm font-bold text-slate-900">Exporter en CSV</p>
                      <p className="text-xs text-slate-500">Compatible avec les tableurs</p>
                    </div>
                    <Download className="h-5 w-5 text-slate-500" />
                  </button>
                </div>
              </div>
            </>
          )}

          {exportError && (
            <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {exportError}
            </p>
          )}

          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-slate-800">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-slate-500">Bilan annuel {year}</p>
                <h3 className="text-lg font-black text-slate-900">Congés enregistrés</h3>
              </div>
              <FileText className="h-5 w-5 text-slate-500" />
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Total</p>
                <p className="mt-1 text-lg font-black">{formatFrNumber(summary.total)}</p>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">CP</p>
                <p className="mt-1 text-lg font-black">{formatFrNumber(summary.cpDays)}</p>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">RTT</p>
                <p className="mt-1 text-lg font-black">{formatFrNumber(summary.rttDays)}</p>
              </div>
              <div className="rounded-xl bg-white p-3 shadow-sm">
                <p className="text-[11px] uppercase tracking-wider text-slate-500">Solde</p>
                <p className="mt-1 text-lg font-black">{formatFrNumber(summary.remainingCp + summary.remainingRtt)}</p>
              </div>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm">
                <span>Solde CP</span>
                <strong>{formatFrNumber(summary.remainingCp)} j</strong>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-white px-3 py-2 text-sm">
                <span>Solde RTT</span>
                <strong>{formatFrNumber(summary.remainingRtt)} j</strong>
              </div>
              {annualLeaves.length > 0 ? (
                <ul className="mt-3 space-y-2 text-xs text-slate-500">
                  {annualLeaves.slice(0, 6).map((leave) => (
                    <li key={leave.id} className="flex items-center justify-between rounded-xl bg-white px-3 py-2">
                      <span>{leave.date}</span>
                      <span className="font-bold text-slate-700">
                        {leave.type} · {formatFrNumber(Number(leave.days) || 0)}j
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-xs text-slate-500">Aucun congé enregistré pour {year}.</p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
