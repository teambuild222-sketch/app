# ARCHIVED — superseded by backend/app/main.py. Kept for reference only; not run.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI(title="SIMSOR Mobile API", version="1.0.0")

# Mobile app origins: Vite dev, Capacitor WebView, and installable PWA
MOBILE_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://localhost",
    "capacitor://localhost",
    "ionic://localhost",
    "http://localhost",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=MOBILE_CORS_ORIGINS,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|10\.0\.2\.2)(:\d+)?",
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["*"],
)


@app.get("/api/message")
async def read_message() -> dict:
    return {"message": "Hello from SIMSOR mobile backend!"}


@app.get("/api/health")
async def health_check() -> dict:
    return {"status": "ok", "platform": "mobile-api"}
