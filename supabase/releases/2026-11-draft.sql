-- Draft only: run before deployment. Unpublished notes are hidden from users.
-- Re-running refreshes a draft, but never edits a previously published version.
with draft(title,body) as (
  values ('Novidades de novembro de 2026',$release$- Tema claro, escuro ou do sistema: escolha no login ou no cabeçalho. Sua preferência fica salva neste navegador.
- Nomes personalizados nas faturas: use o lápis ao lado da compra. Escolha se o nome vale só naquele lançamento ou nas próximas parcelas, mantendo a numeração automática e o texto original para consulta.
- Compras recorrentes: você também pode guardar um nome para as próximas compras do mesmo estabelecimento e cartão. Os valores da fatura continuam preservados.
- Conferência de faturas: confira os totais, revise as categorias sugeridas e desfaça uma importação sem apagar os outros lançamentos do mês.
- Salvamento mais confiável: suas alterações ficam guardadas no dispositivo até sincronizar. O indicador de salvamento permite conferir pendências, resolver diferenças e baixar um backup completo.
- CSV e parcelas: melhorias na importação de planilhas, na cópia do mês anterior e na distribuição dos centavos das compras parceladas.$release$)
), revised as (
  update public.app_updates u set body=d.body from draft d
  where u.title=d.title and u.published=false returning u.id
)
insert into public.app_updates(title,body,published)
select title,body,false from draft d
where not exists(select 1 from public.app_updates u where u.title=d.title);
