import { state } from '../state.js';
import { MONTHS, DEFAULT_SECTIONS, NEW_SEC_COLORS } from '../constants.js';
import { fmt } from '../utils.js';
import { openModal, closeModal } from '../ui/modal.js';
import { renderIncomes } from '../ui/income.js';
import { renderSections } from '../ui/sections.js';
import { recalc } from '../ui/recalc.js';

// ── Import CSV modal ──

let _importParsed = null;
let importSecColorIdx = 0;

// Generates the AI prompt based on the current export format
function buildImportPrompt() {
  const exampleSections = DEFAULT_SECTIONS.slice(0, 3)
    .map(s => `${s.title};color:${s.color};bg:${s.bg}\n${s.items.slice(0, 2).map(i => `${i.label};0,00`).join('\n')}`)
    .join('\n\n');

  return `Tenho uma planilha com meus gastos mensais e preciso converter os dados para um formato CSV específico.

FORMATO ESPERADO (cada bloco é uma categoria):
Renda principal;3500,00
Renda extra;500,00

Supermercado;color:#2D6A4F;bg:#E8F5EE
Alimentos;320,50
Carnes;150,00

Moradia & Contas;color:#1D5A8A;bg:#E8F0FA
Conta de luz;85,00
Internet;120,00

REGRAS IMPORTANTES:
- Primeira seção são as RENDAS (sem cabeçalho, apenas nome;valor)
- Depois cada categoria no formato: NomeCategoria;color:#HEXCOR;bg:#HEXFUNDO
- Os itens dentro de cada categoria: NomeItem;valor
- Valores usam vírgula como decimal (ex: 1.250,00)
- Se não souber a cor de uma categoria, omita os valores de cor (deixe color: e bg: vazios)
- Não inclua totais, cabeçalhos extras ou colunas desnecessárias
- Linhas em branco entre categorias são opcionais

Aqui estão os meus dados da planilha — por favor converta para esse formato CSV:
[COLE AQUI OS DADOS DA SUA PLANILHA]`;
}

window.triggerImport = function() {
  window.openImportModal();
};

window.openImportModal = function() {
  _importParsed = null;

  const promptEl = document.getElementById('importPromptText');
  if (promptEl) promptEl.textContent = buildImportPrompt();

  document.getElementById('importStep1').style.display = '';
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importBackBtn').style.display = 'none';
  document.getElementById('importNextBtn').textContent = 'Continuar →';
  document.getElementById('importCsvTextarea').value = '';
  document.getElementById('importParseError').style.display = 'none';

  openModal('importModal', '#importCsvTextarea');
};

window.closeImportModal = function() {
  closeModal('importModal');
  _importParsed = null;
};

window.copyImportPrompt = function() {
  const text = document.getElementById('importPromptText').textContent;
  navigator.clipboard.writeText(text).then(() => {
    const btn = document.getElementById('importCopyBtn');
    btn.classList.add('copied');
    btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copiado!`;
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copiar`;
    }, 2200);
  }).catch(() => window.showToast('Não foi possível copiar. Selecione e copie manualmente.', 'error'));
};

// File input listener for the import modal
document.getElementById('csvImportFileInput')?.addEventListener('change', function() {
  const file = this.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('importCsvTextarea').value = e.target.result;
    document.getElementById('importParseError').style.display = 'none';
  };
  reader.readAsText(file, 'UTF-8');
  this.value = '';
});

// Parse CSV in the app's format — returns { incomes, sections } or throws with a message
export function parseImportCsv(rawText) {
  const text  = rawText.replace(/^\uFEFF/, '').trim();
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

  if (lines.length < 2) throw new Error('O arquivo parece vazio ou muito curto. Verifique se o conteúdo foi colado corretamente.');

  const importedIncomes  = [];
  const importedSections = [];

  importSecColorIdx = 0;

  const secColorRe = /^(.+?);color:(#[0-9A-Fa-f]{3,8})?;bg:(#[0-9A-Fa-f]{3,8})?$/i;
  const GRAY_COLOR = /^#8{6}$/i;

  let inHeaderBlock = true;
  let currentSec = null;
  let idCounter  = 0;
  const uid = () => 'imp_' + Date.now() + '_' + (idCounter++);

  const hasRendasBlock = lines.some(l => l.trim() === 'RENDAS');
  let inRendasBlock    = false;

  lines.forEach(line => {
    const parts  = line.split(';');
    const label  = (parts[0] || '').trim();
    const rawVal = (parts[1] || '').trim().replace(/\./g, '').replace(',', '.');
    const val    = parseFloat(rawVal) || 0;

    if (label === 'Total Renda' || label === 'TOTAL DESPESAS' || label === 'SALDO') return;
    if (line.startsWith('Controle de Gastos')) return;

    if (hasRendasBlock) {
      if (label === 'RENDAS') { inRendasBlock = true; inHeaderBlock = false; return; }
      if (inRendasBlock) {
        const colorMatch = secColorRe.exec(line);
        if (colorMatch) { inRendasBlock = false; }
        else {
          importedIncomes.push({ id: importedIncomes.length === 0 ? 'main' : uid(), label, val: val > 0 ? String(val) : '' });
          return;
        }
      }
    }

    const colorMatch = secColorRe.exec(line);
    if (colorMatch) {
      inHeaderBlock = false;
      const title    = colorMatch[1].trim();
      const csvColor = colorMatch[2] || '';
      const csvBg    = colorMatch[3] || '';
      const defSec   = DEFAULT_SECTIONS.find(s => s.title.toLowerCase() === title.toLowerCase());

      const isGenericGray = (c) => !c || GRAY_COLOR.test(c) || c.toLowerCase() === '#f0f0f0';
      let resolvedColor, resolvedBg;
      if (defSec) {
        resolvedColor = defSec.color;
        resolvedBg    = defSec.bg;
      } else if (!isGenericGray(csvColor)) {
        resolvedColor = csvColor;
        resolvedBg    = !isGenericGray(csvBg) ? csvBg : NEW_SEC_COLORS[importSecColorIdx % NEW_SEC_COLORS.length].bg;
      } else {
        const palette = NEW_SEC_COLORS[importSecColorIdx % NEW_SEC_COLORS.length];
        resolvedColor = palette.color;
        resolvedBg    = palette.bg;
        importSecColorIdx++;
      }

      currentSec = {
        id:    defSec ? defSec.id : 'imp_custom_' + uid(),
        title,
        color: resolvedColor,
        bg:    resolvedBg,
        items: [],
      };
      importedSections.push(currentSec);
      return;
    }

    const defSecMatch = DEFAULT_SECTIONS.find(s => s.title.toLowerCase() === label.toLowerCase());
    if (defSecMatch && (parts.length === 1 || !rawVal)) {
      inHeaderBlock = false;
      currentSec = { ...defSecMatch, items: [] };
      importedSections.push(currentSec);
      return;
    }

    if (inHeaderBlock && !hasRendasBlock && label && parts.length >= 1) {
      importedIncomes.push({ id: importedIncomes.length === 0 ? 'main' : uid(), label, val: val > 0 ? String(val) : '' });
      return;
    }

    if (currentSec && label) {
      currentSec.items.push({ id: uid(), label, val: val > 0 ? String(val) : '' });
    }
  });

  if (importedIncomes.length === 0) {
    importedIncomes.push({ id: 'main', label: 'Renda principal', val: '' });
  }
  if (importedSections.length === 0) {
    throw new Error('Nenhuma categoria foi encontrada no CSV. Verifique se o formato está correto — cada categoria precisa da linha "Nome;color:#COR;bg:#FUNDO".');
  }

  return { incomes: importedIncomes, sections: importedSections };
}

// Render the import preview panel
export function renderImportPreview(parsed) {
  const body = document.getElementById('importPreviewBody');
  body.innerHTML = '';

  const rendaCard = document.createElement('div');
  rendaCard.className = 'import-preview-renda';
  const rendaHead = document.createElement('div');
  rendaHead.className = 'import-preview-renda-head';
  rendaHead.textContent = '💵 Rendas';
  rendaCard.appendChild(rendaHead);
  parsed.incomes.forEach(inc => {
    const row = document.createElement('div');
    row.className = 'import-preview-item';
    const lbl = document.createElement('span');
    lbl.className = 'import-preview-item-label';
    lbl.textContent = inc.label || 'Renda';
    const vEl = document.createElement('span');
    const v = parseFloat(inc.val) || 0;
    vEl.className = 'import-preview-item-val' + (v === 0 ? ' empty' : '');
    vEl.textContent = v > 0 ? fmt(v) : '—';
    row.appendChild(lbl); row.appendChild(vEl);
    rendaCard.appendChild(row);
  });
  body.appendChild(rendaCard);

  parsed.sections.forEach(sec => {
    const safeColor = /^#[0-9A-Fa-f]{3,8}$/.test(sec.color || '') ? sec.color : '#888';
    const safeBg    = /^#[0-9A-Fa-f]{3,8}$/.test(sec.bg    || '') ? sec.bg    : '#F0F0F0';
    const total = sec.items.reduce((a, i) => a + (parseFloat(i.val) || 0), 0);

    const card = document.createElement('div');
    card.className = 'import-preview-section';

    const head = document.createElement('div');
    head.className = 'import-preview-section-head';

    const tag = document.createElement('span');
    tag.className = 'section-tag';
    tag.style.color      = safeColor;
    tag.style.background = safeBg;
    tag.textContent = sec.title;

    const totEl = document.createElement('span');
    totEl.className = 'import-preview-section-total';
    totEl.textContent = total > 0 ? fmt(total) : '—';

    head.appendChild(tag); head.appendChild(totEl);
    card.appendChild(head);

    sec.items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'import-preview-item';
      const lbl = document.createElement('span');
      lbl.className = 'import-preview-item-label';
      lbl.textContent = item.label || 'Item';
      const vEl = document.createElement('span');
      const v = parseFloat(item.val) || 0;
      vEl.className = 'import-preview-item-val' + (v === 0 ? ' empty' : '');
      vEl.textContent = v > 0 ? fmt(v) : '—';
      row.appendChild(lbl); row.appendChild(vEl);
      card.appendChild(row);
    });
    body.appendChild(card);
  });
}

window.importNext = async function() {
  const step1 = document.getElementById('importStep1');
  const step2 = document.getElementById('importStep2');

  if (step2.style.display === 'none') {
    const raw   = document.getElementById('importCsvTextarea').value.trim();
    const errEl = document.getElementById('importParseError');

    if (!raw) {
      errEl.textContent   = 'Cole ou carregue um arquivo CSV antes de continuar.';
      errEl.style.display = '';
      return;
    }

    try {
      _importParsed = parseImportCsv(raw);
      errEl.style.display = 'none';
    } catch (err) {
      errEl.textContent   = err.message;
      errEl.style.display = '';
      return;
    }

    renderImportPreview(_importParsed);
    document.getElementById('importTargetMonthLabel').textContent = `${MONTHS[state.currentMonth]} ${state.currentYear}`;

    step1.style.display = 'none';
    step2.style.display = '';
    document.getElementById('importBackBtn').style.display = '';
    document.getElementById('importNextBtn').textContent = 'Importar dados';
    return;
  }

  if (!_importParsed) return;

  state.incomes  = _importParsed.incomes;
  state.sections = _importParsed.sections;
  renderIncomes();
  renderSections();
  recalc();
  window.closeImportModal();
  window.showToast(`Dados importados para ${MONTHS[state.currentMonth]} ${state.currentYear}!`);
};

window.importGoBack = function() {
  document.getElementById('importStep1').style.display = '';
  document.getElementById('importStep2').style.display = 'none';
  document.getElementById('importBackBtn').style.display = 'none';
  document.getElementById('importNextBtn').textContent = 'Continuar →';
};

document.getElementById('importModal')?.addEventListener('click', function(e) {
  if (e.target === this) window.closeImportModal();
});
