from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ..database.database import get_db
from ..models.models import User
from .auth_utils import verify_password, get_password_hash, create_access_token

router = APIRouter()

class LoginRequest(BaseModel):
    email: str
    password: str

class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str | None = None
    full_name: str | None = None
    mobile: str | None = None
    store_name: str | None = None
    shop_name: str | None = None
    business_type: str | None = None

@router.post("/login")
def login(req: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == req.email).first()
    if not user or not verify_password(req.password, user.password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(data={"sub": str(user.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "storeName": user.store_name or "",
            "mobile": user.mobile or "",
        }
    }

@router.post("/register")
def register(req: RegisterRequest, db: Session = Depends(get_db)):
    existing = db.query(User).filter(User.email == req.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user = User(
        email=req.email,
        password=get_password_hash(req.password),
        name=req.name or req.full_name or "",
        mobile=req.mobile,
        store_name=req.store_name or req.shop_name or req.email.split("@")[0] + "'s Shop",
        business_type=req.business_type,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(data={"sub": str(user.id)})
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "storeName": user.store_name or "",
            "mobile": user.mobile or "",
        }
    }
