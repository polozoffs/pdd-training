# Spanish Driving Theory Test (PDD) Application

A web application for practicing Spanish driving theory test questions, with user accounts, progress tracking, and an admin panel.

Live at: **http://www.polozoffs.top/pdd/**

## Features

- **Quiz Interface**: Practice with randomized questions, tracks progress across sessions
- **User Accounts**: Register/login with JWT-based auth; progress saved per user
- **Multi-language**: Questions in English, Spanish, and Russian
- **Image Support**: Each question can have an associated image
- **Admin Panel**: Edit questions, answers, and images (admin-role users only)
- **Docker Ready**: Single `docker compose up` deployment

## Tech Stack

### Backend
- **FastAPI 0.115** (Python) — REST API
- **SQLAlchemy 2.0 + SQLite** — user & progress storage
- **passlib + bcrypt 3.2.2** — password hashing (bcrypt pinned to 3.x for passlib compatibility)
- **python-jose** — JWT tokens

### Frontend
- **React + Vite** — SPA served at `/pdd/` base path
- **React Router** — client-side navigation

## Project Structure

```
pdd_app/
├── backend/
│   ├── main.py           # FastAPI app — quiz, auth, admin routes
│   ├── auth.py           # JWT helpers, password hashing, FastAPI dependencies
│   ├── database.py       # SQLAlchemy models (User, UserProgress) + init_db()
│   └── requirements.txt  # Python dependencies
├── frontend/
│   ├── src/
│   │   ├── components/   # Home, Quiz, Admin, Login, Register React components
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js    # base: '/pdd/'
├── data/
│   ├── questions.json    # Questions database (editable)
│   └── images/           # Question images (~1500 files)
├── Dockerfile
├── docker-compose.yml
└── .env.example          # Copy to .env and set SECRET_KEY
```

## Quick Start (Docker)

```bash
cd pdd_app

# 1. Create .env from example
cp .env.example .env
# Edit .env — set a strong SECRET_KEY

# 2. Build and start
docker compose up -d --build

# 3. Check logs
docker compose logs -f
```

Access at http://localhost:8002/pdd/

The first user to register automatically gets the `admin` role.

## Development Setup

### Backend

```bash
cd backend
pip install -r requirements.txt
python main.py
# Runs on http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# Runs on http://localhost:3001
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/questions` | All questions |
| GET | `/api/stats` | Question count stats |
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login (returns JWT cookie) |
| GET | `/api/auth/me` | Current user info |
| GET/PUT | `/api/progress/me` | Get/save user progress |
| POST | `/api/progress/reset` | Reset progress |
| GET/POST/PUT/DELETE | `/api/admin/questions` | Admin CRUD (admin role required) |

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `8002` | Host port the container is exposed on |
| `SECRET_KEY` | *(change this)* | JWT signing key — must be secret in production |
| `ALLOWED_ORIGINS` | `http://localhost:3000,...` | CORS allowed origins (comma-separated) |
| `TZ` | `UTC` | Container timezone |

