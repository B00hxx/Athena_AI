from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from .. import models, schemas, auth, database

router = APIRouter(
    prefix="/auth",
    tags=["auth"],
)


class RefreshRequest(BaseModel):
    refresh: str


def _token_response(user: models.User):
    return {
        "access": auth.create_access_token(user.email),
        "refresh": auth.create_refresh_token(user.email),
        "user": {
            "id": user.id,
            "email": user.email,
            "is_active": user.is_active
        }
    }


@router.post("/signup")
def signup(user: schemas.UserCreate, db: Session = Depends(database.get_db)):
    db_user = db.query(models.User).filter(models.User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email already registered")

    hashed_password = auth.get_password_hash(user.password)
    db_user = models.User(email=user.email, hashed_password=hashed_password)
    db.add(db_user)
    db.commit()
    db.refresh(db_user)
    return _token_response(db_user)

@router.post("/login")
def login(user_credentials: schemas.UserLogin, db: Session = Depends(database.get_db)):
    user = db.query(models.User).filter(models.User.email == user_credentials.email).first()
    if not user or not auth.verify_password(user_credentials.password, user.hashed_password):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return _token_response(user)

@router.post("/refresh")
def refresh(body: RefreshRequest, db: Session = Depends(database.get_db)):
    email = auth.decode_token(body.refresh, "refresh")
    user = db.query(models.User).filter(models.User.email == email).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Could not validate credentials")
    return _token_response(user)
