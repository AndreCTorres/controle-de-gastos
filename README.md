# Controle de Gastos

Aplicação de controle financeiro pessoal com suporte a múltiplos usuários.  
Stack: HTML + CSS + JS vanilla → Supabase (banco + auth) → Netlify (hospedagem).

---

## Estrutura do projeto

```
├── src/
│   ├── index.html        # HTML principal
│   ├── style.css         # Todos os estilos
│   └── js/
│       ├── config.js     # Credenciais do Supabase (preencher antes de subir)
│       ├── auth.js       # Login, cadastro, logout, session listener
│       ├── db.js         # Funções de leitura/escrita no Supabase
│       └── app.js        # Toda a lógica da aplicação
├── supabase/
│   └── schema.sql        # SQL para criar a tabela e políticas de segurança
├── netlify.toml          # Configuração de deploy no Netlify
└── .gitignore
```

---

## Setup (passo a passo)

### 1. Supabase

1. Acesse [supabase.com](https://supabase.com) e crie uma conta
2. Crie um novo projeto (anote a senha do banco)
3. Vá em **SQL Editor → New Query**, cole o conteúdo de `supabase/schema.sql` e execute
4. Vá em **Project Settings → API**:
   - Copie a **Project URL**
   - Copie a **anon public key**
5. Abra `src/js/config.js` e substitua:
   ```js
   export const SUPABASE_URL      = 'SUA_PROJECT_URL';
   export const SUPABASE_ANON_KEY = 'SUA_ANON_KEY';
   ```

### 2. GitHub

1. Crie um repositório no GitHub (pode ser privado)
2. Suba os arquivos:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/SEU_USUARIO/SEU_REPO.git
   git push -u origin main
   ```

### 3. Netlify

1. Acesse [netlify.com](https://netlify.com) e crie uma conta
2. Clique em **Add new site → Import an existing project**
3. Conecte ao GitHub e selecione o repositório
4. As configurações de build são detectadas automaticamente via `netlify.toml`:
   - **Publish directory:** `src`
5. Clique em **Deploy site**

Pronto. A cada `git push` na branch `main`, o Netlify atualiza o site automaticamente.

---

## Variáveis de ambiente (opcional — mais seguro)

Em vez de deixar as credenciais no `config.js`, você pode usar variáveis de ambiente no Netlify:

1. No Netlify: **Site settings → Environment variables**
2. Adicione:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
3. Atualize o `config.js` para ler essas variáveis (requer um step de build)

> Para o setup atual (HTML estático sem bundler), deixar no `config.js` é seguro —  
> a `anon key` do Supabase é pública por design, e a segurança real vem do Row Level Security (RLS).

---

## Autenticação

- Cadastro com e-mail + senha
- Confirmação de e-mail (configurável no Supabase em **Authentication → Email Templates**)
- Para desativar a confirmação em desenvolvimento: **Authentication → Providers → Email → Disable email confirmations**
