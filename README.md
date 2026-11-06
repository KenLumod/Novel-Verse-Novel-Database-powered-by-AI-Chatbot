# NovelVerse

NovelVerse is a web novel catalog with a conversational discovery assistant. The site is plain HTML, CSS, and JavaScript. A FastAPI service handles catalog requests, admin edits, semantic search, and the model-generated chat replies. Novel records and their search embeddings live in Supabase.

## Run it locally

Use Python 3.12. In PowerShell, from this folder:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-local.txt
Copy-Item .env.example .env
```

Edit `.env` with your Supabase connection and AI provider settings. For local semantic search, leave `EMBEDDING_PROVIDER=local`. The first search loads the `all-MiniLM-L6-v2` embedding model. To start the site:

```powershell
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
```

Open <http://127.0.0.1:8000>. The API docs are at <http://127.0.0.1:8000/docs>. Keep the server running while you use the site.

## Supabase setup

Run [`supabase_schema.sql`](supabase_schema.sql) in the Supabase SQL Editor. It creates the `novels` table, vector index, row-level security policy, and `match_novels` search function.

The spreadsheet used to populate the catalog is not included in this repository. To load one, install the local requirements, set `SUPABASE_URL` and `SUPABASE_KEY` in `.env`, and run:

```powershell
python scripts/ingest_novels.py --file "C:\path\to\cleaned_novels.xlsx"
```

The workbook needs a `Sheet1` sheet with columns such as `novel_id`, `title`, and `description`. The importer creates embeddings from descriptions and upserts records into Supabase.

## Admin login

Set `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, and `ADMIN_SECRET` in the server environment. The API checks a PBKDF2-SHA256 password hash and issues an HTTP-only, signed session cookie; do not put the admin password or signing secret in frontend code.

To generate a password hash in PowerShell, run this and save its output as `ADMIN_PASSWORD_HASH`:

```powershell
python -c 'import getpass,secrets,hashlib; p=getpass.getpass("Admin password: "); n=200000; s=secrets.token_hex(16); h=hashlib.pbkdf2_hmac("sha256",p.encode(),s.encode(),n).hex(); print(f"pbkdf2_sha256${n}${s}${h}")'
```

Generate a separate signing secret with `python -c "import secrets; print(secrets.token_urlsafe(48))"`.

## Deploy to Vercel

The root [`vercel.json`](vercel.json) routes `/api/*` to the FastAPI function in [`api/index.py`](api/index.py), and serves the site files. Import this repository into Vercel with the repository root as the Root Directory.

Add these variables in **Project Settings → Environment Variables** for the environments you plan to use:

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | Your Supabase project URL |
| `SUPABASE_KEY` | Supabase service-role key; server-side only |
| `EMBEDDING_PROVIDER` | `huggingface` |
| `HF_TOKEN` | Hugging Face token with inference access |
| `LLM_PROVIDER` | `groq` |
| `GROQ_API_KEY` | Your Groq API key |
| `GROQ_MODEL` | A model enabled for your Groq account; defaults to `openai/gpt-oss-20b` |
| `ADMIN_USERNAME` | The admin login name you choose |
| `ADMIN_PASSWORD_HASH` | Hash generated above |
| `ADMIN_SECRET` | A separate random signing secret |

`COOKIE_SECURE=true` is also supported; Vercel HTTPS already enables secure cookies automatically. The Vercel embedding setting calls Hugging Face, so it avoids packaging the local sentence-transformer model. After saving environment variables, deploy or redeploy so the function receives them.

## Keep secrets out of Git

Put local credentials in `.env`; `.gitignore` excludes it and `.vercelignore` keeps it out of Vercel uploads. Only `.env.example`, with placeholder values, belongs in Git. Never put service-role keys, provider keys, or admin secrets in browser JavaScript.
