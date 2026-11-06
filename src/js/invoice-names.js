import { clone } from './finance.js';

export function originalInvoiceLabel(item) {
  if (item.originalLabel) return item.originalLabel;
  if (!item.merchant) return item.label;
  return item.parcelNumber && item.parcelCount
    ? `${item.merchant} (${item.parcelNumber}/${item.parcelCount})` : item.merchant;
}
export function invoiceNameKey(item, year, month, scope) {
  if (!item.merchantKey || !(item.originalAmountCents > 0)) return null;
  const identity = [item.merchantKey, item.sourceCardLast4 ?? item.cardLast4 ?? ''];
  if (scope === 'merchant') return JSON.stringify(identity);
  if (scope !== 'purchase' || !Number.isInteger(item.parcelNumber) || !Number.isInteger(item.parcelCount)) return null;
  return JSON.stringify([...identity, item.originalAmountCents, item.parcelCount, year * 12 + month - item.parcelNumber + 1]);
}
export function canNamePurchase(item, sections, year, month) {
  const key = invoiceNameKey(item, year, month, 'purchase');
  return !!key && sections.flatMap(s => s.items).filter(i => i.invoicePosition != null && invoiceNameKey(i, year, month, 'purchase') === key).length === 1;
}
export function renameInvoiceItem(data, itemId, name, scope, year, month) {
  const next = clone(data), item = next.sections.flatMap(s => s.items).find(i => i.id === itemId);
  if (!item?.invoiceId || item.invoicePosition == null) throw Error('Lançamento da fatura não encontrado.');
  if (!['once', 'purchase', 'merchant'].includes(scope)) throw Error('Escolha onde aplicar o nome.');
  if (scope === 'purchase' && !canNamePurchase(item, next.sections, year, month)) throw Error('Há compras semelhantes nesta fatura. Use um nome só para este lançamento.');
  if (scope === 'merchant' && !invoiceNameKey(item, year, month, scope)) throw Error('Este lançamento permite apenas um nome neste mês.');
  const friendlyName = String(name).trim();
  if (friendlyName.length > 100) throw Error('Use até 100 caracteres para o nome.');
  item.originalLabel = originalInvoiceLabel(item);
  item.friendlyName = friendlyName;
  item.nameScope = scope;
  item.label = friendlyName ? friendlyName + (item.parcelNumber ? ` (${item.parcelNumber}/${item.parcelCount})` : '') : item.originalLabel;
  return next;
}
