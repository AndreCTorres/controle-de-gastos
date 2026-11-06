-- Editorial correction requested by the owner: keep the functional release's ID/date.
-- No new notification record and no changes to financial data or the frontend.
begin;
update public.app_updates set body=$release$- Escolha como visualizar o app: use os temas Claro, Escuro ou Sistema pelo seletor Tema, no login ou no cabeçalho.
- Dê nomes às suas compras parceladas: troque o nome da fatura por algo que faça sentido para você, como “Cama do quarto”. Escolha aplicar às próximas parcelas para receber “Cama do quarto (2/12)” automaticamente.
- Personalize suas compras recorrentes: salve um nome para as próximas compras do mesmo estabelecimento e cartão, sem precisar renomear todo mês. Use o lápis ao lado da compra para configurar.$release$
where title='Novidades de novembro de 2026';
update public.app_updates set published=false
where title='Ajustes visuais de novembro de 2026';
commit;
