# Controle de Gastos

Aplicação de controle financeiro pessoal com suporte a múltiplos usuários.  
Stack: HTML + CSS + JS vanilla → Supabase (banco + auth) → Netlify (hospedagem).

---

## Estrutura do projeto

```
├── src/
│   ├── index.html              # HTML principal (tela de auth + app)
│   ├── style.css               # Todos os estilos
│   └── js/
│       ├── config.js           # Credenciais do Supabase (não versionado)
│       ├── config.example.js   # Template de configuração
│       ├── constants.js        # Meses, categorias padrão e paleta de cores
│       ├── state.js            # Estado compartilhado da aplicação
│       ├── auth.js             # Login, cadastro, logout, session listener
│       ├── db.js               # Leitura/escrita no Supabase + cache local
│       ├── persist.js          # Debounce de save e persistência offline
│       ├── utils.js            # Helpers (formatação de moeda, percentual)
│       ├── app.js              # Bootstrap, navegação de meses, export CSV/PDF
│       ├── ui/
│       │   ├── chart.js        # Gráfico donut e painel de distribuição
│       │   ├── feedback.js     # Widget de feedback (Formspree)
│       │   ├── income.js       # Linhas de renda
│       │   ├── modal.js        # Abertura/fechamento de modais + focus trap
│       │   ├── offline.js      # Banner offline e sincronização ao reconectar
│       │   ├── recalc.js       # Recálculo de totais e indicadores de metas
│       │   ├── sections.js     # Cards de categoria, itens, drag & drop
│       │   └── toast.js        # Notificações toast e confirmação inline
│       └── modals/
│           ├── copy.js         # Modal "Copiar mês anterior"
│           ├── goals.js        # Modal "Metas mensais"
│           ├── import.js       # Modal "Importar CSV"
│           ├── newSection.js   # Modal "Nova categoria"
│           ├── parcel.js       # Modal "Compra parcelada"
│           └── yearReport.js   # Modal "Relatório anual"
├── supabase/
│   ├── schema.sql              # Tabela principal (months) + RLS
│   ├── goals.sql               # Tabela de metas mensais (monthly_goals) + RLS
│   ├── updates.sql             # Tabela de notificações de atualização (app_updates) + RLS
│   └── email-confirm.html      # Template customizado de confirmação de e-mail
├── netlify.toml                # Configuração de deploy e headers de segurança
└── .gitignore
```

---

## Funcionalidades

- **Autenticação completa** — cadastro, login, logout, recuperação de senha
- **Dados isolados por usuário** via Row Level Security (RLS) no Supabase
- **Categorias de despesa** personalizáveis com subtotais e barra de progresso
- **Múltiplas fontes de renda** por mês
- **Compras parceladas** — distribui automaticamente as parcelas nos meses seguintes
- **Copiar do mês anterior** — reaproveita rendas e categorias com um clique
- **Metas mensais** — define limite de gasto por categoria com indicador visual de progresso
- **Relatório anual** — sumário do ano, gráfico de barras e tabela de despesas × meses
- **Export CSV / PDF** e **import CSV**
- **Suporte offline** — leitura do cache local quando sem conexão; sincronização automática ao reconectar
- **Notificações de atualização** — modal exibido uma única vez quando há novidade

---

## Setup (passo a passo)

### 1. Supabase

1. Acesse [supabase.com](https://supabase.com) e crie um projeto
2. No **SQL Editor**, execute os arquivos na ordem:
   - `supabase/schema.sql` — tabela principal de dados mensais
   - `supabase/goals.sql` — tabela de metas mensais
   - `supabase/updates.sql` — tabela de notificações (opcional)
3. Vá em **Project Settings → API** e copie:
   - **Project URL**
   - **anon public key**
4. Crie o arquivo de configuração a partir do template:
   ```bash
   copy src\js\config.example.js src\js\config.js
   ```
5. Abra `src/js/config.js` e substitua os valores:
   ```js
   export const SUPABASE_URL      = 'SUA_PROJECT_URL';
   export const SUPABASE_ANON_KEY = 'SUA_ANON_KEY';
   ```

> **Segurança:** `config.js` está no `.gitignore` e nunca é commitado. A `anon key` do
> Supabase é pública por design — pode ficar no código do cliente. A proteção real dos
> dados é feita pelo Row Level Security (RLS), que garante que cada usuário só acessa
> os próprios registros.

### 2. GitHub

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
git push -u origin main
```

### 3. Netlify

1. Acesse [netlify.com](https://netlify.com) → **Add new site → Import an existing project**
2. Conecte ao GitHub e selecione o repositório
3. O `netlify.toml` configura automaticamente:
   - **Publish directory:** `src`
   - **Security headers** (X-Frame-Options, CSP, etc.)
4. Clique em **Deploy site**

A cada `git push` na branch `main` o Netlify atualiza o site automaticamente.

---

## Autenticação

- Cadastro com e-mail + senha
- Confirmação de e-mail obrigatória por padrão
- Template customizado em `supabase/email-confirm.html`
- Para desativar confirmação em desenvolvimento: **Authentication → Providers → Email → Disable email confirmations**

---

## Publicar uma notificação de atualização

O pop-up anuncia **funcionalidades novas**: o que o usuário pode fazer agora que antes não conseguia, com exemplos e indicação de onde usar. Correções de bugs, retoques visuais, bordas, contraste e melhorias de manutenção ficam no histórico interno; não geram um novo aviso. Mantenha um script de rascunho e outro de publicação em `supabase/releases/` somente para versões com novas capacidades.

Para novembro de 2026:

1. Execute `supabase/releases/2026-11-draft.sql` para registrar o comunicado com `published=false`; esse rascunho não aparece aos usuários.
2. Aplique a migração de nomes e publique/verifique o frontend.
3. Execute `supabase/releases/2026-11-publish.sql` para ativar o comunicado. O script define a data real da publicação e não republica se for executado novamente.
4. Confira o pop-up no primeiro acesso de uma conta que ainda não confirmou essa versão, em ambos os temas e no celular. Após “Entendido”, o aviso não deve reaparecer naquele navegador. “Novidades do app”, no rodapé, permite consultá-lo novamente.

O código usa a identidade capturada no início da consulta para não exibir ou confirmar um aviso na conta errada. Se o armazenamento do navegador estiver bloqueado, a confirmação ainda vale durante a sessão. Nas próximas versões com novas funcionalidades, crie um novo registro. Ajustes editoriais mantêm o ID e a data do comunicado existente, sem forçar outra notificação.

## Revisão de confiabilidade — outubro de 2026

- Valores calculados em centavos e parcelas de 2 a 120 meses com distribuição do resto. A soma é exatamente o valor da compra. Categorias personalizadas são criadas nos meses futuros.
- As parcelas de uma compra são gravadas em uma transação. Versões antigas de outro dispositivo são bloqueadas e podem ser revisadas no indicador de salvamento.
- Alterações são guardadas imediatamente em uma fila local por usuário e período, antes de aguardar a rede. A fila sobrevive à recarga e sincroniza meses e metas. Não limpe os dados do navegador enquanto houver alterações pendentes.
- Abrir um mês não grava dados. A troca de período guarda primeiro as edições anteriores; uma falha de carregamento mantém o mês anterior.
- CSV aceita campos com aspas, ponto e vírgula e quebras de linha, valores brasileiros, metadados de parcelas e proteção contra fórmulas de planilha. A opção de adicionar ignora itens idênticos e preserva rendas existentes.
- Copiar o mês anterior preserva parcelas do mês atual e exclui parcelas da origem. A estrutura é copiada sem reutilizar parcelas já encerradas.
- O indicador de salvamento abre os detalhes, permite baixar backup JSON completo e resolver divergências. As substituições por CSV/cópia e a resolução de divergências mantêm até 10 cópias locais de recuperação, incluídas no backup.
- O SDK Supabase está fixado em 2.118.0 e servido localmente. O service worker guarda apenas os arquivos públicos do aplicativo; dados financeiros e respostas da API ficam fora desse cache. Acesso offline depende de já ter aberto o app e de uma sessão ainda válida.
- Recuperação de senha possui formulário de conclusão. Sair encerra a sessão deste dispositivo.

### Banco e testes

Execute `supabase/reliability.sql` antes de publicar esta versão. A função `save_finance_batch` usa SECURITY INVOKER, mantém as políticas RLS, exige conta autenticada igual à conta de origem e faz todas as gravações de um lote ou nenhuma. O arquivo é idempotente. Não altera os lançamentos existentes.

Rode `npm test`. Os testes cobrem centavos, virada de ano, categoria personalizada, CSV, importação repetida, fila offline, recarga, gravação em andamento, conflitos entre abas e isolamento de usuários. O banco foi validado com transações revertidas; os testes de interface usam dados fictícios. A pasta `.private-backup` nunca deve ser publicada.

## Faturas Nubank

Execute, depois de `reliability.sql`, nesta ordem: `invoices-schema.sql`, `invoices-classification.sql`, `invoices-import.sql`, `invoices-triggers.sql` e `invoices-text-import.sql`. As funções usam a conta autenticada e RLS; a chave de serviço nunca deve ficar no navegador.

O fluxo de importação recebe o texto completo do PDF e o nome original `Nubank_AAAA-MM-DD.pdf`. `preview_nubank_text` extrai os lançamentos e exige que compras, créditos, saldo anterior e eventual arredondamento de até um centavo confiram com o total da fatura. `import_nubank_text` importa esse resultado atomicamente usando a versão atual do mês. O mês da fatura é o mês do vencimento. Um mesmo vencimento não é importado duas vezes; uma versão diferente ou conflito com lançamentos manuais exige conferência.

O painel mostra a conciliação e permite revisar categorias. As correções confirmadas são aprendidas por estabelecimento/cartão, sem criar uma regra quando o mesmo estabelecimento pertence a pessoas diferentes. Valores do PDF ficam protegidos contra edição acidental. Desfazer remove somente os itens daquela importação, mantendo os outros lançamentos. Uma fatura desfeita não é recolocada automaticamente. O backup inclui importações, regras e cartões associados à conta.

A importação não preenche salário, despesas fora do cartão ou parcelas futuras. Ao copiar o mês anterior para um mês com fatura importada, somente as rendas são copiadas, para evitar duplicar despesas legadas. Créditos e estornos reduzem as despesas e são mantidos no CSV com sua origem.

A rotina mensal pode usar as conexões existentes de Gmail e Supabase em uma tarefa do ChatGPT. O código do site não armazena senha de e-mail nem token Google; a rotina depende dessas conexões permanecerem ativas. O procedimento procura a fatura, confere o PDF pelo parser do banco, importa com verificação de versão e comunica o resultado ou uma divergência que exija intervenção.

Como alternativa local, instale `scripts/requirements.txt` e execute `python scripts/nubank_pdf.py caminho/da/fatura.pdf resultado.json`. PDFs e JSONs financeiros devem ficar fora de `src`, de commits e de logs públicos.

Validação: `npm test` e `python -m unittest discover -s tests -p test_nubank_pdf.py`. Os testes usam somente dados fictícios.


## Nomes de compras e temas

O lápis ao lado de um lançamento importado abre **Nome da compra**. O nome amigável pode valer só para aquele lançamento, para a mesma compra parcelada ou para futuras compras no mesmo estabelecimento e cartão. O app mantém o texto original para consulta e acrescenta o número da parcela automaticamente: por exemplo, `Cama (2/12)`.

A identificação da compra usa estabelecimento, cartão, valor da parcela, quantidade de parcelas e ciclo inicial da fatura. Outra compra na mesma loja não recebe esse nome por engano. Quando duas compras têm exatamente a mesma identificação, o app exige edição individual ou uma regra explícita para o estabelecimento. Créditos e estornos não herdam nomes de compras. O nome vazio restaura o original e remove a regra que havia sido escolhida. Meses anteriores não são reescritos.

**Antes de publicar o frontend**, aplique `supabase/migrations/20261106180948_invoice_friendly_names.sql` no mesmo banco, depois dos scripts de faturas existentes. A migração adiciona regras isoladas por usuário e gatilhos ao salvamento/importação; a automação mensal existente passa a respeitá-las sem mudar seu procedimento. Não reimporte faturas antigas para ativar os nomes. A migração não altera lançamentos históricos. O backup completo inclui `nameRules`, e o CSV preserva os metadados de nome de cada item.

O seletor **Tema** está no login e no cabeçalho: Claro, Escuro ou Sistema. A preferência fica neste navegador, sincroniza entre abas e é aplicada antes da página aparecer. O tema escuro adapta superfícies, campos, categorias, gráficos, avisos e modais. A impressão usa a paleta clara.

Para validar: `npm ci && npm test` e `python -m unittest discover -s tests -p test_nubank_pdf.py`. Os testes de nomes executam a migração em um Postgres local em memória (PGlite), com dados fictícios e RLS; não acessam o banco remoto. PGlite é apenas uma dependência de desenvolvimento, sem mudanças nas dependências do site publicado.


## Ajustes visuais — novembro de 2026

Os valores comuns usam cor neutra para não parecerem ações. Totais das categorias usam o texto principal, com contraste maior. Verde identifica créditos/estornos que reduzem as despesas; saldo negativo mantém vermelho. O nome de um item importado é somente leitura; o lápis abre a edição.

Os campos de seleção usam um componente comum em `src/js/ui/select.js`, preservando o campo de formulário original. A lista tem bordas arredondadas, opções desabilitadas, controle de foco e posicionamento dentro da janela. Teclado: Enter/Espaço abre e confirma, setas navegam, Home/End vão aos extremos, digitação busca opções e Escape cancela sem fechar o modal. Tab confirma e segue para o próximo campo. A preferência de tema continua sincronizada entre abas.

Referências: [WCAG — contraste de texto](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) e [WAI-ARIA — combobox de seleção](https://www.w3.org/WAI/ARIA/apg/patterns/combobox/examples/combobox-select-only/). Os testes verificam teclado, clique, seletores dinâmicos, crédito versus saldo negativo, contraste, persistência do tema e limites no celular. Não substituem testes com leitores de tela.

Execute `npm ci`, `npx playwright install chromium` e `npm run test:browser` para a verificação de interface. Playwright é apenas uma dependência de desenvolvimento.

Esta revisão visual faz parte do histórico interno e não gera um pop-up. O script `supabase/releases/2026-11-editorial-correction.sql` retira o aviso de ajustes visuais e concentra o comunicado existente de novembro nas novas capacidades: temas e nomes personalizados. Preserva o ID e a data do comunicado funcional.

A seta dos seletores usa um chevron SVG de tamanho fixo, alinhado ao centro e com rotação ao abrir a lista. O desenho não depende da fonte instalada no navegador. Esta correção visual fica somente no histórico interno.
