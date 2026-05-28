from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from typing import Optional, List
from uuid import UUID
import uuid
import random
import string
from datetime import datetime, timedelta
from ..database.database import get_db
from ..models import models
from .deps import get_current_user
import os

router = APIRouter()

def generate_name_based_code(name_base: str) -> str:
    clean = ''.join(c for c in name_base.upper() if c.isalnum() or c == ' ')
    parts = clean.split()
    if parts:
        base = parts[0][:5]
    else:
        base = clean[:5]
    if len(base) < 3:
        base = (base + "REF")[:5]
    suffix = random.randint(10, 999)
    return f"{base}{suffix}"

@router.get("/my-code")
def get_my_referral_code(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user)
):
    code_info = db.query(models.ReferralCode).filter(
        models.ReferralCode.user_id == user.id
    ).first()
    if not code_info:
        shop = db.query(models.Shop).filter(models.Shop.owner_id == user.id).first()
        name_for_code = shop.name if shop else user.full_name
        code = generate_name_based_code(name_for_code)
        for _ in range(20):
            existing = db.query(models.ReferralCode).filter(
                models.ReferralCode.code == code
            ).first()
            if not existing:
                break
            suffix = random.randint(10, 999)
            base = ''.join(c for c in code if not c.isdigit())[:5]
            code = f"{base}{suffix}"
        code_info = models.ReferralCode(user_id=user.id, code=code)
        db.add(code_info)
        db.commit()
        db.refresh(code_info)

    app_url = os.getenv("APP_URL", "https://kirana-manager-fronend.onrender.com").rstrip("/")
    signup_url = f"{app_url}/mr/signup"
    
    return {
        "code": code_info.code,
        "total_referrals": code_info.total_referrals,
        "successful_referrals": code_info.successful_referrals,
        "referral_link": f"{signup_url}?ref={code_info.code}"
    }

class ApplyReferralRequest(BaseModel):
    referral_code: str

@router.post("/apply")
def apply_referral(
    req: ApplyReferralRequest,
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user)
):
    code_upper = req.referral_code.upper().strip()
    if not code_upper:
        raise HTTPException(status_code=400, detail="Referral code is required")

    code_info = db.query(models.ReferralCode).filter(
        models.ReferralCode.code == code_upper
    ).first()
    if not code_info:
        raise HTTPException(status_code=404, detail="Invalid referral code")
    if code_info.user_id == user.id:
        raise HTTPException(status_code=400, detail="Cannot use your own referral code")

    existing = db.query(models.Referral).filter(
        models.Referral.referred_id == user.id
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Referral already applied")

    referral = models.Referral(
        referrer_id=code_info.user_id,
        referred_id=user.id,
        referral_code=code_upper,
        status="completed",
        discount_applied=True,
        completed_at=datetime.now()
    )
    db.add(referral)

    code_info.total_referrals += 1
    code_info.successful_referrals += 1

    referrer_shop = db.query(models.Shop).filter(
        models.Shop.owner_id == code_info.user_id
    ).first()
    if referrer_shop and referrer_shop.subscription_plan != "starter":
        old_expiry = referrer_shop.subscription_expiry or datetime.now()
        new_expiry = old_expiry + timedelta(days=30)
        referrer_shop.subscription_expiry = new_expiry
        referral.referrer_rewarded = True

    db.commit()
    db.refresh(referral)
    return {
        "status": "success",
        "message": "Referral applied! You get 20% off, referrer gets 1 month free."
    }

@router.get("/my-team")
def get_my_referral_team(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user)
):
    referrals = db.query(models.Referral).filter(
        models.Referral.referrer_id == user.id,
        models.Referral.status == "completed"
    ).order_by(models.Referral.created_at.desc()).all()

    team = []
    for ref in referrals:
        referred_user = db.query(models.User).filter(models.User.id == ref.referred_id).first()
        referred_shop = None
        if referred_user:
            referred_shop = db.query(models.Shop).filter(
                models.Shop.owner_id == referred_user.id
            ).first()

        team.append({
            "id": str(ref.id),
            "referred_name": referred_user.full_name if referred_user else "Unknown",
            "referred_email": referred_user.email if referred_user else ref.referred_email,
            "package": referred_shop.subscription_plan if referred_shop else "N/A",
            "subscription_status": referred_shop.subscription_status if referred_shop else "N/A",
            "subscription_expiry": referred_shop.subscription_expiry.isoformat() if referred_shop and referred_shop.subscription_expiry else None,
            "rewarded": ref.referrer_rewarded,
            "created_at": ref.created_at.isoformat() if ref.created_at else None
        })

    return {"team": team}

@router.get("/my-referrer")
def get_my_referrer(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user)
):
    referral = db.query(models.Referral).filter(
        models.Referral.referred_id == user.id
    ).first()
    if not referral:
        return {"referrer": None}

    referrer_user = db.query(models.User).filter(models.User.id == referral.referrer_id).first()
    return {
        "referrer": {
            "name": referrer_user.full_name if referrer_user else "Unknown",
            "code": referral.referral_code
        }
    }

@router.get("/referrer-info")
def get_referrer_info(
    code: str,
    db: Session = Depends(get_db)
):
    code_upper = code.upper().strip()
    code_info = db.query(models.ReferralCode).filter(
        models.ReferralCode.code == code_upper
    ).first()
    if not code_info:
        raise HTTPException(status_code=404, detail="Invalid referral code")

    referrer_user = db.query(models.User).filter(models.User.id == code_info.user_id).first()
    referrer_shop = db.query(models.Shop).filter(models.Shop.owner_id == code_info.user_id).first()

    if not referrer_user:
        raise HTTPException(status_code=404, detail="Referrer not found")

    return {
        "referrer_name": referrer_user.full_name,
        "shop_name": referrer_shop.name if referrer_shop else "Unknown Shop",
        "member_since": referrer_user.created_at.isoformat() if referrer_user.created_at else None,
        "code": code_upper
    }

@router.get("/has-discount")
def has_referral_discount(
    db: Session = Depends(get_db),
    user: models.User = Depends(get_current_user)
):
    referral = db.query(models.Referral).filter(
        models.Referral.referred_id == user.id,
        models.Referral.discount_applied == True
    ).first()
    return {"has_discount": referral is not None}
