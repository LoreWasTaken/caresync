/**
 * prescriptionParser.js
 *
 * CJS adaptation of the SNS Prescription Parser.
 * Uses pdf-parse (already in deps) for text extraction,
 * then applies the deterministic regex Fast Path from the
 * original sns-parser-main vocabulary system.
 *
 * AI fallback (Ollama/Qwen) is attempted when the fast path
 * returns no results, but gracefully degrades if Ollama isn't running.
 */
const pdfParse = require('pdf-parse');
const logger = require('../utils/logger');

// ============================================================================
// VOCABULARY (ported from sns-parser-main/vocabulary.js)
// ============================================================================

const VOCABULARY = {
  forms: [
    { match: /comp\.|comprimid[oa]s?|cp\b|cps\b/i, standard: 'Comprimido' },
    { match: /caps\.|cápsulas?|cap\b/i, standard: 'Cápsula' },
    { match: /saquetas?|saq\.|granulado/i, standard: 'Saqueta (Granulado)' },
    { match: /orodispers[íi]vel/i, standard: 'Comprimido Orodispersível' },
    { match: /revestid[oa]/i, standard: 'Comprimido Revestido' },
    { match: /efervescente/i, standard: 'Comprimido Efervescente' },
    { match: /sublingual/i, standard: 'Comprimido Sublingual' },
    { match: /pastilhas?/i, standard: 'Pastilha' },
    { match: /drageias?/i, standard: 'Drageia' },
    { match: /xarope|xar\./i, standard: 'Xarope' },
    { match: /suspensão|susp\.|oral/i, standard: 'Suspensão Oral' },
    { match: /solução|sol\./i, standard: 'Solução Oral' },
    { match: /gotas?|gt\b/i, standard: 'Gotas' },
    { match: /ampolas?|amp\./i, standard: 'Ampola (Oral/Injetável)' },
    { match: /unidose/i, standard: 'Unidose' },
    { match: /pomada|pom\./i, standard: 'Pomada' },
    { match: /creme/i, standard: 'Creme' },
    { match: /gel\b/i, standard: 'Gel' },
    { match: /loção/i, standard: 'Loção' },
    { match: /penso/i, standard: 'Penso Transdérmico' },
    { match: /spray/i, standard: 'Spray' },
    { match: /inj\.|injetável|seringa/i, standard: 'Solução Injetável' },
    { match: /caneta/i, standard: 'Caneta Pré-cheia' },
    { match: /ovulo|óvulo/i, standard: 'Óvulo' },
    { match: /suposit|sup\./i, standard: 'Supositório' },
    { match: /inalador|pó para inalação/i, standard: 'Inalador' },
    { match: /colírio/i, standard: 'Colírio' },
    { match: /nasal/i, standard: 'Spray Nasal' },
    { match: /blister/i, standard: 'Blister (unidade)' },
  ],

  frequencies: [
    { match: /pa[- ]?jantar|ao jantar|jantar/i, standard: 'Ao Jantar' },
    { match: /pq[- ]?almoço|pequeno[- ]?almoço|pa\b|matina/i, standard: 'Ao Pequeno-Almoço' },
    { match: /ao almoço|almoço/i, standard: 'Ao Almoço' },
    { match: /ao deitar|à noite|noite/i, standard: 'Ao Deitar' },
    { match: /ref\.|refeições|comida/i, standard: 'Às Refeições' },
    { match: /jejum/i, standard: 'Em Jejum' },
    { match: /diári[oa]|1x\/d|1 id/i, standard: 'Diário (1x/dia)' },
    { match: /semanal/i, standard: 'Semanal' },
    { match: /mensal/i, standard: 'Mensal' },
    { match: /sos|necessidade|dor|febre/i, standard: 'SOS (Se necessário)' },
    { match: /noite sim, noite não/i, standard: 'Noite sim, noite não' },
  ],

  patterns: {
    dosage: /\b\d+([.,]\d+)?\s*(mg|g|ml|mcg|ui|u\/ml)(\s*\+\s*\d+([.,]\d+)?\s*(mg|g|ml|mcg|ui|u\/ml))*/i,
    qty_column: /Quant\.?\s*(\d+)/i,
    duration: /durante\s+(\d+)\s*(dias?|mes(?:es)?|semanas?)/i,
  },

  noise: [
    /blister/gi, /frasco/gi, /embalagem/gi, /bisnaga/gi,
    /recipiente/gi, /saqueta/gi, /unidade\(s\)/gi, /unid\b/gi,
    /dose\(s\)/gi, /cx\.?/gi, /caixa/gi, /\d+\s*un\b/gi,
    /genérico/gi, /mgp/gi, /lab\./gi,
    /\b\d+\s*(mg|g|ml|mcg|ui)\b/gi,
    /\b\d+[,.]\d+\s*(mg|g|ml)\b/gi,
    /[®™]/g,
  ],
};

// ============================================================================
// VOCABULARY HELPERS
// ============================================================================

function normalizeTerm(rawTerm, list) {
  if (!rawTerm) return null;
  const found = list.find((entry) => entry.match.test(rawTerm));
  return found ? found.standard : null;
}

function cleanDrugName(name) {
  if (!name) return 'Desconhecido';
  let clean = name;
  VOCABULARY.noise.forEach((regex) => {
    clean = clean.replace(regex, '');
  });
  return clean.replace(/^\+|\+$/g, '').replace(/\s+/g, ' ').trim();
}

function normalizeFrequency(rawFreq) {
  if (!rawFreq) return 'Ver Notas';
  const clean = rawFreq.trim();

  const staticMatch = VOCABULARY.frequencies.find((f) => f.match.test(clean));
  if (staticMatch) return staticMatch.standard;

  const hourlyMatch = clean.match(/(\d+)\s*[/e]\s*(\d+)\s*h?/i);
  if (hourlyMatch) {
    const interval = parseInt(hourlyMatch[1], 10);
    if (interval > 0) {
      const timesPerDay = Math.round(24 / interval);
      if (interval === 24) return 'Diário (1x/dia)';
      if (interval === 12) return '12 em 12 horas (2x/dia)';
      if (interval === 8) return '8 em 8 horas (3x/dia)';
      if (interval === 6) return '6 em 6 horas (4x/dia)';
      if (interval === 4) return '4 em 4 horas (6x/dia)';
      return `${interval} em ${interval} horas (${timesPerDay}x/dia)`;
    }
  }

  const timesMatch = clean.match(/(\d+)\s*(x|vezes)\s*(?:ao|por)?\s*dia/i);
  if (timesMatch) return `${timesMatch[1]} vezes ao dia`;

  return clean;
}

// ============================================================================
// FAST PATH (DETERMINISTIC REGEX PARSER)
// ============================================================================

function attemptFastParse(text) {
  const candidates = [];
  const lines = text.split(/\n/).map((l) => l.trim()).filter((l) => l.length > 5);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const detectedForm = normalizeTerm(line, VOCABULARY.forms);
    const dosageMatch = line.match(VOCABULARY.patterns.dosage);
    const detectedDosage = dosageMatch ? dosageMatch[0] : null;

    const contextBlock = [line, lines[i + 1] || '', lines[i + 2] || ''].join(' ');
    const detectedFreq = normalizeFrequency(contextBlock);
    const hasValidFreq = detectedFreq !== 'Ver Notas' && detectedFreq !== contextBlock.trim();

    const isSentence = /\b(custa|opte|fale|consulte|deixe|contacte)\b/i.test(line);

    let confidence = 0;
    if (detectedForm && !isSentence) confidence += 2;
    if (detectedDosage && !isSentence) confidence += 2;
    if (hasValidFreq && !isSentence) confidence += 1;

    if (confidence >= 2 && !isSentence) {
      let rawName = line.split(/,|\d+\s*(mg|g|ml)| - /)[0].trim();
      rawName = rawName.replace(/^\d+\s+/, '').replace(/^[-–]\s*/, '');

      const nameIsForm = normalizeTerm(rawName, VOCABULARY.forms) !== null;
      const nameIsUnit = /^unidade|blister|frasco/i.test(rawName);

      if ((nameIsForm || nameIsUnit || rawName.length < 3) && i > 0) {
        const prevLine = lines[i - 1].trim();
        if (!/\b(custa|opte|fale)\b/i.test(prevLine) && prevLine.length > 3) {
          rawName = prevLine;
        } else {
          continue;
        }
      }

      if (rawName.length < 3 || normalizeTerm(rawName, VOCABULARY.forms)) continue;

      const qtyMatch = contextBlock.match(/Quant\.?\s*(\d+)/i) || line.match(/\s+(\d+)$/);
      const quantity = qtyMatch ? parseInt(qtyMatch[1]) : 1;
      const durMatch = contextBlock.match(/durante\s+(\d+\s*(?:dias|meses))/i);
      const duration = durMatch ? durMatch[1] : '-';

      candidates.push({
        drug_name: rawName,
        dosage: detectedDosage,
        form: detectedForm || 'N/A',
        frequency: detectedFreq,
        duration,
        quantity,
        confidence,
      });

      if (nameIsForm) i++;
    }
  }

  return candidates;
}

// ============================================================================
// AI FALLBACK (Ollama — graceful degradation if not available)
// ============================================================================

async function extractWithOllama(rawText) {
  const schema = {
    type: 'object',
    properties: {
      medications: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            drug_name: { type: 'string' },
            dosage: { type: 'string' },
            form: { type: 'string' },
            quantity: { type: 'integer' },
            frequency: { type: 'string' },
            duration: { type: 'string' },
          },
          required: ['drug_name', 'quantity'],
        },
      },
    },
    required: ['medications'],
  };

  const prompt = `Extract Portuguese prescription data into JSON.
RULES:
1. Split Name, Dosage, Form.
2. Extract Frequency (pa-jantar, 8/8h).
3. Extract Quantity.

TEXT:
${rawText}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'qwen2.5:3b',
        prompt,
        stream: false,
        format: schema,
        temperature: 0.1,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const data = await response.json();
    if (!data.response) return [];

    const jsonStr = data.response.substring(
      data.response.indexOf('{'),
      data.response.lastIndexOf('}') + 1
    );
    const parsed = JSON.parse(jsonStr);
    return parsed.medications || [];
  } catch (e) {
    logger.warn('Ollama AI extraction unavailable: %s', e.message);
    return [];
  }
}

// ============================================================================
// FREQUENCY → CARESYNC MAPPING
// ============================================================================

/**
 * Maps Portuguese frequency strings to CareSync's English frequency values
 * and derives timesPerDay.
 */
function mapFrequencyToCareSync(ptFreq) {
  if (!ptFreq || ptFreq === 'Ver Notas' || ptFreq === '-') {
    return { frequency: 'Once daily', timesPerDay: 1 };
  }

  const f = ptFreq.toLowerCase();

  if (/sos|necessário|necessidade/i.test(f)) return { frequency: 'As needed', timesPerDay: 1 };
  if (/semanal/i.test(f)) return { frequency: 'Weekly', timesPerDay: 1 };
  if (/6x\/dia|4\s*em\s*4\s*h/i.test(f)) return { frequency: 'Every 4 hours', timesPerDay: 6 };
  if (/4x\/dia|6\s*em\s*6\s*h/i.test(f)) return { frequency: 'Every 6 hours', timesPerDay: 4 };
  if (/3x\/dia|8\s*em\s*8\s*h/i.test(f)) return { frequency: 'Every 8 hours', timesPerDay: 3 };
  if (/2x\/dia|12\s*em\s*12\s*h/i.test(f)) return { frequency: 'Twice daily', timesPerDay: 2 };
  if (/3\s*vezes/i.test(f)) return { frequency: '3 times daily', timesPerDay: 3 };
  if (/2\s*vezes/i.test(f)) return { frequency: 'Twice daily', timesPerDay: 2 };

  return { frequency: 'Once daily', timesPerDay: 1 };
}

/**
 * Extracts the numeric dosage and unit from a Portuguese dose string.
 * e.g. "500 mg" → { dosage: '500', dosageUnit: 'mg' }
 */
function parseDoseString(doseStr) {
  if (!doseStr || doseStr === 'N/A') return { dosage: '', dosageUnit: 'mg' };

  const match = doseStr.match(/(\d+(?:[.,]\d+)?)\s*(mg|g|ml|mcg|ui|u\/ml)/i);
  if (match) {
    return {
      dosage: match[1].replace(',', '.'),
      dosageUnit: match[2].toLowerCase() === 'ui' ? 'IU' : match[2].toLowerCase(),
    };
  }

  return { dosage: doseStr.replace(/[^0-9.,]/g, ''), dosageUnit: 'mg' };
}

/**
 * Extracts duration in days from Portuguese duration string.
 * e.g. "7 dias" → 7, "1 meses" → 30
 */
function parseDuration(durStr) {
  if (!durStr || durStr === '-') return null;
  const match = durStr.match(/(\d+)\s*(dia|mes|semana)/i);
  if (!match) return null;
  const num = parseInt(match[1], 10);
  if (/mes/i.test(match[2])) return num * 30;
  if (/semana/i.test(match[2])) return num * 7;
  return num;
}

// ============================================================================
// MAIN EXPORT
// ============================================================================

/**
 * Parse a PDF prescription buffer.
 *
 * @param {Buffer} pdfBuffer  Raw PDF file bytes
 * @param {'regex'|'ai'} engine  Extraction engine: 'regex' for Fast Path, 'ai' for Ollama LLM
 * @returns {Promise<{ success: boolean, mode: string, medications: Array, rawText: string }>}
 */
async function parsePrescription(pdfBuffer, engine = 'regex') {
  const startTime = Date.now();

  // 1. Extract text
  const pdfData = await pdfParse(pdfBuffer);
  const rawText = pdfData.text;

  let results = [];
  let mode = 'Fast Path (Regex)';
  let isHighConfidence = false;

  // 2. Parse — explicit engine selection, no automatic fallback
  if (engine === 'ai') {
    logger.info('Prescription parser: AI mode selected by user');
    mode = 'Deep AI (Qwen 2.5 via Ollama)';
    results = await extractWithOllama(rawText);
    if (results.length === 0) {
      logger.warn('Prescription parser: AI returned 0 results — is Ollama running?');
    }
  } else {
    logger.info('Prescription parser: Regex mode selected by user');
    mode = 'Fast Path (Regex)';
    results = attemptFastParse(rawText);
    isHighConfidence = results.length > 0 && results.every((r) => r.confidence >= 2);
  }

  // 3. Normalize & map to CareSync format
  const medications = results.map((m, idx) => {
    const cleanName = cleanDrugName(m.drug_name);
    const cleanFreq =
      isHighConfidence && engine === 'regex' ? m.frequency : normalizeFrequency(m.frequency);
    const cleanForm = normalizeTerm(m.form, VOCABULARY.forms) || m.form || 'N/A';
    const { dosage, dosageUnit } = parseDoseString(m.dosage);
    const { frequency, timesPerDay } = mapFrequencyToCareSync(cleanFreq);
    const durationDays = parseDuration(m.duration);

    const today = new Date().toISOString().split('T')[0];
    let endDate = null;
    if (durationDays) {
      const end = new Date();
      end.setDate(end.getDate() + durationDays);
      endDate = end.toISOString().split('T')[0];
    }

    return {
      index: idx + 1,
      confidence: m.confidence || 0,
      parseMethod: mode,
      // Raw parsed data (for display)
      raw: {
        drug_name: cleanName,
        dose_str: m.dosage || 'N/A',
        form: cleanForm,
        frequency_pt: cleanFreq,
        duration: m.duration || '-',
        quantity: m.quantity || 1,
      },
      // Pre-mapped to CareSync schema (editable by user)
      mapped: {
        name: cleanName,
        dosage,
        dosageUnit,
        frequency,
        timesPerDay,
        startDate: today,
        endDate,
        totalQuantity: m.quantity || null,
        form: cleanForm,
        instructions: cleanFreq !== 'Ver Notas' ? cleanFreq : '',
      },
    };
  });

  return {
    success: medications.length > 0,
    duration_ms: Date.now() - startTime,
    mode,
    medications,
    rawText: rawText.substring(0, 3000), // truncated for preview
    pageCount: pdfData.numpages,
  };
}

module.exports = { parsePrescription };
