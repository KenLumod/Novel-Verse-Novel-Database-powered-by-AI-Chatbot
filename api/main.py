import ast
import os
import re
import time
from collections import defaultdict, deque
from fastapi import Cookie, FastAPI, HTTPException, Query, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any

from api.auth import COOKIE_MAX_AGE, COOKIE_NAME, credentials_match, issue_token, read_token
from api.recommender import RecommendationServiceError, generate_recommendation_response, search_novels_by_similarity

_stats_cache = {"ts": 0.0, "payload": None}
_STATS_TTL_SECONDS = 600

app = FastAPI(
    title="NovelVerse AI Recommendation API",
    description="Vector-backed semantic search and LangChain recommendation system for web novels",
    version="1.0.0"
)

# Enable CORS for frontend and deployment
# The site and API are same-origin in production. Cross-origin access must be
# explicitly configured; wildcard origins are unsafe with credentialed cookies.
cors_origins = [origin.strip().rstrip("/") for origin in os.getenv("CORS_ORIGINS", "").split(",") if origin.strip()]
if cors_origins:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
        allow_headers=["Content-Type"],
    )

_rate_windows = defaultdict(deque)
_RATE_LIMITS = {"/api/admin/login": (5, 900), "default": (120, 60)}


@app.middleware("http")
async def security_middleware(request: Request, call_next):
    # Per-process fallback limiter. Use an edge/shared-store limiter for reliable
    # enforcement across Vercel serverless instances.
    client_ip = request.client.host if request.client else "unknown"
    rule = _RATE_LIMITS.get(request.url.path, _RATE_LIMITS["default"])
    key = (client_ip, request.url.path if request.url.path == "/api/admin/login" else "default")
    now = time.monotonic()
    hits = _rate_windows[key]
    while hits and now - hits[0] >= rule[1]:
        hits.popleft()
    if len(hits) >= rule[0]:
        return Response("Too many requests", status_code=429, headers={"Retry-After": str(rule[1])})
    hits.append(now)

    if request.url.path.startswith("/api/admin/") and request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origin = request.headers.get("origin")
        expected_origin = f"{request.url.scheme}://{request.headers.get('host', '')}".rstrip("/")
        if origin and origin.rstrip("/") != expected_origin and origin.rstrip("/") not in cors_origins:
            return Response("Invalid request origin", status_code=403)

    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=(), geolocation=()"
    if request.url.scheme == "https":
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
    return response


class RecommendationRequest(BaseModel):
    message: str = Field(..., min_length=2, max_length=4000, description="Natural language description of the novel to find")
    top_k: Optional[int] = Field(5, ge=1, le=20)
    history: List[Dict[str, str]] = Field(default_factory=list, max_length=12)


class RecommendationResponse(BaseModel):
    status: str
    message: str
    recommendations: List[Dict[str, Any]]
    explanation_status: Optional[str] = None
    explanation_error: Optional[str] = None


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=128)
    password: str = Field(..., min_length=1, max_length=1024)


class NovelWrite(BaseModel):
    novel_id: Optional[int] = None
    title: str = Field(..., min_length=1, max_length=300)
    authors: Optional[str] = Field(None, max_length=2000)
    img_url: Optional[str] = Field(None, max_length=2048, pattern=r"^https://")
    genres: Optional[str] = Field(None, max_length=5000)
    tags: Optional[str] = Field(None, max_length=10000)
    description: str = Field(..., min_length=1, max_length=100000)
    rating: Optional[str] = Field(None, max_length=100)
    language: Optional[str] = Field(None, max_length=200)
    year: Optional[int] = Field(None, ge=0, le=3000)
    status_coo: Optional[str] = Field(None, max_length=100)
    chapters: Optional[str] = Field(None, max_length=500000)


def require_admin(novelverse_admin: Optional[str]) -> str:
    username = read_token(novelverse_admin)
    if not username:
        raise HTTPException(status_code=401, detail="Admin login required")
    return username


def set_admin_cookie(response: Response, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        secure=os.getenv("COOKIE_SECURE", "").lower() == "true" or os.getenv("VERCEL", "").lower() == "1",
        samesite="lax",
        max_age=COOKIE_MAX_AGE,
        path="/",
    )


@app.post("/api/admin/login")
def admin_login(body: LoginRequest, response: Response):
    if not credentials_match(body.username, body.password):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    set_admin_cookie(response, issue_token(body.username.strip()))
    return {"username": body.username.strip()}


@app.post("/api/admin/logout")
def admin_logout(response: Response):
    response.delete_cookie(COOKIE_NAME, path="/")
    return {"ok": True}


@app.get("/api/admin/me")
def admin_me(novelverse_admin: Optional[str] = Cookie(default=None)):
    return {"username": require_admin(novelverse_admin)}


@app.post("/api/admin/novels")
def create_novel(body: NovelWrite, novelverse_admin: Optional[str] = Cookie(default=None)):
    require_admin(novelverse_admin)
    client = get_supabase()
    if not client:
        raise HTTPException(status_code=503, detail="Database not configured")
    values = body.model_dump(exclude={"novel_id"}, exclude_none=True)
    values["novel_id"] = body.novel_id or int(time.time() * 1000)
    try:
        result = client.table("novels").insert(values).select("*").execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not add novel. Check that its ID is unique and the database is available.") from None
    return result.data[0] if result.data else values


@app.put("/api/admin/novels/{novel_id}")
def update_novel(novel_id: int, body: NovelWrite, novelverse_admin: Optional[str] = Cookie(default=None)):
    require_admin(novelverse_admin)
    client = get_supabase()
    if not client:
        raise HTTPException(status_code=503, detail="Database not configured")
    values = body.model_dump(exclude={"novel_id"}, exclude_none=False)
    try:
        result = client.table("novels").update(values).eq("novel_id", novel_id).select("*").execute()
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Could not save novel. Check the fields and database connection.") from None
    if not result.data:
        raise HTTPException(status_code=404, detail="Novel not found")
    return result.data[0]


@app.delete("/api/admin/novels/{novel_id}")
def delete_novel(novel_id: int, novelverse_admin: Optional[str] = Cookie(default=None)):
    require_admin(novelverse_admin)
    client = get_supabase()
    if not client:
        raise HTTPException(status_code=503, detail="Database not configured")
    result = client.table("novels").delete().eq("novel_id", novel_id).select("novel_id").execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Novel not found")
    return {"ok": True, "novel_id": novel_id}


def parse_list_field(value: Any) -> List[str]:
    if not value:
        return []
    if isinstance(value, list):
        return [str(item).strip() for item in value if str(item).strip()]
    text = str(value).strip()
    if not text:
        return []
    quoted = [match[0] or match[1] for match in re.findall(r"'([^']*)'|\"([^\"]*)\"", text)]
    quoted = [item.strip() for item in quoted if item and item.strip()]
    if quoted:
        return quoted
    if text.startswith("["):
        try:
            parsed = ast.literal_eval(text)
            if isinstance(parsed, (list, tuple)):
                return [str(item).strip() for item in parsed if str(item).strip()]
        except (ValueError, SyntaxError):
            pass
    return [part.strip(" '\"") for part in re.split(r"[,;/|]+", text) if part.strip(" '\"")]


def parse_status(value: Any) -> str:
    if not value:
        return ""
    text = str(value)
    lower = text.lower()
    if "ongoing" in lower:
        return "Ongoing"
    if "hiatus" in lower:
        return "Hiatus"
    if "complete" in lower:
        return "Completed"
    return text.strip()


def get_supabase():
    from api.recommender import supabase_client
    return supabase_client


def compute_catalog_stats() -> Dict[str, Any]:
    now = time.time()
    cached = _stats_cache["payload"]
    if cached and now - _stats_cache["ts"] < _STATS_TTL_SECONDS:
        return cached

    supabase_client = get_supabase()
    empty = {
        "novels": 0,
        "authors": 0,
        "genres": 0,
        "genre_counts": [],
        "statuses": []
    }
    if not supabase_client:
        return empty

    head = supabase_client.table("novels").select("novel_id", count="exact", head=True).execute()
    total = head.count or 0
    authors = set()
    genre_counts: Dict[str, int] = {}
    statuses = set()
    page_size = 1000
    offset = 0
    started = time.time()

    while offset < total:
        if time.time() - started > 6:
            break
        page = supabase_client.table("novels").select("authors, genres, status_coo").range(
            offset, offset + page_size - 1
        ).execute()
        rows = page.data or []
        if not rows:
            break
        for row in rows:
            author = (row.get("authors") or "").strip()
            if author:
                authors.add(author)
            for genre in parse_list_field(row.get("genres")):
                genre_counts[genre] = genre_counts.get(genre, 0) + 1
            status = parse_status(row.get("status_coo"))
            if status:
                statuses.add(status)
        offset += page_size
        if len(rows) < page_size:
            break

    payload = {
        "novels": total,
        "authors": len(authors),
        "genres": len(genre_counts),
        "genre_counts": [
            {"name": name, "count": count}
            for name, count in sorted(genre_counts.items(), key=lambda item: (-item[1], item[0]))
        ],
        "statuses": sorted(statuses)
    }
    _stats_cache["ts"] = now
    _stats_cache["payload"] = payload
    return payload


@app.get("/api/stats")
def get_stats():
    """Live catalog totals for homepage counters."""
    stats = compute_catalog_stats()
    return {
        "novels": stats["novels"],
        "authors": stats["authors"],
        "genres": stats["genres"]
    }


@app.get("/api/filters")
def get_filters():
    """Dynamic genre and status options for library and explore sections."""
    stats = compute_catalog_stats()
    return {
        "genres": stats["genre_counts"],
        "statuses": stats["statuses"]
    }


@app.post("/api/recommend", response_model=RecommendationResponse)
def get_recommendation(request: RecommendationRequest):
    """
    Accepts natural-language requests, embeds the query, queries Supabase pgvector,
    and returns matching novel records alongside a grounded LLM explanation.
    """
    if not request.message or not request.message.strip():
        raise HTTPException(status_code=400, detail="Query message cannot be empty")

    try:
        safe_history = [
            {"role": item.get("role", ""), "content": item.get("content", "")[:2000]}
            for item in request.history
            if item.get("role") in {"user", "assistant"} and item.get("content")
        ]
        return generate_recommendation_response(request.message, top_k=request.top_k, history=safe_history)
    except RecommendationServiceError as exc:
        raise HTTPException(status_code=503, detail=str(exc)) from exc


@app.get("/api/novels")
def list_novels(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0, le=1000000),
    search: Optional[str] = Query(None, max_length=200),
    genre: Optional[str] = Query(None, max_length=100),
    status: Optional[str] = Query(None, max_length=100),
    sort: Optional[str] = None
):
    """Retrieves novels from Supabase database for library display."""
    supabase_client = get_supabase()
    if not supabase_client:
        return {"data": [], "count": 0}

    query = supabase_client.table("novels").select(
        "novel_id, title, img_url, genres, tags, description, rating, language, authors, year, status_coo, chapters",
        count="exact"
    )
    if search:
        safe = re.sub(r"[^\w\s'-]", " ", search, flags=re.UNICODE).strip()[:200]
        if not safe:
            return {"data": [], "count": 0}
        query = query.or_(f"title.ilike.%{safe}%,authors.ilike.%{safe}%")
    if genre and genre.lower() != "all":
        query = query.ilike("genres", f"%{genre}%")
    if status and status.lower() != "all":
        query = query.ilike("status_coo", f"%{status}%")

    sort_key = (sort or "title").lower()
    if sort_key in ("rating", "popular"):
        query = query.order("rating", desc=True)
    elif sort_key in ("recent", "year"):
        query = query.order("year", desc=True)
    elif sort_key == "chapters":
        query = query.order("chapters", desc=True)
    else:
        query = query.order("title", desc=False)

    res = query.range(offset, offset + limit - 1).execute()
    return {"data": res.data or [], "count": res.count or 0}


@app.get("/api/novels/{novel_id}")
def get_novel_by_id(novel_id: int):
    """Retrieves full novel information by novel_id."""
    from api.recommender import supabase_client
    if not supabase_client:
        raise HTTPException(status_code=503, detail="Database not configured")

    res = supabase_client.table("novels").select("*").eq("novel_id", novel_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Novel not found")
    return res.data[0]


# Mount static website files directly under root so both frontend and API run on the exact same port!
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
app.mount("/", StaticFiles(directory=BASE_DIR, html=True), name="static")


if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8000))
    uvicorn.run("api.main:app", host=os.getenv("HOST", "127.0.0.1"), port=port, reload=os.getenv("APP_ENV", "development") != "production")

