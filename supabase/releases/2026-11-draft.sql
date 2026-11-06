-- Draft only: run before deployment. Unpublished notes are hidden from users.
-- Re-running refreshes a draft, but never edits a previously published version.
with draft(title,body) as (
  values ('Novidades de novembro de 2026',$release$- Escolha como visualizar o app: use os temas Claro, Escuro ou Sistema pelo seletor Tema, no login ou no cabeçalho.
- Dê nomes às suas compras parceladas: troque o nome da fatura por algo que faça sentido para você, como “Cama do quarto”. Escolha aplicar às próximas parcelas para receber “Cama do quarto (2/12)” automaticamente.
- Personalize suas compras recorrentes: salve um nome para as próximas compras do mesmo estabelecimento e cartão, sem precisar renomear todo mês. Use o lápis ao lado da compra para configurar.$release$)
), revised as (
  update public.app_updates u set body=d.body from draft d
  where u.title=d.title and u.published=false returning u.id
)
insert into public.app_updates(title,body,published)
select title,body,false from draft d
where not exists(select 1 from public.app_updates u where u.title=d.title);
