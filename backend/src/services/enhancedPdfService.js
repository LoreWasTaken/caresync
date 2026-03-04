const PDFDocument = require('pdfkit');
const QRCode = require('qrcode');
const crypto = require('crypto');
const { DocumentMetadata } = require('../models');

// ──────────────────────────────────────────────────────────────
//  Bullet-proof PDF Service — simple top-to-bottom layout.
//  No manual Y coordinates near page bottom, no pageAdded hooks,
//  no switchToPage post-processing.  PDFKit handles all page
//  breaks naturally through its flowing text engine.
// ──────────────────────────────────────────────────────────────

const COLORS = {
  PRIMARY: '#1565C0',
  PRIMARY_LIGHT: '#E3F2FD',
  SUCCESS: '#2E7D32',
  WARNING: '#F57C00',
  DANGER: '#C62828',
  TEXT: '#212121',
  MUTED: '#757575',
  BORDER: '#E0E0E0',
  BG: '#FAFAFA',
  WHITE: '#FFFFFF',
};

const FONT = { H: 'Helvetica-Bold', B: 'Helvetica' };
const M = 50; // margin

class EnhancedPdfService {

  async generateEnhancedReport(userData, adherenceData, startDate, endDate, options = {}) {
    const { includeCharts = false, signatureRequired = false } = options;

    return new Promise((resolve, reject) => {
      try {
        // ── Create document — NO bufferPages, NO autoFirstPage:false ──
        const doc = new PDFDocument({
          size: 'A4',
          margins: { top: M, bottom: M, left: M, right: M },
          info: {
            Title: 'CareSync Patient Report',
            Author: 'CareSync Healthcare Platform',
            Subject: `Adherence Report ${startDate} — ${endDate}`,
          },
        });

        const documentId = crypto.randomUUID();
        const now = new Date();

        const buffers = [];
        doc.on('data', (chunk) => buffers.push(chunk));

        doc.on('end', async () => {
          const pdfData = Buffer.concat(buffers);
          try {
            const expirationDate = new Date();
            expirationDate.setFullYear(expirationDate.getFullYear() + 1);
            await DocumentMetadata.create({
              documentId,
              userId: userData.id,
              documentType: 'ADHERENCE_REPORT',
              documentHash: crypto.createHash('sha256').update(pdfData).digest('hex'),
              fileName: `CareSync_Adherence_Report_${startDate}_to_${endDate}.pdf`,
              fileSize: pdfData.length,
              generationTimestamp: now,
              expirationDate,
              passwordProtected: false,
              signatureRequired: !!signatureRequired,
              includeCharts: !!includeCharts,
              metadata: { userId: userData.id, reportPeriod: { startDate, endDate }, adherenceRate: adherenceData.rate },
            });
          } catch (err) {
            console.error('Failed to save document metadata:', err);
          }
          resolve(pdfData);
        });

        // ── Build the document top-to-bottom ──
        (async () => {
          try {
            await this._buildDocument(doc, userData, adherenceData, startDate, endDate, includeCharts, documentId, now);
            doc.end();
          } catch (err) {
            reject(err);
          }
        })();

      } catch (error) {
        reject(error);
      }
    });
  }

  // ─────────────────────────────────────────────────────────
  //  Main document builder — purely sequential, top-to-bottom
  // ─────────────────────────────────────────────────────────
  async _buildDocument(doc, userData, adherenceData, startDate, endDate, includeCharts, documentId, timestamp) {
    const pageW = doc.page.width;
    const contentW = pageW - M * 2;

    // ── Accent bar ──
    doc.rect(0, 0, pageW, 4).fill(COLORS.PRIMARY);

    // ── QR Code (top-right) ──
    try {
      const qrUrl = `${process.env.BASE_URL || 'https://caresync.com'}/api/verify?docId=${documentId}`;
      const qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 80, margin: 0 });
      const qrBuf = Buffer.from(qrDataUrl.split(',')[1], 'base64');
      doc.image(qrBuf, pageW - M - 55, M, { width: 55 });
    } catch { /* QR is optional — continue without it */ }

    // ── Header ──
    doc.font(FONT.H).fontSize(22).fillColor(COLORS.PRIMARY)
      .text('CareSync', M, M, { lineBreak: false });
    doc.font(FONT.B).fontSize(9).fillColor(COLORS.MUTED)
      .text('Healthcare Adherence Platform', M, M + 26, { lineBreak: false });
    doc.text(`Generated: ${timestamp.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })}`, M, M + 38, { lineBreak: false });

    doc.moveTo(M, M + 55).lineTo(pageW - M, M + 55).strokeColor(COLORS.BORDER).lineWidth(1).stroke();

    // ── Title ──
    doc.font(FONT.H).fontSize(18).fillColor(COLORS.TEXT)
      .text('Patient Medication Adherence Report', M, M + 70, { lineBreak: false });
    doc.font(FONT.B).fontSize(10).fillColor(COLORS.MUTED)
      .text('Comprehensive Analysis & Clinical Summary', M, M + 92, { lineBreak: false });

    // Move the flowing cursor below all the absolute-positioned header content
    doc.y = M + 115;
    doc.x = M;

    // ── Patient Info ──
    this._sectionHeading(doc, 'Patient Information');
    doc.font(FONT.B).fontSize(10).fillColor(COLORS.TEXT);
    doc.text(`Name:   ${userData.firstName || ''} ${userData.lastName || ''}`, { continued: false });
    doc.text(`Email:  ${userData.email || 'N/A'}`, { continued: false });
    doc.moveDown(0.8);

    // ── Key Metrics ──
    this._sectionHeading(doc, 'Clinical Summary');
    const taken = (adherenceData.total || 0) - (adherenceData.missed || 0);
    const metrics = [
      ['Adherence Rate', String(adherenceData.rate ?? 'N/A')],
      ['Total Scheduled Doses', String(adherenceData.total ?? 0)],
      ['Doses Taken', String(taken)],
      ['Doses Missed', String(adherenceData.missed ?? 0)],
      ['Report Period', `${startDate}  to  ${endDate}`],
    ];
    this._drawTable(doc, contentW, [], metrics);
    doc.moveDown(0.5);

    // ── Adherence Bar ──
    if (includeCharts) {
      this._sectionHeading(doc, 'Adherence Visualization');
      const rate = parseInt(adherenceData.rate) || 0;
      const barX = doc.x;
      const barY = doc.y;
      const barW = contentW - 60;
      const barH = 20;
      // Background
      doc.rect(barX, barY, barW, barH).fill(COLORS.BG);
      doc.rect(barX, barY, barW, barH).strokeColor(COLORS.BORDER).lineWidth(0.5).stroke();
      // Fill
      const fillW = Math.max(0, (rate / 100) * barW);
      if (fillW > 0) {
        doc.rect(barX, barY, fillW, barH).fill(this._rateColor(rate));
      }
      // Label
      doc.font(FONT.H).fontSize(10).fillColor(COLORS.TEXT)
        .text(`${rate}%`, barX + barW + 8, barY + 4, { lineBreak: false });

      doc.y = barY + barH + 12;
      doc.x = M;
      doc.moveDown(0.3);
    }

    // ── Medication History Table ──
    const history = Array.isArray(adherenceData.history) ? adherenceData.history : [];
    if (history.length > 0) {
      this._sectionHeading(doc, 'Medication History');

      const headers = ['Date & Time', 'Medication', 'Status', 'Notes'];
      const rows = history.map((r) => {
        const dateStr = r.takenAt
          ? new Date(r.takenAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
          : 'N/A';
        return [
          dateStr,
          r.Medication?.name || r.medicationName || 'N/A',
          (r.status || '').toUpperCase(),
          r.notes || '-',
        ];
      });

      this._drawTable(doc, contentW, headers, rows);
      doc.moveDown(0.8);
    }

    // ── Footer (simple, at end — NOT on every page) ──
    doc.moveDown(1);
    doc.moveTo(M, doc.y).lineTo(pageW - M, doc.y).strokeColor(COLORS.BORDER).lineWidth(0.5).stroke();
    doc.moveDown(0.4);
    doc.font(FONT.B).fontSize(7).fillColor(COLORS.MUTED);
    doc.text('CONFIDENTIAL MEDICAL DOCUMENT');
    doc.text(`Document ID: ${documentId}`);
    doc.text('This document contains protected health information. Unauthorized access or distribution is prohibited.');
    doc.text('support@caresync.com  |  +1 (555) 123-4567');
  }

  // ─────────────────────────────────────────────────────
  //  Helpers
  // ─────────────────────────────────────────────────────

  /** Draw a blue section heading with a small left accent bar. */
  _sectionHeading(doc, title) {
    const y = doc.y;
    doc.rect(M, y, 3, 16).fill(COLORS.PRIMARY);
    doc.font(FONT.H).fontSize(13).fillColor(COLORS.PRIMARY)
      .text(title, M + 10, y + 1, { lineBreak: false });
    doc.y = y + 22;
    doc.x = M;
  }

  /**
   * Simple flowing table using doc.text().
   * PDFKit handles page breaks automatically.
   */
  _drawTable(doc, contentW, headers, rows) {
    const cols = headers.length || (rows[0] ? rows[0].length : 1);
    const colW = Math.floor(contentW / cols);

    // Header row
    if (headers.length > 0) {
      const hY = doc.y;
      doc.rect(M, hY, contentW, 20).fill(COLORS.PRIMARY);
      headers.forEach((h, i) => {
        doc.font(FONT.H).fontSize(8).fillColor(COLORS.WHITE)
          .text(h, M + i * colW + 6, hY + 6, { width: colW - 12, lineBreak: false });
      });
      doc.y = hY + 20;
    }

    // Data rows
    rows.forEach((row, ri) => {
      const rowY = doc.y;

      // Alternate background
      if (ri % 2 === 0) {
        doc.rect(M, rowY, contentW, 18).fill(COLORS.BG);
      }

      row.forEach((cell, ci) => {
        const color = (headers.length > 0 && headers[ci] === 'Status')
          ? (String(cell).includes('TAKEN') ? COLORS.SUCCESS : String(cell).includes('MISS') ? COLORS.DANGER : COLORS.TEXT)
          : COLORS.TEXT;
        doc.font(FONT.B).fontSize(8).fillColor(color)
          .text(String(cell ?? ''), M + ci * colW + 6, rowY + 5, { width: colW - 12, lineBreak: false });
      });

      doc.y = rowY + 18;
    });
  }

  _rateColor(rate) {
    if (rate >= 90) return COLORS.SUCCESS;
    if (rate >= 70) return COLORS.WARNING;
    return COLORS.DANGER;
  }
}

module.exports = new EnhancedPdfService();
