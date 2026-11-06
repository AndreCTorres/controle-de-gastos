# Instruções do projeto

## Novidades para o usuário

Toda atualização que alterar a experiência do usuário deve incluir um comunicado em português no pop-up de novidades, conforme a preferência do proprietário. Inclua o que mudou e onde usar, sem detalhes de implementação ou promessas de recursos ainda indisponíveis.

Mantenha o texto e os scripts de rascunho/publicação em `supabase/releases/`. Para cada nova versão, prepare um registro novo; não reutilize o ID de uma versão já lida. O título deve identificar o mês/ano e distinguir versões adicionais no mesmo mês. A criação do rascunho deve ser idempotente e manter `published=false`.

Publique o comunicado somente depois de aplicar o esquema necessário, publicar o frontend e verificar a versão no site. O pop-up marca a versão como lida ao clicar em “Entendido”, por usuário e navegador. Preserve a opção “Novidades do app” para consultar novamente. Valide o aviso em temas claro/escuro, no celular e após trocar de conta.

A autorização e o escopo do usuário na conversa prevalecem sobre estas instruções. Estas instruções não exigem uma confirmação adicional quando a publicação já estiver autorizada.
