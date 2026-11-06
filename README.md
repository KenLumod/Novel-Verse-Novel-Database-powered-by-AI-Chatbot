# NovelVerse

NovelVerse helps readers find web novels by title or by the kind of story they want. Browse the catalog, explore genres, open a novel’s details, or describe a plot and ask the chat assistant for a match.

## What’s in the site

- **Home** — popular titles, recently added titles, genre links, and a rotating cover display.
- **Library** — title and author search, genre and status filters, sorting, and pagination.
- **Novel details** — descriptions and catalog information, with links to related books.
- **Chat assistant** — questions about a named novel, plot-based title identification, and recommendations.
- **Admin** — a sign-in page for authorized catalog edits.

## How chat search works

1. The browser sends the message and recent chat turns to the Python API.
2. A title question is looked up by title. A plot or recommendation request is compared with the catalog using description embeddings and matching fields such as title, alternate names, author, genre, tags, language, year, and chapter count.
3. The strongest catalog matches and recent chat turns are given to the language model to write a conversational answer. Matching novels are returned as clickable cards alongside the reply.

The search model and the language model have separate roles: one finds likely books in the catalog; the other explains the matches. If the chat API is unavailable, the chatbot reports the problem rather than presenting bundled sample books as live results. The home and library pages can use the small bundled sample catalog when live catalog requests fail.

## Run locally

Use Python 3.12. In PowerShell, from the project folder:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements-local.txt
Copy-Item .env.example .env
```

Fill in the local settings in `.env`, then start the site and API:

```powershell
python -m uvicorn api.main:app --host 127.0.0.1 --port 8000 --reload
```

Open [http://127.0.0.1:8000](http://127.0.0.1:8000). Keep the terminal running while you use the site. The API documentation is at [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs).

## Project layout

| Path | Contents |
| --- | --- |
| `index.html`, `library.html`, `novel.html`, `about.html`, `admin.html` | Website pages |
| `css/` | Theme, layout, responsive rules, and chat styling |
| `js/` | Page interactions, chat interface, and sample catalog |
| `api/main.py` | Web API, admin authorization, and local static file serving |
| `api/recommender.py` | Catalog search, query embeddings, and model responses |
| `api/auth.py` | Admin password verification and signed sessions |
| `scripts/ingest_novels.py` | Import a novel spreadsheet into the catalog |

The source novel spreadsheet is not included. The importer expects an Excel workbook with a `Sheet1` tab and columns including `novel_id`, `title`, and `description`.
