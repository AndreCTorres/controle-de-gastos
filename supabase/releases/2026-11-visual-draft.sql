-- Draft only: run before deployment. Unpublished notes are hidden from users.
-- Re-running refreshes a draft, but never edits a previously published version.
with draft(title,body) as (
  values ('Ajustes visuais de novembro de 2026',$release$- Valores mais fáceis de ler: os gastos usam texto neutro claro, e os totais das categorias ganharam destaque. Créditos e estornos continuam verdes porque reduzem as despesas; saldo negativo continua vermelho.
- Edição pelo lápis: clicar no nome da compra não abre mais o editor. Use o lápis ao lado para mudar o nome e escolher se ele vale para as próximas faturas.
- Seletores padronizados: os menus de tema, nomes de compras e categorias respeitam as bordas arredondadas, com opções legíveis e navegação por teclado.$release$)
), revised as (
  update public.app_updates u set body=d.body from draft d
  where u.title=d.title and u.published=false returning u.id
)
insert into public.app_updates(title,body,published)
select title,body,false from draft d
where not exists(select 1 from public.app_updates u where u.title=d.title);
