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
