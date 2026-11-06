from api.main import app

# Vercel Serverless Function entrypoint
# Exposes the FastAPI application directly
handler = app

