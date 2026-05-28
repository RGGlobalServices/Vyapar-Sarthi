import os
import hashlib
import secrets
from datetime import datetime, timedelta
from urllib.parse import urlencode
from urllib.request import urlopen, Request as UrlRequest
from urllib.parse import urlencode as url_encode
from urllib.error import URLError
import json

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session
from typing import Optional

from ..database.database import get_db
from ..models import models
from .deps import get_current_shop

router = APIRouter()

# ── Plan amounts in rupees (PayU uses decimal, not paise) ───────
PLAN_AMOUNTS = {
    'basic':        599,
    'professional': 999,
    'business':     1499,
}

PLAN_LABELS = {
    'basic':        'Vyapar Sarthi Small Store Plan',
    'professional': 'Vyapar Sarthi Big Store Plan',
    'business':     'Vyapar Sarthi Wholesale Plan',
}

PAYU_URL        = 'https://secure.payu.in/_payment'
PAYU_TEST_URL   = 'https://test.payu.in/_payment'
PAYU_REFUND_URL = 'https://info.payu.in/merchant/postservice?form=2'

# ₹2 charged upfront to verify payment method and start the subscription mandate.
# Full plan amount is auto-debited after the 14-day trial ends.
TRIAL_INIT_AMOUNT = 2
TRIAL_DAYS        = 14


# ── Helpers ─────────────────────────────────────────────────────

def _is_test_mode() -> bool:
    """True when PayU keys are absent — enables local bypass so dev/demo works without real keys."""
    return not os.getenv('PAYU_KEY', '') or not os.getenv('PAYU_SALT', '')


def _get_payu_config():
    key  = os.getenv('PAYU_KEY', '')
    salt = os.getenv('PAYU_SALT', '')
    if not key or not salt:
        raise HTTPException(
            status_code=503,
            detail="PayU keys not configured. Add PAYU_KEY and PAYU_SALT to .env.local"
        )
    return key, salt


def _request_hash(key, txnid, amount, productinfo, firstname, email, salt,
                  udf1='', udf2='', udf3='', udf4='', udf5=''):
    """PayU forward hash: sha512(key|txnid|amount|productinfo|firstname|email|udf1..5||||||salt)"""
    s = f"{key}|{txnid}|{amount}|{productinfo}|{firstname}|{email}|{udf1}|{udf2}|{udf3}|{udf4}|{udf5}||||||{salt}"
    return hashlib.sha512(s.encode()).hexdigest()


def _response_hash(key, salt, status, txnid, amount, productinfo, firstname, email,
                   udf1='', udf2='', udf3='', udf4='', udf5=''):
    """PayU reverse hash: sha512(salt|status||||||udf5..1|email|firstname|productinfo|amount|txnid|key)"""
    s = f"{salt}|{status}||||||{udf5}|{udf4}|{udf3}|{udf2}|{udf1}|{email}|{firstname}|{productinfo}|{amount}|{txnid}|{key}"
    return hashlib.sha512(s.encode()).hexdigest()


def _refund_hash(key: str, command: str, mihpayid: str, amount: str, salt: str) -> str:
    """PayU refund hash: sha512(key|command|mihpayid|amount|salt)"""
    s = f"{key}|{command}|{mihpayid}|{amount}|{salt}"
    return hashlib.sha512(s.encode()).hexdigest()


def _initiate_refund(mihpayid: str, amount: str, key: str, salt: str) -> dict:
    """
    Call PayU's cancel_refund_transaction API to return money to the payer.
    Uses stdlib urllib so no extra dependency needed.
    Returns the parsed JSON response or an error dict.
    """
    command  = 'cancel_refund_transaction'
    hash_val = _refund_hash(key, command, mihpayid, amount, salt)
    payload  = url_encode({
        'key':     key,
        'command': command,
        'var1':    mihpayid,   # PayU's own transaction ID
        'var2':    amount,     # amount to refund
        'hash':    hash_val,
    }).encode('utf-8')
    try:
        req  = UrlRequest(PAYU_REFUND_URL, data=payload,
                          headers={'Content-Type': 'application/x-www-form-urlencoded'})
        with urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode())
    except (URLError, json.JSONDecodeError) as exc:
        return {'status': 0, 'error': str(exc)}


# ── Request schema ──────────────────────────────────────────────

class CreateOrderRequest(BaseModel):
    plan:       str
    firstname:  str = 'Customer'
    email:      str = 'customer@example.com'
    phone:      str = '9999999999'
    trial_days: int = 14


# ── POST /api/v1/payments/create-order ──────────────────────────

@router.post("/create-order")
async def create_order(req: CreateOrderRequest):
    """
    Generate PayU payment parameters.
    Charges ₹2 now to verify the payment method; full plan amount auto-debits after trial.
    Returns test_mode=True when PAYU_KEY/SALT are not configured (dev/demo bypass).
    """
    plan   = req.plan.lower().strip()
    amount = PLAN_AMOUNTS.get(plan, 0)
    email = (req.email or "").strip().lower()

    # Barrier: payment flow must start only after login/signup identity is available.
    if not email or email.endswith("@example.com"):
        return {
            "free": False,
            "auth_required": True,
            "next": "register",
            "message": "Please login or create account before payment."
        }

    # Barrier: ₹2 trial verification is only for first-time users.
    db: Session = next(get_db())
    try:
        existing_user = db.query(models.User).filter(models.User.email == email).first()
        if existing_user:
            shop = db.query(models.Shop).filter(models.Shop.owner_id == existing_user.id).first()
            if shop:
                trial_already_used = (
                    (shop.subscription_plan or "starter") != "starter"
                    or (shop.subscription_status or "").lower() in ("trialing", "cancelled", "expired")
                    or shop.subscription_expiry is not None
                )
                if trial_already_used:
                    raise HTTPException(
                        status_code=403,
                        detail="₹2 trial verification is only for first-time users."
                    )
            # Existing user is allowed only if trial has not been used yet.
    finally:
        db.close()

    if amount == 0:
        return {"free": True}

    # ── Dev / demo mode ───────────────────────────────────────────
    if _is_test_mode():
        trial_end = datetime.utcnow() + timedelta(days=req.trial_days)
        return {
            "free":        False,
            "test_mode":   True,
            "txnid":       f"TEST{secrets.token_hex(6).upper()}",
            "plan":        plan,
            "init_amount": TRIAL_INIT_AMOUNT,
            "full_amount": amount,
            "trial_end":   trial_end.strftime('%Y-%m-%d'),
        }

    key, salt    = _get_payu_config()
    txnid        = f"KS{secrets.token_hex(8).upper()}"
    init_str     = f"{TRIAL_INIT_AMOUNT}.00"
    full_str     = f"{amount}.00"
    productinfo  = PLAN_LABELS.get(plan, plan)
    backend_base = os.getenv('BACKEND_URL', 'https://kirana-backend.onrender.com')
    trial_end    = datetime.utcnow() + timedelta(days=TRIAL_DAYS)
    trial_end_str = trial_end.strftime('%Y-%m-%d')

    # Standing Instruction (SI) JSON for auto-debit mandate after trial ends
    import json as _json
    si_details = _json.dumps({
        "billingAmount":   full_str,
        "billingCycle":    "MONTHLY",
        "billingInterval": 1,
        "paymentCount":    "0",          # 0 = indefinite
        "startDate":       trial_end_str,
        "endDate":         "2030-12-31",
        "remarks":         productinfo,
    })

    hash_val = _request_hash(
        key, txnid, init_str, productinfo,
        req.firstname, req.email, salt, udf1=plan, udf2=str(amount)
    )

    return {
        "free":        False,
        "payu_url":    PAYU_URL,
        "init_amount": TRIAL_INIT_AMOUNT,
        "full_amount": amount,
        "params": {
            "key":         key,
            "txnid":       txnid,
            "amount":      init_str,
            "productinfo": productinfo,
            "firstname":   req.firstname,
            "email":       req.email,
            "phone":       req.phone,
            "surl":        f"{backend_base}/api/v1/payments/payu-success",
            "furl":        f"{backend_base}/api/v1/payments/payu-failure",
            "hash":        hash_val,
            "udf1":        plan,
            "udf2":        str(amount),
            # Standing Instruction — auto-debit after trial
            "si":          "1",
            "si_details":  si_details,
        },
    }


# ── POST /api/v1/payments/payu-success ─────────────────────────

@router.post("/payu-success")
async def payu_success(request: Request):
    form = dict(await request.form())
    key, salt = _get_payu_config()

    status        = form.get('status', '')
    txnid         = form.get('txnid', '')
    amount        = form.get('amount', '')
    productinfo   = form.get('productinfo', '')
    firstname     = form.get('firstname', '')
    email         = form.get('email', '')
    plan          = form.get('udf1', '')
    full_amount   = form.get('udf2', '')
    mihpayid      = form.get('mihpayid', '')   # PayU's own txn ID — needed for refunds
    received_hash = form.get('hash', '')

    expected_hash = _response_hash(
        key, salt, status, txnid, amount, productinfo, firstname, email,
        udf1=plan, udf2=full_amount
    )

    landing_url = os.getenv('LANDING_URL', 'https://kirana-manager-1.onrender.com')

    # ── Hash mismatch or non-success status ──────────────────────
    if received_hash != expected_hash or status.lower() != 'success':
        refund_status = 'none'

        # If PayU says success but our hash fails, money WAS deducted — auto-refund it
        if status.lower() == 'success' and mihpayid:
            result = _initiate_refund(mihpayid, amount, key, salt)
            refund_status = 'initiated' if result.get('status') == 1 else 'failed'

        qs = urlencode({
            'error':  'Payment verification failed. Your money will be refunded within 5-7 business days.'
                      if refund_status == 'initiated'
                      else 'Payment verification failed. Please try again.',
            'plan':   plan,
            'refund': refund_status,
        })
        return RedirectResponse(url=f"{landing_url}/payment.html?{qs}", status_code=303)

    # ── Success: activate trial subscription ─────────────────────
    trial_end = datetime.utcnow() + timedelta(days=TRIAL_DAYS)
    db: Session = next(get_db())
    try:
        user = db.query(models.User).filter(models.User.email == email).first()
        if user:
            shop = db.query(models.Shop).filter(models.Shop.owner_id == user.id).first()
            if shop:
                shop.subscription_plan   = plan
                shop.subscription_status = 'trialing'
                shop.subscription_expiry = trial_end
                db.commit()
    except Exception:
        db.rollback()
    finally:
        db.close()

    app_url = os.getenv('APP_URL', 'https://kirana-manager-fronend.onrender.com')
    qs = urlencode({
        'plan':      plan,
        'trial_end': trial_end.strftime('%Y-%m-%d'),
        'txnid':     txnid,
    })
    # Redirect back to the app so it can refresh the subscription plan
    return RedirectResponse(url=f"{app_url}/en/settings?payment_success=1&{qs}", status_code=303)


# ── POST /api/v1/payments/payu-failure ─────────────────────────
# PayU calls this when the transaction fails or is cancelled at the gateway.
# No money is deducted at this stage — no refund needed.

@router.post("/payu-failure")
async def payu_failure(request: Request):
    form        = dict(await request.form())
    landing_url = os.getenv('LANDING_URL', 'https://kirana-manager-1.onrender.com')
    error_msg   = form.get('error_Message', 'Payment failed. Please try again.')
    plan        = form.get('udf1', '')
    qs          = urlencode({'error': error_msg, 'plan': plan, 'refund': 'none'})
    return RedirectResponse(url=f"{landing_url}/payment.html?{qs}", status_code=303)


# ── POST /api/v1/payments/refund ────────────────────────────────
# Manual refund endpoint for support/admin use.

class RefundRequest(BaseModel):
    mihpayid: str
    amount:   str

@router.post("/refund")
async def manual_refund(req: RefundRequest):
    key, salt = _get_payu_config()
    result = _initiate_refund(req.mihpayid, req.amount, key, salt)
    if result.get('status') == 1:
        return {"success": True,  "message": "Refund initiated successfully.", "data": result}
    return      {"success": False, "message": "Refund request failed.",         "data": result}


# ── POST /api/v1/payments/activate-plan ────────────────────────
# Called by the app after returning from PayU payment page.
# Also used when a new user paid on the landing page then registered.

class ActivatePlanRequest(BaseModel):
    plan:      str
    txnid:     Optional[str] = None
    trial_end: Optional[str] = None   # YYYY-MM-DD

@router.post("/activate-plan")
async def activate_plan(
    body: ActivatePlanRequest,
    db: Session = Depends(get_db),
    shop: models.Shop = Depends(get_current_shop),
):
    """Activate or upgrade subscription for the authenticated user's shop."""
    plan = body.plan.lower().strip()
    if plan not in PLAN_AMOUNTS and plan != 'starter':
        raise HTTPException(status_code=400, detail=f"Unknown plan: {plan}")

    if body.trial_end:
        try:
            expiry = datetime.strptime(body.trial_end, '%Y-%m-%d')
        except ValueError:
            expiry = datetime.utcnow() + timedelta(days=TRIAL_DAYS)
    else:
        expiry = datetime.utcnow() + timedelta(days=TRIAL_DAYS)

    shop.subscription_plan   = plan
    shop.subscription_status = 'trialing' if plan != 'starter' else 'active'
    shop.subscription_expiry = expiry if plan != 'starter' else None
    db.commit()
    db.refresh(shop)

    return {
        "success":    True,
        "plan":       shop.subscription_plan,
        "status":     shop.subscription_status,
        "expiry":     shop.subscription_expiry.strftime('%Y-%m-%d') if shop.subscription_expiry else None,
    }


# ── POST /api/v1/payments/cancel-subscription ───────────────────

class CancelRequest(BaseModel):
    reason: Optional[str] = None

@router.post("/cancel-subscription")
async def cancel_subscription(
    body: CancelRequest,
    db: Session = Depends(get_db),
    shop: models.Shop = Depends(get_current_shop),
):
    """
    Cancel the authenticated user's subscription.
    Access continues until subscription_expiry; after that the plan downgrades to starter.
    """
    if shop.subscription_status in ('cancelled', None) or not shop.subscription_plan or shop.subscription_plan == 'starter':
        raise HTTPException(status_code=400, detail="No active subscription to cancel.")

    shop.subscription_status      = 'cancelled'
    shop.subscription_cancelled_at = datetime.utcnow()
    shop.cancellation_reason      = body.reason or ''
    db.commit()
    db.refresh(shop)

    expiry_str = shop.subscription_expiry.strftime('%Y-%m-%d') if shop.subscription_expiry else None
    return {
        "success":     True,
        "message":     "Subscription cancelled. You retain access until your billing period ends.",
        "plan":        shop.subscription_plan,
        "access_until": expiry_str,
        "cancelled_at": shop.subscription_cancelled_at.strftime('%Y-%m-%d %H:%M:%S'),
    }
