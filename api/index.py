import sys
import os

# Add the backend directory to the Python path so that
# "from routes import ..." and "from utils import ..." work correctly.
backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Re-export the FastAPI app from backend/main.py.
# If the import crashes (missing dep, bad path, etc.), expose the traceback
# via HTTP instead of Vercel's opaque INTERNAL_FUNCTION_INVOCATION_FAILED.
try:
    from main import app  # noqa: E402, F401
except Exception:
    import traceback
    _startup_error = traceback.format_exc()
    from fastapi import FastAPI  # noqa: E402
    from fastapi.responses import JSONResponse  # noqa: E402

    app = FastAPI(title="Guard-X startup failure")

    @app.api_route("/{path:path}", methods=["GET", "POST", "PUT", "DELETE"])
    def _startup_failure(path: str):
        return JSONResponse(
            status_code=500,
            content={"error": "Backend startup failed", "traceback": _startup_error},
        )
