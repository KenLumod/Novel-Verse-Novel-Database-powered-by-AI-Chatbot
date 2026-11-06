# Technical Architecture & Implementation Plan: AI Novel Recommendation System

## 1. Project Overview & Findings

### 1.1 Dataset Inspection (`cleaned_novels.xlsx`)
- **Location:** `C:\Users\Kenneth Lumod\Downloads\cleaned_novels.xlsx`
- **Total Records:** **11,700 novels**
- **Columns (22):** `novel_id`, `title`, `associated_names`, `img_url`, `genres`, `tags`, `description`, `related_series`, `recommendations`, `rating`, `language`, `authors`, `artists`, `year`, `status_coo`, `weekly_rank`, `monthly_rank`, `all_time_rank`, `monthly_rank_reading_list`, `all_time_rank_reading_list`, `total_reading_list_rank`, `chapters`
- **Data Quality:** 
  - Descriptions: 100% populated (0 nulls), average length ~705 characters.
  - Image URLs: 100% valid HTTP links from CDN/novelupdates.
  - Ratings & Status: Present across all records.
- **Strict Requirement Adherence:** **ONLY the `description` column** is used for generating vector embeddings and performing semantic similarity search. Titles, images, authors, ratings, and tags are retained strictly for display and identification.

---

## 2. Recommended Technology Stack (Free-Tier & Open Source)

1. **Frontend:**
   - Existing HTML, CSS (`styles.css`, `chatbot.css`, `responsive.css`), and JavaScript.
   - Hosted on **Vercel**.
2. **Backend:**
   - **Python & FastAPI** (`api/main.py`), designed for both local development (`uvicorn`) and serverless execution on **Vercel** (`api/index.py` or `/api` routes).
3. **Database & Vector Search:**
   - **Supabase PostgreSQL** with the `pgvector` extension.
   - Table: `novels` with `id`, `novel_id`, `title`, `img_url`, `description`, `rating`, `authors`, `status`, `embedding vector(...)`.
   - RPC function: `match_novels` for cosine distance similarity matching.
4. **Embeddings:**
   - **Option A (Hosted Free API - Highly Recommended):** Google Gemini `text-embedding-004` (Free tier: up to 1,500 requests/day, 768 dimensions).
   - **Option B (Local/Offline Open Source):** Hugging Face `sentence-transformers` (`all-MiniLM-L6-v2`, 384 dimensions) — 100% free, runs locally in Python without API keys or limits.
5. **Chatbot / LLM (LangChain):**
   - **Groq Cloud API** (`openai/gpt-oss-20b`) via LangChain `ChatGroq` or the OpenAI-compatible chat completions endpoint. Usage limits depend on the Groq account tier.
   - *Alternative:* **Google Gemini 1.5 Flash / 2.0 Flash** via LangChain `ChatGoogleGenerativeAI`.

---

## 3. End-to-End Architecture Workflow

```
[User Natural Language Prompt]
           │
           ▼
[Frontend Chatbot Interface (js/chatbot.js)]
           │  (POST /api/recommend { message: "..." })
           ▼
[FastAPI Backend Engine (api/main.py)]
           │
           ├──► Step 1: Generate Embedding of User Query
           │            (ONLY the text description query)
           │
           ├──► Step 2: Supabase pgvector Similarity Search
           │            (Finds top 5 nearest descriptions via cosine similarity)
           │
           ├──► Step 3: LangChain Prompt & LLM Generation (Groq / Gemini)
           │            (Grounds response strictly on retrieved descriptions;
           │             generates conversational explanation without hallucinations)
           │
           ▼
[Frontend Response Rendering]
(Displays AI explanation message + existing `.chat-recommendation` cards with real cover images)
```

---

## 4. Implementation Stages

### Stage 1: Backend Project Setup & Environment Configuration
- Create `requirements.txt` with FastAPI, uvicorn, langchain, pydantic, supabase, python-dotenv.
- Create `.env.example` documenting all configuration keys (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `EMBEDDING_PROVIDER`, `GROQ_API_KEY`, etc.).
- Set up FastAPI app structure with CORS middleware matching Vercel deployment paths.

### Stage 2: Supabase Database Schema & Migration Script
- Provide SQL migration script to enable `pgvector`, create the `novels` table, create IVFFlat / HNSW vector index, and create the `match_novels` RPC procedure.
- Create a batch data ingestion script (`scripts/ingest_novels.py`) to parse `cleaned_novels.xlsx`, compute embeddings for `description`, and upsert records into Supabase in batches.

### Stage 3: Recommendation Engine & LangChain Integration
- Implement `api/recommender.py`:
  - Query vectorizer.
  - Supabase vector query caller.
  - LangChain grounding prompt template instructing the model to rely only on the retrieved descriptions.
- Expose `/api/recommend` endpoint returning structured recommendations + conversational summary.

### Stage 4: Frontend Seamless Connection
- Update `js/chatbot.js` to call the `/api/recommend` endpoint with fallback to local mock if server is offline.
- Keep the exact existing visual design, animations, and card layouts (`.chat-recommendation`), updating cards to display real `img_url` and novel IDs.
- Ensure `novel.html` can fetch novel details directly from the API / Supabase by `novel_id`.

### Stage 5: BUILD.md & Documentation Update
- Thoroughly update `BUILD.md` with step-by-step setup, Supabase SQL schema, ingestion commands, local dev commands, and Vercel deployment guide.

