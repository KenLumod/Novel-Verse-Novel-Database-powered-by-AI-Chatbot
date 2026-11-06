<div align="center">

# NovelVerse

### Find a web novel by describing the story you want.

Browse a live novel catalog, look up a title, or ask the chat assistant for stories with a certain plot, character, or vibe.

**HTML · CSS · JavaScript · FastAPI · Supabase · Groq**

</div>

---

## What the site does

- **Home:** shows popular and recently added novels, plus genres to explore.
- **Library:** searches titles and authors, filters by genre or status, and sorts the results.
- **Novel pages:** show a novel’s description and catalog details, with links to similar titles.
- **Chat assistant:** answers questions about a named novel, identifies titles from plot descriptions, and finds recommendations from the catalog. It keeps recent chat turns when you move between site pages in the same tab.
- **Admin:** lets the signed-in administrator add, edit, and delete catalog records.

## How it works

The site is plain HTML, CSS, and JavaScript; it has no frontend build step. On Vercel, the static pages and assets are served by Vercel, while requests under `/api` go to the FastAPI Python function.

For catalog browsing, the browser calls FastAPI routes such as `/api/novels` and `/api/stats`. FastAPI reads the live records from Supabase. The home and library pages can show the small bundled sample catalog in `js/data.js` if the live API is unavailable. The chatbot does not pretend those samples are live search results; it needs the API and catalog connection to answer novel searches.

For a chat request, `js/chatbot.js` sends the current message and recent conversation to `POST /api/recommend`. The API:

1. Looks up an exact or close title for questions about a named novel.
2. For plot searches, embeds the request into a 384-number vector using `all-MiniLM-L6-v2` and asks Supabase `pgvector` for similar descriptions.
3. Also checks catalog text fields such as title, alternate names, authors, genres, tags, rating, language, year, and chapter count.
4. Sends the best catalog entries and recent chat turns to the configured language model, which writes the reply. The matching records are returned separately for the clickable novel cards.

The embedding model and the language model do different jobs: the embedding finds likely catalog matches; Groq writes the conversational explanation. Locally, embeddings use the downloaded sentence-transformer model. In Vercel, they use Hugging Face inference so the model files do not need to be included in the serverless function.

## Run locally

You’ll need Python 3.12. In PowerShell, from the project folder:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-local.txt
Copy-Item .env.example .env
```

Add your Supabase URL and key, embedding settings, and LLM settings to `.env`. Keep this file private; it is ignored by Git. For local semantic search, use `EMBEDDING_PROVIDER=local`.

Start the app:

```powershell
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). The FastAPI docs are at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs). The server must stay running while you use the site.

## Set up Supabase

Supabase is the database and vector search service; it does not host this website.

1. Create a Supabase project.
2. Open its **SQL Editor** and run [`supabase_schema.sql`](supabase_schema.sql). This enables `pgvector`, creates the `novels` table and vector index, enables row-level security, and adds the `match_novels` RPC used by semantic search.
3. Add novel records and their 384-dimensional embeddings. The source spreadsheet is not in this repository. If you have the Excel dataset, install `requirements-local.txt`, set `SUPABASE_URL` and `SUPABASE_KEY` in `.env`, then run:

   ```powershell
   python scripts/ingest_novels.py --file "C:\path\to\cleaned_novels.xlsx"
   ```

   The workbook needs a `Sheet1` sheet with `novel_id`, `title`, and `description` columns, along with the optional catalog columns used by the site. The importer embeds each description and upserts the record. You can also add records through the admin page after setting up admin credentials.

## Deploy to Vercel

Vercel hosts the frontend and runs FastAPI. The existing [`vercel.json`](vercel.json) routes API requests to `api/index.py`; use the repository root as the Vercel Root Directory. Import the GitHub repository in Vercel, add the server environment variables listed in [`BUILD.md`](BUILD.md), then deploy. The Hugging Face token is needed for hosted query embeddings; the Groq key and an enabled Groq model are needed for LLM-written replies.

After deployment, check the site, `/api/stats`, a catalog search, the chatbot, and admin sign-in. If you change a Vercel environment variable, redeploy for the new value to take effect.

## Project files

| Path | Purpose |
| --- | --- |
| `index.html`, `library.html`, `novel.html`, `about.html`, `admin.html` | Site pages |
| `css/` | Layout, theme, responsive rules, and chatbot styling |
| `js/` | Page behavior, chat interface, and bundled sample catalog |
| `api/main.py` | FastAPI routes, server-side admin checks, and static files for local use |
| `api/recommender.py` | Query embeddings, Supabase search, and LLM responses |
| `api/auth.py` | Password verification and signed admin sessions |
| `api/index.py` | Vercel Python entry point |
| `supabase_schema.sql` | Database table, security policy, vector index, and RPC |
| `scripts/ingest_novels.py` | Excel-to-Supabase catalog importer |
| `BUILD.md` | Current setup and deployment details |
