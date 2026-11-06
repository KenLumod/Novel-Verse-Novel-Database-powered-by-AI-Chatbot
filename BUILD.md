# Setup and deployment

This guide covers the current NovelVerse app. For a product overview and a description of the chat/search flow, see [README.md](README.md).

## 1. Create and prepare Supabase

1. Create a Supabase project.
2. In **SQL Editor**, run [`supabase_schema.sql`](supabase_schema.sql). It creates the `novels` table, enables `pgvector`, adds the HNSW index and `match_novels` function, and enables row-level security.
3. Load the novel catalog. The spreadsheet is not included in this repository. If you have the Excel file, use the local importer below. A catalog needs records and embeddings for chat search to return results.

The importer expects a workbook with a `Sheet1` tab and at least `novel_id`, `title`, and `description` columns. It reads optional fields such as `authors`, `genres`, `tags`, `rating`, `language`, `year`, `status_coo`, and `chapters` when present.

```powershell
python scripts/ingest_novels.py --file "C:\path\to\cleaned_novels.xlsx"
```

The importer uses the local `all-MiniLM-L6-v2` model to create normalized 384-dimensional embeddings from descriptions. Run it from your computer; the spreadsheet and ingestion script are excluded from the Vercel deployment upload.

## 2. Run the site locally

Use Python 3.12. In PowerShell, from the repository root:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-local.txt
Copy-Item .env.example .env
```

Set the variables in `.env`, then start FastAPI:

```powershell
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
```

The site is at `http://127.0.0.1:8000`; the API docs are at `http://127.0.0.1:8000/docs`. FastAPI serves both the site and API locally, so don’t use a static-only server for admin/database features.

For local embeddings, use `EMBEDDING_PROVIDER=local`. The first semantic search downloads the model. Vercel should use `EMBEDDING_PROVIDER=huggingface` instead.

## 3. Configure the admin account

Set `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`, and `ADMIN_SECRET`. Generate the password hash locally in PowerShell:

```powershell
python -c 'import getpass,secrets,hashlib; p=getpass.getpass("Admin password: "); n=200000; s=secrets.token_hex(16); h=hashlib.pbkdf2_hmac("sha256",p.encode(),s.encode(),n).hex(); print(f"pbkdf2_sha256${n}${s}${h}")'
```

Paste the result into `ADMIN_PASSWORD_HASH`. Generate `ADMIN_SECRET` separately:

```powershell
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

The admin password hash and signing secret belong only in server environment variables. Do not put them in JavaScript or commit `.env`.

## 4. Deploy to Vercel

1. Push the project to GitHub. Confirm `.env` is not tracked; `.gitignore` and `.vercelignore` exclude it.
2. In Vercel, import the repository and set **Root Directory** to the folder containing `vercel.json`.
3. Add these variables under **Project Settings → Environment Variables** for Production (and Preview if needed):

   | Variable | Value |
   | --- | --- |
   | `SUPABASE_URL` | Supabase project URL |
   | `SUPABASE_KEY` | Supabase service-role key, used by the server only |
   | `EMBEDDING_PROVIDER` | `huggingface` |
   | `HF_TOKEN` | Hugging Face token with inference access |
   | `LLM_PROVIDER` | `groq` |
   | `GROQ_API_KEY` | Groq API key |
   | `GROQ_MODEL` | A model enabled for the Groq account; default is `openai/gpt-oss-20b` |
   | `ADMIN_USERNAME` | Admin login name |
   | `ADMIN_PASSWORD_HASH` | Hash generated above |
   | `ADMIN_SECRET` | Random signing secret generated above |

4. Leave the Build Command and Output Directory unset; the repository’s `vercel.json` defines the Python function and static files.
5. Deploy. Afterward, check `/api/stats`, open the library, try a chat search, and sign in to the admin page.

Vercel uses Hugging Face for query embeddings, so it does not need the sentence-transformer package or model files. Groq generates chat responses separately. If Groq rejects the key or model, search can still retrieve catalog entries but the conversational explanation will fall back.

## 5. Environment variable reference

The starter file is [`.env.example`](.env.example). For local development, copy it to `.env`. For Vercel, enter the values in the project dashboard; do not upload the local `.env`.

| Variable | Needed for | Notes |
| --- | --- | --- |
| `SUPABASE_URL` | Catalog and admin API | Project URL from Supabase |
| `SUPABASE_KEY` | Catalog and admin API | Server-side service-role key; it bypasses RLS, so keep API authorization in place |
| `EMBEDDING_PROVIDER` | Chat search | `local` for development, `huggingface` on Vercel |
| `HF_TOKEN` | Hosted embeddings | Required when provider is `huggingface` |
| `LLM_PROVIDER` | Chat responses | `groq` or `gemini` in the current API code |
| `GROQ_API_KEY`, `GROQ_MODEL` | Groq replies | Model must be enabled for the account |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | Gemini replies | Use these only if `LLM_PROVIDER=gemini` |
| `ADMIN_USERNAME` | Admin login | Chosen login name |
| `ADMIN_PASSWORD_HASH` | Admin login | PBKDF2-SHA256 hash; never store the plain password here |
| `ADMIN_SECRET` | Admin sessions | Random secret used to sign the HTTP-only cookie |
| `COOKIE_SECURE` | Local HTTPS setups | Optional; Vercel HTTPS automatically marks the cookie secure |
| `CORS_ORIGINS` | Cross-origin setups only | Leave empty when frontend and API share the same Vercel domain |

## 6. Routes to check after deployment

- `GET /api/stats` — database-backed catalog counts
- `GET /api/filters` — genres and statuses
- `GET /api/novels?limit=10` — first catalog page
- `POST /api/recommend` — chatbot search and response
- `POST /api/admin/login` — admin login; protected changes require its signed cookie

The home and library pages can fall back to the sample records in `js/data.js` when the API is unavailable. The chatbot’s live search requires a working backend, Supabase catalog, and embeddings.
