// A shared select-only combobox. The native field remains the form's source of truth.
let current = null;
let nextId = 0;
const controls = new WeakMap();

function enhance(select) {
  if (controls.has(select) || select.multiple || select.size > 1) return;
  const wrapper = document.createElement('span');
  wrapper.className = 'select-control';
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'select-trigger';
  trigger.setAttribute('role', 'combobox');
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const value = document.createElement('span');
  value.className = 'select-value';
  const svgNamespace = 'http://www.w3.org/2000/svg';
  const arrow = document.createElementNS(svgNamespace, 'svg');
  arrow.setAttribute('class', 'select-arrow');
  arrow.setAttribute('viewBox', '0 0 24 24');
  arrow.setAttribute('width', '16');
  arrow.setAttribute('height', '16');
  arrow.setAttribute('fill', 'none');
  arrow.setAttribute('stroke', 'currentColor');
  arrow.setAttribute('stroke-width', '2');
  arrow.setAttribute('stroke-linecap', 'round');
  arrow.setAttribute('stroke-linejoin', 'round');
  arrow.setAttribute('aria-hidden', 'true');
  arrow.setAttribute('focusable', 'false');
  const chevron = document.createElementNS(svgNamespace, 'path');
  chevron.setAttribute('d', 'M5 8.5l7 7 7-7');
  arrow.append(chevron);
  trigger.append(value, arrow);
  const menu = document.createElement('div');
  menu.id = 'select-options-' + ++nextId;
  menu.className = 'select-menu';
  menu.setAttribute('role', 'listbox');
  menu.hidden = true;
  trigger.setAttribute('aria-controls', menu.id);
  const labels = [...(select.labels ?? [])];
  const label = select.getAttribute('aria-label') || labels
    .map(el => [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim()).join(' ') || 'Escolher opção';
  menu.setAttribute('aria-label', label);
  trigger.id = menu.id + '-trigger';
  labels.forEach(el => { el.htmlFor = trigger.id; });
  select.before(wrapper);
  wrapper.append(select, trigger);
  select.hidden = true;
  let active = -1, typeahead = '', typedAt = 0;
  const options = () => [...select.options];
  const enabled = () => options().map((o, i) => !o.disabled ? i : -1).filter(i => i >= 0);

  function sync() {
    const selected = select.selectedOptions[0];
    value.textContent = selected?.textContent || 'Escolher';
    trigger.title = selected?.textContent || '';
    trigger.setAttribute('aria-label', label + ': ' + value.textContent);
    trigger.disabled = select.disabled;
    if (select.disabled && current?.select === select) close();
    if (current?.select === select) draw();
  }
  function highlight(index, scroll = false) {
    active = index;
    [...menu.children].forEach((el, i) => el.classList.toggle('is-active', i === active));
    if (menu.children[active]) {
      trigger.setAttribute('aria-activedescendant', menu.children[active].id);
      if (scroll) menu.children[active].scrollIntoView({block:'nearest'});
    }
  }
  function draw() {
    menu.replaceChildren();
    options().forEach((option, index) => {
      const el = document.createElement('div');
      el.id = menu.id + '-' + index;
      el.className = 'select-option';
      el.setAttribute('role', 'option');
      el.setAttribute('aria-selected', String(index === select.selectedIndex));
      el.setAttribute('aria-disabled', String(option.disabled));
      el.textContent = option.textContent;
      el.addEventListener('pointermove', () => { if (!option.disabled) highlight(index); });
      el.addEventListener('pointerdown', event => event.preventDefault());
      el.addEventListener('click', () => { if (!option.disabled) choose(index); });
      menu.append(el);
    });
    if (!enabled().includes(active)) active = enabled()[0] ?? -1;
    highlight(active);
  }
  function open() {
    if (trigger.disabled || !enabled().length) return;
    current?.close();
    current = {select, trigger, menu, close};
    // Keep a modal's options inside its accessibility tree, but outside its scrolling body.
    (select.closest('.modal-overlay') || document.body).append(menu);
    menu.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    active = select.options[select.selectedIndex]?.disabled ? enabled()[0] : select.selectedIndex;
    draw();
    const rect = trigger.getBoundingClientRect();
    const width = Math.min(Math.max(rect.width, 150), innerWidth - 16);
    menu.style.width = width + 'px';
    menu.style.left = Math.max(8, Math.min(rect.left, innerWidth - width - 8)) + 'px';
    const below = innerHeight - rect.bottom - 14, above = rect.top - 14;
    const space = Math.max(below, above);
    menu.style.maxHeight = Math.min(280, space) + 'px';
    const height = menu.getBoundingClientRect().height;
    menu.style.top = (below >= height || below >= above ? rect.bottom + 6 : rect.top - height - 6) + 'px';
    highlight(active, true);
  }
  function close() {
    menu.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    trigger.removeAttribute('aria-activedescendant');
    if (current?.select === select) current = null;
  }
  function choose(index) {
    if (!select.options[index] || select.options[index].disabled) return;
    const changed = select.selectedIndex !== index;
    select.selectedIndex = index;
    close(); sync();
    if (changed) {
      select.dispatchEvent(new Event('input', {bubbles:true}));
      select.dispatchEvent(new Event('change', {bubbles:true}));
    }
    trigger.focus();
  }
  trigger.addEventListener('click', () => current?.select === select ? close() : open());
  trigger.addEventListener('keydown', event => {
    const isOpen = current?.select === select;
    const keys = ['ArrowDown','ArrowUp','Home','End','Enter',' ','Escape'];
    if (event.key === 'Tab') { if (isOpen) choose(active); return; }
    if (keys.includes(event.key)) {
      if (event.key === 'Escape') {
        if (isOpen) { event.preventDefault(); event.stopPropagation(); close(); }
        return;
      }
      event.preventDefault(); event.stopPropagation();
      if (event.key === 'Enter' || event.key === ' ') { isOpen ? choose(active) : open(); return; }
      if (!isOpen) open();
      const choices = enabled(), position = choices.indexOf(active);
      if (event.key === 'Home') highlight(choices[0], true);
      else if (event.key === 'End') highlight(choices.at(-1), true);
      else if (isOpen) highlight(choices[Math.max(0, Math.min(choices.length - 1, position + (event.key === 'ArrowDown' ? 1 : -1)))], true);
      return;
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      if (!isOpen) open();
      const now = Date.now();
      typeahead = now - typedAt < 700 ? typeahead + event.key : event.key; typedAt = now;
      const normalize = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('pt-BR');
      const match = enabled().find(i => normalize(select.options[i].textContent).startsWith(normalize(typeahead)));
      if (match != null) highlight(match, true);
    }
  });
  trigger.addEventListener('blur', () => { if (current?.select === select) { select.disabled ? close() : choose(active); } });
  select.addEventListener('change', sync);
  select.addEventListener('select:sync', sync);
  const observer = new MutationObserver(sync);
  observer.observe(select, {childList:true,subtree:true,attributes:true,attributeFilter:['disabled','selected']});
  select.form?.addEventListener('reset', () => queueMicrotask(sync));
  controls.set(select, {sync, dispose: () => { if (current?.select === select) close(); observer.disconnect(); menu.remove(); controls.delete(select); }});
  sync();
}
export function enhanceSelects(root = document) {
  if (root.matches?.('select')) enhance(root);
  root.querySelectorAll?.('select').forEach(enhance);
}
enhanceSelects();
new MutationObserver(records => {
  for (const record of records) {
    for (const node of record.addedNodes) if (node.nodeType === 1) enhanceSelects(node);
    for (const node of record.removedNodes) if (node.nodeType === 1) {
      const removed = node.matches('select') ? [node] : [...node.querySelectorAll('select')];
      removed.filter(select => !select.isConnected).forEach(select => controls.get(select)?.dispose());
    }
  }
  if (current && (!current.trigger.isConnected || current.trigger.closest('.modal-overlay:not(.open)'))) current.close();
}).observe(document.body, {childList:true,subtree:true});
document.addEventListener('pointerdown', event => {
  if (current && !current.trigger.contains(event.target) && !current.menu.contains(event.target)) current.close();
});
document.addEventListener('scroll', event => { if (current && !current.menu.contains(event.target)) current.close(); }, true);
window.addEventListener('resize', () => current?.close());
document.addEventListener('keydown', event => { if (event.key === 'Escape') current?.close(); });
