import sys, pathlib, unittest
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]/"scripts"))
from nubank_pdf import parse_invoice_text
BASE="""Olá. Esta é sua fatura.
R$ 121,50
Data de vencimento: 13 OUT 2026
Fatura anterior R$ 5,00
Pagamento recebido −R$ 0,00
TRANSAÇÕES DE 06 SET A 06 OUT
06 SET •••• 1111 Loja - Parcela 2/3 R$ 61,00
06 SET •••• 1111 Loja - Parcela 2/3 R$ 61,00
07 SET Estorno de "Loja" −R$ 5,50
Pagamentos e Financiamentos
09 SET Pagamento em 09 SET −R$ 100,00
14 SET Saldo restante da fatura anterior −R$ 0,01
14 SET Saldo restante da fatura anterior R$ 0,01
"""
class InvoiceTests(unittest.TestCase):
 def test_exact_balance_and_duplicates(self):
  parsed=parse_invoice_text(BASE,"Nubank_2026-10-13.pdf")
  self.assertEqual(len(parsed["entries"]),3)
  self.assertEqual(parsed["transactions_cents"],11650)
  self.assertEqual(parsed["carryover_cents"],500)
  self.assertEqual(parsed["total_cents"],12150)
  self.assertEqual(parsed["rounding_cents"],0)
  self.assertEqual(parsed["ignored_financing_rows"],3)
 def test_refund_is_signed(self):
  self.assertEqual(parse_invoice_text(BASE)["entries"][-1]["amount_cents"],-550)
 def test_installment_is_not_multiplied(self):
  entry=parse_invoice_text(BASE)["entries"][0]
  self.assertEqual(entry["amount_cents"],6100)
  self.assertEqual((entry["installment_number"],entry["installment_count"]),(2,3))
 def test_incomplete_transactions_stop_the_import(self):
  with self.assertRaises(ValueError):parse_invoice_text(BASE.replace('R$ 61,00','R$ 61,XX',1))
 def test_missing_total_stops_the_import(self):
  with self.assertRaises(ValueError):parse_invoice_text(BASE.replace('R$ 121,50','Total oculto'))
 def test_previous_year_is_derived_from_due_cycle(self):
  text=BASE.replace('13 OUT 2026','13 JAN 2027').replace('06 SET','06 DEZ').replace('07 SET','07 DEZ')
  parsed=parse_invoice_text(text)
  self.assertEqual(parsed["entries"][0]["date"],"2026-12-06")
if __name__=="__main__":unittest.main()
