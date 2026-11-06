import os
import argparse
import sys
import openpyxl
from dotenv import load_dotenv
from supabase import create_client, Client
from tqdm import tqdm

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_KEY")
EMBEDDING_PROVIDER = os.getenv("EMBEDDING_PROVIDER", "local")

if not SUPABASE_URL or not SUPABASE_KEY or "your-project" in SUPABASE_URL:
    print("Error: Please set SUPABASE_URL and SUPABASE_KEY in your .env file before running.")
    sys.exit(1)

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

# Load Embedding Model
print(f"Loading embedding provider: {EMBEDDING_PROVIDER}...")
if EMBEDDING_PROVIDER == "local":
    from sentence_transformers import SentenceTransformer
    embedder = SentenceTransformer("all-MiniLM-L6-v2")
    def get_embeddings(texts):
        return embedder.encode(texts, show_progress_bar=False, normalize_embeddings=True).tolist()
else:
    raise ValueError(f"Provider {EMBEDDING_PROVIDER} not configured yet. Use 'local'.")


def ingest_dataset(file_path: str, batch_size: int = 50, limit: int = None):
    print(f"Opening dataset from: {file_path}")
    wb = openpyxl.load_workbook(file_path, read_only=True)
    ws = wb["Sheet1"]

    headers = [cell.value for cell in next(ws.iter_rows(min_row=1, max_row=1))]
    headers_map = {name: idx for idx, name in enumerate(headers)}

    total_rows = ws.max_row - 1
    if limit:
        total_rows = min(total_rows, limit)

    print(f"Total rows to ingest: {total_rows} in batches of {batch_size}")

    batch_records = []
    batch_descriptions = []
    processed_count = 0

    pbar = tqdm(total=total_rows, desc="Ingesting Novels")

    for row in ws.iter_rows(min_row=2, max_row=total_rows + 1, values_only=True):
        desc = row[headers_map["description"]]
        if not desc or not str(desc).strip():
            continue

        novel_record = {
            "novel_id": int(row[headers_map["novel_id"]]),
            "title": str(row[headers_map["title"]] or "Untitled"),
            "associated_names": str(row[headers_map.get("associated_names")] or ""),
            "img_url": str(row[headers_map.get("img_url")] or ""),
            "genres": str(row[headers_map.get("genres")] or ""),
            "tags": str(row[headers_map.get("tags")] or ""),
            "description": str(desc),
            "rating": str(row[headers_map.get("rating")] or ""),
            "language": str(row[headers_map.get("language")] or ""),
            "authors": str(row[headers_map.get("authors")] or ""),
            "year": int(row[headers_map.get("year")]) if row[headers_map.get("year")] and str(row[headers_map.get("year")]).isdigit() else None,
            "status_coo": str(row[headers_map.get("status_coo")] or ""),
            "chapters": str(row[headers_map.get("chapters")] or "")[:500]  # truncate long json string
        }

        batch_records.append(novel_record)
        # CRITICAL REQUIREMENT: Use ONLY the description for embedding generation!
        batch_descriptions.append(str(desc))

        if len(batch_records) >= batch_size:
            # 1. Compute embeddings for descriptions
            embeddings = get_embeddings(batch_descriptions)
            for rec, emb in zip(batch_records, embeddings):
                rec["embedding"] = emb

            # 2. Upsert to Supabase
            try:
                supabase.table("novels").upsert(batch_records, on_conflict="novel_id").execute()
            except Exception as e:
                print(f"\nError during upsert batch ({type(e).__name__}).")

            pbar.update(len(batch_records))
            processed_count += len(batch_records)
            batch_records = []
            batch_descriptions = []

    # Final batch
    if batch_records:
        embeddings = get_embeddings(batch_descriptions)
        for rec, emb in zip(batch_records, embeddings):
            rec["embedding"] = emb
        try:
            supabase.table("novels").upsert(batch_records, on_conflict="novel_id").execute()
        except Exception as e:
            print(f"\nError in final batch ({type(e).__name__}).")
        pbar.update(len(batch_records))
        processed_count += len(batch_records)

    pbar.close()
    wb.close()
    print(f"\nSuccessfully ingested {processed_count} novels with description embeddings into Supabase.")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Ingest novel dataset into Supabase with vector embeddings")
    parser.add_argument("--file", default=r"c:\Users\Kenneth Lumod\Downloads\cleaned_novels.xlsx", help="Path to cleaned dataset")
    parser.add_argument("--batch-size", type=int, default=50, help="Batch size for processing and upserting")
    parser.add_argument("--limit", type=int, default=None, help="Optional record limit for testing")

    args = parser.parse_args()
    ingest_dataset(args.file, args.batch_size, args.limit)

