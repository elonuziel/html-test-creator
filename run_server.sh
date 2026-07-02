#!/bin/bash

# Port to run the server on
PORT=8000
URL="http://localhost:$PORT/web/index.html"

echo "=================================================="
echo " Starting Interactive Quiz Server on Port $PORT..."
echo "=================================================="

# Function to open the browser once the server is starting
open_browser() {
    # Wait a moment for the server to spin up
    sleep 1
    if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$URL"
    elif command -v open >/dev/null 2>&1; then
        open "$URL"
    elif command -v explorer.exe >/dev/null 2>&1; then
        explorer.exe "$URL"
    else
        echo " Could not detect default browser launcher."
    fi
    echo "Please open your browser and navigate to:"
    echo "  $URL"
    echo "=================================================="
}

# Run the browser opener in the background
open_browser &

# Determine correct Python executable and start server
if command -v python3 >/dev/null 2>&1; then
    python3 -m http.server $PORT
elif command -v python >/dev/null 2>&1; then
    python -m http.server $PORT
else
    echo "Error: Python is not installed. Please install Python to run the server."
    exit 1
fi
