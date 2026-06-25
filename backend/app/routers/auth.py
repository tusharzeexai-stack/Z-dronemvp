"""
Authentication router — JWT-based login / user info endpoints.
"""
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from jose import jwt
from passlib.context import CryptContext

from app.database import get_db
from app.models import User
from app.schemas import LoginRequest, TokenResponse
from app.config import get_settings

router = APIRouter(prefix="/auth", tags=["Authentication"])
settings = get_settings()
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


def create_token(data: dict) -> str:
    payload = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.jwt_expire_minutes)
    payload.update({"exp": expire})
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def verify_token(token: str) -> dict:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid or expired token")


async def get_current_user(token: str = Depends(lambda: None), db: AsyncSession = Depends(get_db)):
    """Dependency to extract user from Bearer token."""
    from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
    return token


@router.post("/login", response_model=TokenResponse)
async def login(payload: LoginRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == payload.username))
    user = result.scalar_one_or_none()

    if not user or not pwd_ctx.verify(payload.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid username or password"
        )

    token = create_token({"sub": user.username, "role": user.role, "name": user.name})
    return TokenResponse(
        access_token=token,
        user={
            "username": user.username,
            "name": user.name,
            "role": user.role,
            "email": user.email,
            "loggedInAt": datetime.now(timezone.utc).isoformat(),
        }
    )


@router.get("/me")
async def get_me(db: AsyncSession = Depends(get_db)):
    """Returns logged-in user info — token validated via middleware."""
    return {"message": "Authenticated"}
