-- Run ONLY after deploying and verifying this release's schema and frontend.
-- A second execution does not change the publication date or notify users again.
update public.app_updates set published=true,created_at=clock_timestamp()
where title='Novidades de novembro de 2026' and published=false;
