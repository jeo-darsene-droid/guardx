#!/bin/bash
echo "🔥 Starting Guard-X Dashboard..."

# Kill any existing processes on the ports
lsof -ti:8000 | xargs kill -9 2>/dev/null || true
lsof -ti:5173 | xargs kill -9 2>/dev/null || true

# Install backend deps and start server
cd "$(dirname "$0")/backend"
pip install -r requirements.txt -q 2>/dev/null
uvicorn main:app --reload --port 8000 &
BACKEND_PID=$!

# Install frontend deps and start dev server
cd ../frontend
npm install -q 2>/dev/null
npm run dev &
FRONTEND_PID=$!

# Wait a moment for servers to start
sleep 3

echo ""
echo "✅ Guard-X Dashboard is running!"
echo "   📊 Frontend:  http://localhost:5173"
echo "   🔧 Backend:   http://localhost:8000"
echo ""
echo "   Press Ctrl+C to stop both servers."

# Open browser (macOS)
open http://localhost:5173 2>/dev/null || true

# Wait for either process to exit
wait $BACKEND_PID $FRONTEND_PID
