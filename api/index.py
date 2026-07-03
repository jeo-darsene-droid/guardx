import sys
import os

# Add the backend directory to the Python path so that
# "from routes import ..." and "from utils import ..." work correctly.
backend_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "backend")
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

# Re-export the FastAPI app from backend/main.py
from main import app  # noqa: E402, F401
