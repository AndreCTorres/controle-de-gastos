import { parseImportCsv, mergeMonthData } from '../csv.js';
export { parseImportCsv } from '../csv.js';
import { repository } from '../db.js';
import { snapshotCurrent, persistData } from '../persist.js';
import { state } from '../state.js';
import { MONTHS, DEFAULT_SECTIONS, NEW_SEC_COLORS } from '../constants.js';
import { fmt } from '../utils.js';
import { openModal, closeModal } from '../ui/modal.js';
import { renderIncomes } from '../ui/income.js';
import { renderSections } from '../ui/sections.js';
import { recalc } from '../ui/recalc.js';
import { scheduleSave } from '../persist.js';

// ── Import CSV modal ──

let _importParsed = null;
let importSecColorIdx = 0;

function getImportMode() {
  return document.querySelector('input[name="importMode"]:checked')?.value || 'replace';
}

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
  if(file.size>2000000){window.showToast('O CSV excede o limite de 2 MB.','error');this.value='';return;}
  const reader = new FileReader();
  reader.onload = e => {
    document.getElementById('importCsvTextarea').value = e.target.result;
    document.getElementById('importParseError').style.display = 'none';
  };
  reader.readAsText(file, 'UTF-8');
  this.value = '';
});

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

    // Set up scroll fade indicator
    const body = document.getElementById('importPreviewBody');
    const wrap = document.getElementById('importPreviewBodyWrap');
    const updateFade = () => {
      const atBottom = body.scrollTop + body.clientHeight >= body.scrollHeight - 4;
      wrap.classList.toggle('at-bottom', atBottom);
    };
    body.addEventListener('scroll', updateFade, { passive: true });
    // Delay check to allow layout to settle
    requestAnimationFrame(() => requestAnimationFrame(updateFade));

    return;
  }

  if (!_importParsed) return;

  const before=snapshotCurrent();
  repository.archive('Antes de importar CSV',[{type:'month',month:state.currentMonth,year:state.currentYear,payload:before}]);
  if (getImportMode() === 'merge') {
    const result=mergeMonthData(before,_importParsed);
    state.incomes=result.data.incomes; state.sections=result.data.sections;
  } else {
    state.incomes  = _importParsed.incomes;
    state.sections = _importParsed.sections;
  }
  renderIncomes();
  renderSections();
  recalc();
  scheduleSave();
  try { await persistData(); } catch { window.showToast('Importação guardada no dispositivo. Confira o salvamento.', 'info'); window.closeImportModal(); return; }
  window.closeImportModal();
  window.showToast(getImportMode() === 'merge'
    ? `Dados adicionados em ${MONTHS[state.currentMonth]} ${state.currentYear}!`
    : `Dados importados para ${MONTHS[state.currentMonth]} ${state.currentYear}!`);
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
