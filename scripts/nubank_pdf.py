"""Read Nubank text-based invoices without an AI or spreadsheet conversion."""
import re, json, hashlib, sys
from decimal import Decimal
from datetime import date
MONTHS={"JAN":1,"FEV":2,"MAR":3,"ABR":4,"MAI":5,"JUN":6,"JUL":7,"AGO":8,"SET":9,"OUT":10,"NOV":11,"DEZ":12}
def br_cents(value):
    value=str(value).strip().replace("−","-").replace("R$","").replace(" ","").replace(".","").replace(",",".")
    return int(Decimal(value)*100)
def parse_invoice_text(text, source_name=""):
    clean=text.replace("\r\n","\n").replace("\r","\n")
    due=re.search(r"Data de vencimento:\s*(\d{1,2})\s+([A-Z]{3})\s+(\d{4})",clean,re.I)
    if not due: raise ValueError("Data de vencimento não encontrada.")
    day,mon,year=due.groups(); y=int(year);m=MONTHS[mon.upper()]
    first=clean.split("\f")[0]
    total=re.search(r"R\$\s*([\d.]+,\d{2})",first)
    if not total:raise ValueError("Total da fatura não encontrado.")
    total_cents=br_cents(total.group(1))
    previous=re.search(r"Fatura anterior\s+R\$\s*([\d.]+,\d{2})",clean,re.I)
    paid=re.search(r"Pagamento recebido\s+[−-]?R\$\s*([\d.]+,\d{2})",clean,re.I)
    if not previous or not paid:raise ValueError("Resumo de saldo anterior e pagamento não encontrado.")
    prior=br_cents(previous.group(1));payment=br_cents(paid.group(1))
    pattern=re.compile(r"^\s*(\d{2})\s+([A-Z]{3})\s+(?:[•●.]{4}\s*(\d{4})\s+)?(.+?)\s+([−-]?)\s*R\$\s*([−-]?[\d.]+,\d{2})\s*$",re.I)
    entries=[];ignored=[];in_transactions=False;in_finance=False;unparsed=[]
    for line_no,line in enumerate(clean.splitlines(),1):
        if "TRANSAÇÕES" in line.upper():in_transactions=True
        if not in_transactions:continue
        if "Pagamentos e Financiamentos".lower() in line.lower():in_finance=True
        match=pattern.match(line)
        if not match:
            if re.match(r"^\s*\d{2}\s+(?:"+"|".join(MONTHS)+r")\s+",line,re.I):unparsed.append(line_no)
            continue
        d,month,card,description,sign,value=match.groups()
        value_cents=br_cents(sign+value)
        if re.match(r"Pagamento em|Saldo restante da fatura anterior",description,re.I):
            ignored.append({"description":description.strip(),"amount_cents":value_cents});continue
        installment=re.search(r"\s*-\s*Parcela\s+(\d+)/(\d+)\s*$",description,re.I)
        base=description[:installment.start()].strip() if installment else description.strip()
        transaction_month=MONTHS[month.upper()];transaction_year=y-(transaction_month>m)
        entries.append({"position":len(entries)+1,"date":date(transaction_year,transaction_month,int(d)).isoformat(),"card_last4":card,
            "description":description.strip(),"merchant":base,"amount_cents":value_cents,
            "installment_number":int(installment.group(1)) if installment else None,
            "installment_count":int(installment.group(2)) if installment else None,
            "kind":"refund" if value_cents<0 else "tax" if re.match(r"IOF\b",description,re.I) else "fee" if in_finance else "purchase"})
    if not entries or unparsed:raise ValueError("Lançamentos incompletos: linhas "+str(unparsed))
    net=sum(e["amount_cents"] for e in entries)
    carryover=prior-payment
    delta=total_cents-carryover-net
    if abs(delta)>1:raise ValueError("A fatura não confere. Diferença em centavos: "+str(delta))
    return {"schema_version":1,"bank":"nubank","year":y,"month":m-1,"due_date":date(y,m,int(day)).isoformat(),
        "source_filename":source_name,"total_cents":total_cents,"previous_balance_cents":prior,"previous_payment_cents":payment,
        "carryover_cents":carryover,"transactions_cents":net,"rounding_cents":delta,"entries":entries,
        "ignored_financing_rows":len(ignored),"text_sha256":hashlib.sha256(clean.encode()).hexdigest()}
def read_pdf(path):
    from pypdf import PdfReader
    reader=PdfReader(path)
    if reader.is_encrypted:raise ValueError("PDF protegido por senha; use um arquivo desbloqueado.")
    return "\f".join(page.extract_text(extraction_mode="layout") or "" for page in reader.pages)
if __name__=="__main__":
    if len(sys.argv)!=3:raise SystemExit("Uso: python nubank_pdf.py fatura.pdf resultado.json")
    invoice=parse_invoice_text(read_pdf(sys.argv[1]),sys.argv[1].replace("\\","/").split("/")[-1])
    with open(sys.argv[2],"w",encoding="utf-8")as f:json.dump(invoice,f,ensure_ascii=False,indent=2)
    print(json.dumps({k:invoice[k] for k in ["year","month","total_cents","transactions_cents","carryover_cents","rounding_cents","ignored_financing_rows"]}|{"entries":len(invoice["entries"])},ensure_ascii=False))
