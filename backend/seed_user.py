"""Run directly: python seed_user.py"""
import os, sys
sys.path.insert(0, os.path.dirname(__file__))
from app.database.database import SessionLocal, engine, Base
from app.models.models import User
from app.api.auth_utils import get_password_hash

Base.metadata.create_all(bind=engine)
db = SessionLocal()

if not db.query(User).filter(User.email == "rahulgosavi624@gmail.com").first():
    user = User(
        email="rahulgosavi624@gmail.com",
        password=get_password_hash("Rahul@123"),
        name="Rahul Gosavi",
        store_name="RG Super Mart",
        business_type="kirana",
    )
    db.add(user)
    db.commit()
    print("User created: rahulgosavi624@gmail.com / Rahul@123")
else:
    print("User already exists")

db.close()
