"""Supabase client singleton for Guard-X."""
import os
from supabase import create_client, Client

# Load from environment — set via .env locally or Vercel env vars in production
SUPABASE_URL = os.environ.get("SUPABASE_URL", "")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

_client = None


def get_db() -> Client:
    """Return a cached Supabase client instance."""
    global _client
    if _client is None:
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise RuntimeError(
                "SUPABASE_URL and SUPABASE_SERVICE_KEY environment variables must be set."
            )
        _client = create_client(SUPABASE_URL, SUPABASE_KEY)
    return _client
