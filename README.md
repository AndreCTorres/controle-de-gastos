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

Insira um registro na tabela `app_updates` com `published = true`. Cada usuário verá o modal uma única vez:

```sql
insert into public.app_updates (title, body, published)
values (
  'Título da novidade',
  'Descrição do que foi adicionado ou melhorado.',
  true
);
```

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
