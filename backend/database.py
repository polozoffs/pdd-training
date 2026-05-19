"""SQLite database setup for PDD multi-user support."""
import datetime
from pathlib import Path

from sqlalchemy import create_engine, Column, String, Integer, Boolean, DateTime, Text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
DB_PATH = DATA_DIR / "pdd.db"

engine = create_engine(
    f"sqlite:///{DB_PATH}",
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    username = Column(String, unique=True, nullable=False, index=True)
    email = Column(String, unique=True, nullable=False, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, default="user")   # "user" | "admin"
    created_at = Column(DateTime, default=datetime.datetime.utcnow)


class UserProgress(Base):
    __tablename__ = "user_progress"

    user_id = Column(String, primary_key=True)
    shuffled_ids = Column(Text, default="null")
    current_position = Column(Integer, default=0)
    cycle_number = Column(Integer, default=1)
    session_batch = Column(Text, default="null")
    session_index = Column(Integer, default=0)
    session_score = Column(Text, default='{"correct":0,"incorrect":0}')
    session_failed = Column(Text, default="[]")
    session_position = Column(Integer, default=0)
    speed_mode = Column(Boolean, default=False)
    updated_at = Column(DateTime, default=datetime.datetime.utcnow)


def init_db() -> None:
    """Create all tables if they don't already exist."""
    DATA_DIR.mkdir(exist_ok=True)
    Base.metadata.create_all(bind=engine)


def get_db():
    """FastAPI dependency: yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
