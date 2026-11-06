# NovelVerse — Production Architecture & Build Specification (BUILD.md)

> **Document Version:** 2.0.0  
> **Last Updated:** November 5, 2026  
> **System Scope:** AI-Powered Semantic Novel Discovery Platform  
> **Repository Root:** `c:\Users\Kenneth Lumod\Downloads\AI Novel Recommendation Chatbot\`

---

## 1. Project Overview & Guiding Principles

NovelVerse is an AI-powered web novel discovery platform where users can describe in natural language any kind of story, trope, or character dynamic (e.g., *"I want a story where the MC is strong but gets betrayed"*).

### Strict Semantic Rules
- **Semantic Source:** Recommendations are driven **EXCLUSIVELY by the `description` column** of the novel dataset.
- **Zero Hallucination:** The system retrieves matching candidates strictly from your database and uses LangChain to explain the matches based solely on those descriptions.
- **Visual Continuity:** The frontend preserves 100% of the dark charcoal (`#171923`) and purple accent (`#A78BFA`) design, responsive left drawer chatbot, and card grid layouts.

---

## 2. Technology Stack

| Layer | Chosen Technology | Rationale & Free-Tier Characteristics |
|---|---|---|
| **Frontend** | Vanilla HTML5, CSS3, ES6+ JS | Zero bundler overhead, instant loads, preserves design |
| **Frontend Hosting** | **Vercel** | Free global CDN, continuous Git deployments |
| **Backend API** | **FastAPI (Python 3.12 on Vercel)** | Typed API endpoints deployed as Vercel Python Functions |
| **Database & Vector Search**| **Supabase PostgreSQL (`pgvector`)** | Free tier (500MB database, pgvector indexing, HNSW cosine distance search) |
| **Text Embeddings** | **`all-MiniLM-L6-v2` (384 dimensions)** | Local model for development; Hugging Face hosted inference on Vercel to keep the function bundle small |
| **LLM & Orchestration** | **Groq Cloud (`openai/gpt-oss-20b`)** | Hosted recommendation explanations; usage limits depend on the Groq account tier |

---

## 3. Project Directory Map

```
AI Novel Recommendation Chatbot/
│
├── api/
│   ├── main.py              # FastAPI application server and endpoints
│   ├── index.py             # Vercel serverless function entrypoint
│   └── recommender.py       # Vector search, query embedding, and LangChain orchestrator
│
├── scripts/
│   └── ingest_novels.py     # Batch embedder and upsert script for cleaned_novels.xlsx
│
├── css/
│   ├── styles.css           # Core design tokens, grid systems, card components
│   ├── chatbot.css          # Chat drawer, message bubbles, recommendation card styles
│   └── responsive.css       # Mobile drawer, navigation hamburger, adaptive layouts
│
├── js/
│   ├── chatbot.js           # Chatbot controller (API call with offline client fallback)
│   ├── data.js              # In-memory catalog dataset (used for browsing & offline fallback)
│   ├── app.js               # Homepage hero particles, counters, and popular grids
│   ├── library.js           # Multi-criteria filtering, search, and pagination
│   ├── novel-detail.js      # Novel detail viewer with API & local resolution
│   └── about.js             # Interactive prompt chips dispatcher
│
├── index.html               # Platform homepage
├── library.html             # Catalog browsing and filtering
├── novel.html               # Detailed novel profile page
├── about.html               # System documentation & guided queries
├── supabase_schema.sql      # Supabase SQL migration for pgvector & match_novels RPC
├── requirements.txt         # Lightweight Python runtime dependencies
├── requirements-local.txt   # Runtime plus local model and ingestion dependencies
├── .python-version          # Vercel Python runtime version (3.12)
├── vercel.json              # Vercel routing and Python serverless configuration
├── .env.example             # Template for required environment variables
├── PLAN.md                  # Implementation roadmap
└── BUILD.md                 # This definitive architecture and build manual
```

---

## 4. Database Setup & Vector Migration

### Step 1: Create Supabase Project
1. Log in to [Supabase](https://supabase.com) and create a new project.
2. Open the **SQL Editor** in the left sidebar.
3. Open [`supabase_schema.sql`](file:///c:/Users/Kenneth%20Lumod/Downloads/AI%20Novel%20Recommendation%20Chatbot/supabase_schema.sql) from this repository, paste the contents into the SQL Editor, and click **Run**.

### What this creates:
- Enables the `vector` PostgreSQL extension.
- Creates the `novels` table with fields for `novel_id`, `title`, `img_url`, `description`, `authors`, `rating`, `status_coo`, and `embedding vector(384)`.
- Builds an **HNSW vector index** using `vector_cosine_ops` for millisecond-speed nearest-neighbor searches.
- Declares the `match_novels` stored procedure (RPC) for calculating cosine distance:
  $$\text{similarity} = 1 - (\text{embedding} \Leftrightarrow \text{query\_embedding})$$

---

## 5. Dataset Ingestion (Generating Embeddings)

Embeddings are pre-computed during ingestion so searches run instantly without repetitive calculation.

### Run the Ingestion Script:
```powershell
# 1. Install required packages
pip install -r requirements-local.txt

# 2. Copy .env.example to .env and insert your Supabase credentials
copy .env.example .env

# 3. Test with a small batch of 20 novels
python scripts/ingest_novels.py --limit 20

# 4. Ingest the complete 11,700 records dataset
python scripts/ingest_novels.py --file "c:\Users\Kenneth Lumod\Downloads\cleaned_novels.xlsx" --batch-size 100
```

> **Note on Semantic Matching:** The script strictly embeds `row['description']`. No titles, genres, or tropes are appended into the vector text.

---

## 6. Running Locally

### Start Backend API:
```powershell
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
```
API Documentation will be available at: `http://127.0.0.1:8000/docs`

### Open the app:
With the FastAPI server running, open `http://127.0.0.1:8000` in your browser. FastAPI serves both the frontend and `/api` routes from the same origin, which is required for admin sign-in, novel editing, and deletion. A static server such as `python -m http.server 3000` can display the HTML, but it cannot handle these database-backed actions.

---

## 7. Vercel Deployment

1. Initialize Git repository and commit:
   ```powershell
   git init
   git add .
   git commit -m "feat: AI novel discovery website with FastAPI & Supabase pgvector"
   ```
2. Push to GitHub.
3. Import the repository into [Vercel](https://vercel.com).
4. In Vercel Project Settings $\rightarrow$ **Environment Variables**, add:
   - `SUPABASE_URL`
   - `SUPABASE_KEY`
   - `EMBEDDING_PROVIDER` (`huggingface`)
   - `HF_TOKEN` (Hugging Face token with Inference Providers permission)
   - `LLM_PROVIDER` (`groq`)
   - `GROQ_API_KEY`
   - `GROQ_MODEL` (`openai/gpt-oss-20b`)
   - `ADMIN_USERNAME`
   - `ADMIN_PASSWORD_HASH` (a PBKDF2-SHA256 hash for the admin password)
   - `ADMIN_SECRET` (a unique, randomly generated signing secret)
5. Click **Deploy**. Vercel will build the static HTML/CSS/JS frontend alongside the Python serverless function routed via `vercel.json`. The deployment uses the hosted `all-MiniLM-L6-v2` embedding service, so it does not bundle or download PyTorch/model files. Local development continues to use the local model through `requirements-local.txt`.

---

## 8. Status Checklist

- [x] Full source code inspection (HTML, CSS, JS, dataset).
- [x] Verified cleaned dataset (11,700 rows, 100% valid descriptions and image URLs).
- [x] Created `supabase_schema.sql` (pgvector + HNSW index + `match_novels` RPC).
- [x] Created `scripts/ingest_novels.py` (description-only embedding generator & batch upsert).
- [x] Created `api/recommender.py` (query embedder + LangChain Groq grounded explanation).
- [x] Created `api/main.py` (FastAPI endpoints: `/api/recommend`, `/api/novels/{id}`).
- [x] Created `api/index.py` & `vercel.json` (Vercel Serverless deployment).
- [x] Connected `js/chatbot.js` to `/api/recommend` with fallback support.
- [x] Connected `js/novel-detail.js` to support API novel resolution.
- [x] Preserved 100% of the existing frontend design, styling, and animations.
- [x] Documented environment variables in `.env.example`.
- [x] Comprehensive documentation in `BUILD.md`.

