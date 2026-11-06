# Instruções do projeto

## Novidades para o usuário

O pop-up de novidades anuncia funcionalidades novas: o que o usuário passou a conseguir fazer no app. Esse é o critério definido pelo proprietário. Antes de criar um aviso, responda: “O que a pessoa pode fazer agora que antes não podia?”. Explique a capacidade, um exemplo útil e onde encontrá-la, em português simples.

Correções de bugs, ajustes de contraste, bordas, menus, desempenho, estabilidade e outras melhorias de manutenção ficam no histórico interno/README e não geram um novo pop-up. Mudanças de aparência só entram quando oferecem uma capacidade nova, como escolher um tema; retoques no tema existente não são uma nova funcionalidade. Não transforme o comunicado em uma lista de tarefas técnicas ou de correções.

Para cada versão com funcionalidades novas, mantenha os scripts de rascunho/publicação em `supabase/releases/`. Use um registro novo para novas capacidades, com título que identifique o mês/ano e distinga versões adicionais no mesmo mês. A criação do rascunho deve ser idempotente e manter `published=false`. Uma correção editorial deve ajustar o comunicado existente, preservando ID e data, sem criar outra notificação só para anunciar a correção do texto.

Publique o comunicado somente depois de aplicar o esquema necessário, publicar o frontend e verificar a funcionalidade no site. O pop-up marca a versão como lida ao clicar em “Entendido”, por usuário e navegador. Preserve a opção “Novidades do app” para consultar novamente. Valide o aviso em temas claro/escuro, no celular e após trocar de conta.

A autorização e o escopo do usuário na conversa prevalecem sobre estas instruções. Estas instruções não exigem uma confirmação adicional quando a publicação já estiver autorizada.
