"""
FastAPI Backend for Spanish Driving Theory Test (PDD)
Provides API endpoints for questions, answers, admin functionality, and user auth.
"""

import json
import os
import time
import uuid
import datetime
from collections import defaultdict
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Any, List, Optional, Union

from fastapi import Depends, FastAPI, HTTPException, Request, Response, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from database import init_db, get_db, User, UserProgress
from auth import (
    verify_password,
    hash_password,
    create_access_token,
    get_current_user,
    get_admin_user,
)

ACCESS_TOKEN_EXPIRE_DAYS = 7


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    yield


app = FastAPI(title="PDD API", version="2.0.0", lifespan=lifespan)

# CORS — credentials require explicit origins (not "*")
ALLOWED_ORIGINS = os.environ.get(
    "ALLOWED_ORIGINS", "http://localhost:3001,http://localhost:3000"
).split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Paths
BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
QUESTIONS_FILE = DATA_DIR / "questions.json"
IMAGES_DIR = DATA_DIR / "images"
FRONTEND_DIST = BASE_DIR / "frontend" / "dist"

# Ensure directories exist
DATA_DIR.mkdir(exist_ok=True)
IMAGES_DIR.mkdir(exist_ok=True)

# Mount static files for images
app.mount("/images", StaticFiles(directory=str(IMAGES_DIR)), name="images")

# Mount frontend build (if exists)
if FRONTEND_DIST.exists():
    app.mount("/pdd/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="pdd-assets")
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")


# ── Pydantic models ────────────────────────────────────────────────────────────

class Answer(BaseModel):
    number: int
    text_en: Optional[str] = None
    text_es: Optional[str] = None
    text_ru: Optional[str] = None
    is_correct: bool = False

class QuestionText(BaseModel):
    text_en: Optional[str] = None
    text_es: Optional[str] = None
    text_ru: Optional[str] = None

class ExplanationText(BaseModel):
    text_en: Optional[str] = None
    text_es: Optional[str] = None
    text_ru: Optional[str] = None

class Question(BaseModel):
    id: int
    question: QuestionText
    image: Optional[str] = None
    answers: List[Answer]
    explanation: Optional[Union[str, ExplanationText]] = None

class QuestionUpdate(BaseModel):
    question: Optional[QuestionText] = None
    image: Optional[str] = None
    answers: Optional[List[Answer]] = None
    explanation: Optional[Union[str, ExplanationText]] = None

# Auth models
class RegisterRequest(BaseModel):
    username: str
    email: str
    password: str
    honeypot: str = ""
    form_open_at: float = 0  # ms timestamp from client (Date.now())

class LoginRequest(BaseModel):
    email: str
    password: str

class UserResponse(BaseModel):
    id: str
    username: str
    email: str
    role: str

# Progress model
class ProgressData(BaseModel):
    shuffled_ids: Optional[List[int]] = None
    current_position: int = 0
    cycle_number: int = 1
    session_batch: Optional[List[int]] = None
    session_index: int = 0
    session_score: dict = {"correct": 0, "incorrect": 0}
    session_failed: List[Any] = []
    session_position: int = 0
    speed_mode: bool = False

# ── Question helpers ───────────────────────────────────────────────────────────

def load_questions() -> List[Question]:
    if not QUESTIONS_FILE.exists():
        return []
    with open(QUESTIONS_FILE, 'r', encoding='utf-8') as f:
        data = json.load(f)
        return [Question(**q) for q in data]

def save_questions(questions: List[Question]):
    with open(QUESTIONS_FILE, 'w', encoding='utf-8') as f:
        json.dump([q.model_dump() for q in questions], f, indent=2, ensure_ascii=False)


# ── Progress helper ────────────────────────────────────────────────────────────

def _get_or_create_progress(user_id: str, db: Session) -> UserProgress:
    p = db.query(UserProgress).filter(UserProgress.user_id == user_id).first()
    if not p:
        p = UserProgress(user_id=user_id)
        db.add(p)
        db.commit()
        db.refresh(p)
    return p


# ── SPA / root ─────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return RedirectResponse(url="/pdd/", status_code=302)

@app.get("/pdd/")
async def pdd_home():
    if FRONTEND_DIST.exists() and (FRONTEND_DIST / "index.html").exists():
        return FileResponse(str(FRONTEND_DIST / "index.html"))
    raise HTTPException(status_code=404, detail="Frontend not found")


# ── Auth routes ────────────────────────────────────────────────────────────────

# In-memory rate limiter for registration: {ip: [timestamp_seconds, ...]}
_reg_attempts: dict = defaultdict(list)
_REG_LIMIT = 5
_REG_WINDOW = 3600  # seconds


@app.post("/api/auth/register", response_model=UserResponse)
async def register(request: RegisterRequest, http_request: Request, response: Response, db: Session = Depends(get_db)):
    # Honeypot: bots fill hidden fields, humans don't
    if request.honeypot:
        raise HTTPException(400, "Invalid request")

    # Timing: reject if submitted suspiciously fast (< 2 s after form opened)
    if request.form_open_at > 0:
        elapsed_ms = time.time() * 1000 - request.form_open_at
        if elapsed_ms < 2000:
            raise HTTPException(400, "Пожалуйста, заполните форму внимательно.")

    # IP rate limiting: max 5 registrations per IP per hour
    client_ip = http_request.client.host if http_request.client else "unknown"
    now = time.time()
    _reg_attempts[client_ip] = [t for t in _reg_attempts[client_ip] if now - t < _REG_WINDOW]
    if len(_reg_attempts[client_ip]) >= _REG_LIMIT:
        raise HTTPException(429, "Слишком много попыток регистрации. Попробуйте позже.")
    _reg_attempts[client_ip].append(now)

    if len(request.username.strip()) < 2:
        raise HTTPException(400, "Username must be at least 2 characters")
    if "@" not in request.email or "." not in request.email.split("@")[-1]:
        raise HTTPException(400, "Invalid email address")
    if len(request.password) < 8:
        raise HTTPException(400, "Password must be at least 8 characters")

    if db.query(User).filter(User.email == request.email.lower()).first():
        raise HTTPException(400, "Email already registered")
    if db.query(User).filter(User.username == request.username.strip()).first():
        raise HTTPException(400, "Username already taken")

    is_first = db.query(User).count() == 0
    user = User(
        id=str(uuid.uuid4()),
        username=request.username.strip(),
        email=request.email.lower(),
        password_hash=hash_password(request.password),
        role="admin" if is_first else "user",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_access_token(user.id, user.role)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=ACCESS_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        samesite="lax",
        secure=False,
    )
    return UserResponse(id=user.id, username=user.username, email=user.email, role=user.role)


@app.post("/api/auth/login", response_model=UserResponse)
async def login(request: LoginRequest, response: Response, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == request.email.lower()).first()
    if not user or not verify_password(request.password, user.password_hash):
        raise HTTPException(401, "Invalid email or password")

    token = create_access_token(user.id, user.role)
    response.set_cookie(
        key="access_token",
        value=token,
        httponly=True,
        max_age=ACCESS_TOKEN_EXPIRE_DAYS * 24 * 60 * 60,
        samesite="lax",
        secure=False,
    )
    return UserResponse(id=user.id, username=user.username, email=user.email, role=user.role)


@app.get("/api/auth/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        role=current_user.role,
    )


@app.post("/api/auth/logout")
async def logout(response: Response):
    response.delete_cookie(key="access_token")
    return {"message": "Logged out"}


# ── Progress routes ────────────────────────────────────────────────────────────

@app.get("/api/progress/me")
async def get_progress(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = _get_or_create_progress(current_user.id, db)
    return {
        "shuffled_ids": json.loads(p.shuffled_ids) if p.shuffled_ids and p.shuffled_ids != "null" else None,
        "current_position": p.current_position,
        "cycle_number": p.cycle_number,
        "session_batch": json.loads(p.session_batch) if p.session_batch and p.session_batch != "null" else None,
        "session_index": p.session_index,
        "session_score": json.loads(p.session_score) if p.session_score else {"correct": 0, "incorrect": 0},
        "session_failed": json.loads(p.session_failed) if p.session_failed else [],
        "session_position": p.session_position,
        "speed_mode": bool(p.speed_mode),
    }


@app.put("/api/progress/me")
async def update_progress(
    data: ProgressData,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    p = _get_or_create_progress(current_user.id, db)
    p.shuffled_ids = json.dumps(data.shuffled_ids) if data.shuffled_ids is not None else "null"
    p.current_position = data.current_position
    p.cycle_number = data.cycle_number
    p.session_batch = json.dumps(data.session_batch) if data.session_batch is not None else "null"
    p.session_index = data.session_index
    p.session_score = json.dumps(data.session_score)
    p.session_failed = json.dumps(data.session_failed)
    p.session_position = data.session_position
    p.speed_mode = data.speed_mode
    p.updated_at = datetime.datetime.utcnow()
    db.commit()
    return {"message": "Progress saved"}


@app.post("/api/progress/reset")
async def reset_progress(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    p = db.query(UserProgress).filter(UserProgress.user_id == current_user.id).first()
    if p:
        p.shuffled_ids = "null"
        p.current_position = 0
        p.cycle_number = 1
        p.session_batch = "null"
        p.session_index = 0
        p.session_score = '{"correct":0,"incorrect":0}'
        p.session_failed = "[]"
        p.session_position = 0
        p.speed_mode = False
        p.updated_at = datetime.datetime.utcnow()
        db.commit()
    return {"message": "Progress reset"}


# ── Question routes ────────────────────────────────────────────────────────────

@app.get("/api/questions", response_model=List[Question])
async def get_all_questions():
    return load_questions()

@app.get("/api/questions/{question_id}", response_model=Question)
async def get_question(question_id: int):
    question = next((q for q in load_questions() if q.id == question_id), None)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    return question

@app.get("/api/questions/random/{count}")
async def get_random_questions(count: int = 10):
    import random
    questions = load_questions()
    count = min(count, len(questions))
    return random.sample(questions, count)

@app.post("/api/questions/sequential")
async def get_sequential_questions(request: dict):
    question_ids = request.get('question_ids', [])
    questions_map = {q.id: q for q in load_questions()}
    return [questions_map[qid] for qid in question_ids if qid in questions_map]

@app.put("/api/questions/{question_id}", response_model=Question)
async def update_question(
    question_id: int,
    update_data: QuestionUpdate,
    _: User = Depends(get_admin_user),
):
    questions = load_questions()
    question = next((q for q in questions if q.id == question_id), None)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    if update_data.question:
        question.question = update_data.question
    if update_data.image is not None:
        question.image = update_data.image
    if update_data.answers:
        question.answers = update_data.answers
    if update_data.explanation is not None:
        question.explanation = update_data.explanation
    save_questions(questions)
    return question

@app.post("/api/questions", response_model=Question)
async def create_question(
    question: Question,
    _: User = Depends(get_admin_user),
):
    questions = load_questions()
    if any(q.id == question.id for q in questions):
        raise HTTPException(status_code=400, detail="Question ID already exists")
    questions.append(question)
    save_questions(questions)
    return question

@app.delete("/api/questions/{question_id}")
async def delete_question(
    question_id: int,
    _: User = Depends(get_admin_user),
):
    questions = load_questions()
    if not any(q.id == question_id for q in questions):
        raise HTTPException(status_code=404, detail="Question not found")
    save_questions([q for q in questions if q.id != question_id])
    return {"message": "Question deleted successfully"}

@app.post("/api/upload-image")
async def upload_image(
    file: UploadFile = File(...),
    _: User = Depends(get_admin_user),
):
    if not file.content_type.startswith('image/'):
        raise HTTPException(status_code=400, detail="File must be an image")
    ext = file.filename.split('.')[-1] if '.' in file.filename else 'jpg'
    filename = f"{uuid.uuid4()}.{ext}"
    with open(IMAGES_DIR / filename, 'wb') as f:
        f.write(await file.read())
    return {"filename": filename, "url": f"/images/{filename}"}

@app.get("/api/stats")
async def get_stats():
    questions = load_questions()
    return {
        "total_questions": len(questions),
        "questions_with_images": sum(1 for q in questions if q.image),
        "questions_with_explanations": sum(1 for q in questions if q.explanation),
    }

@app.get("/googlea207e655fb0f2f0a.html", include_in_schema=False)
async def google_site_verification():
    return Response(content="google-site-verification: googlea207e655fb0f2f0a.html", media_type="text/html")


@app.get("/robots.txt", include_in_schema=False)
async def robots_txt():
    content = (
        "User-agent: *\n"
        "Allow: /pdd/\n"
        "Disallow: /api/\n"
        "Sitemap: http://www.polozoffs.top/sitemap.xml\n"
    )
    return Response(content=content, media_type="text/plain")


@app.get("/sitemap.xml", include_in_schema=False)
async def sitemap_xml():
    content = """<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>http://www.polozoffs.top/pdd/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
</urlset>"""
    return Response(content=content, media_type="application/xml")


# Catch-all route for React Router (SPA)
@app.get("/{full_path:path}")
async def serve_spa(full_path: str):
    if full_path.startswith("pdd/") or full_path == "pdd":
        if FRONTEND_DIST.exists() and (FRONTEND_DIST / "index.html").exists():
            return FileResponse(str(FRONTEND_DIST / "index.html"))
    raise HTTPException(status_code=404, detail="Not found")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
