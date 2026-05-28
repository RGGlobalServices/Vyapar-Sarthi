from sqlalchemy.orm import Session
from database.database import SessionLocal, engine, Base
from models import models
from app.api.auth_utils import get_password_hash

def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Create default user if not exists
    user = db.query(models.User).filter(models.User.email == "admin@vyapar.io").first()
    if not user:
        user = models.User(
            email="admin@vyapar.io",
            password=get_password_hash("admin123"),
            name="Admin",
            store_name="Mauli Kirana Store",
            business_type="kirana",
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        print("User created: admin@vyapar.io / admin123")
    
    # Check if shop exists
    shop = db.query(models.Shop).first()
    if not shop:
        shop = models.Shop(name="Mauli Kirana Store", address="Pune, Maharashtra", owner_id=user.id)
        db.add(shop)
        db.commit()
        db.refresh(shop)

    # 20 Kirana Products in Marathi
    products = [
        {"name": "Fortune तेल (1L)", "category": "Oil", "base_unit": "Bottle", "mrp": 180, "selling_price": 170, "wholesale_cost": 155, "min_stock": 10, "current_stock": 50, "barcode": "8901234567890"},
        {"name": "तूर डाळ (1kg)", "category": "Pulses", "base_unit": "Kg", "mrp": 160, "selling_price": 150, "wholesale_cost": 135, "min_stock": 5, "current_stock": 30, "barcode": "8901234567891"},
        {"name": "मूग डाळ (1kg)", "category": "Pulses", "base_unit": "Kg", "mrp": 140, "selling_price": 130, "wholesale_cost": 115, "min_stock": 5, "current_stock": 25, "barcode": "8901234567892"},
        {"name": "साखर (1kg)", "category": "Sugar", "base_unit": "Kg", "mrp": 45, "selling_price": 42, "wholesale_cost": 38, "min_stock": 20, "current_stock": 100, "barcode": "8901234567893"},
        {"name": "Surf Excel (500g)", "category": "Detergent", "base_unit": "Box", "mrp": 120, "selling_price": 115, "wholesale_cost": 100, "min_stock": 10, "current_stock": 40, "barcode": "8901234567894"},
        {"name": "Lux साबण (100g)", "category": "Soap", "base_unit": "Box", "mrp": 35, "selling_price": 32, "wholesale_cost": 28, "min_stock": 15, "current_stock": 60, "barcode": "8901234567895"},
        {"name": "Tata मीठ (1kg)", "category": "Salt", "base_unit": "Box", "mrp": 28, "selling_price": 25, "wholesale_cost": 20, "min_stock": 10, "current_stock": 80, "barcode": "8901234567896"},
        {"name": "Parle-G (Small)", "category": "Biscuits", "base_unit": "Box", "mrp": 5, "selling_price": 5, "wholesale_cost": 4, "min_stock": 50, "current_stock": 200, "barcode": "8901234567897"},
        {"name": "Maggi (70g)", "category": "Noodles", "base_unit": "Box", "mrp": 14, "selling_price": 14, "wholesale_cost": 12, "min_stock": 20, "current_stock": 100, "barcode": "8901234567898"},
        {"name": "Colgate (100g)", "category": "Toothpaste", "base_unit": "Box", "mrp": 60, "selling_price": 55, "wholesale_cost": 48, "min_stock": 10, "current_stock": 45, "barcode": "8901234567899"},
        {"name": "चहा पावडर (Red Label 250g)", "category": "Tea", "base_unit": "Box", "mrp": 150, "selling_price": 140, "wholesale_cost": 125, "min_stock": 5, "current_stock": 20, "barcode": "8901234567900"},
        {"name": "तांदूळ (Kolam 1kg)", "category": "Rice", "base_unit": "Kg", "mrp": 70, "selling_price": 65, "wholesale_cost": 58, "min_stock": 20, "current_stock": 150, "barcode": "8901234567901"},
        {"name": "गहू पीठ (Ashirwad 5kg)", "category": "Flour", "base_unit": "Box", "mrp": 280, "selling_price": 260, "wholesale_cost": 235, "min_stock": 5, "current_stock": 15, "barcode": "8901234567902"},
        {"name": "शेंगदाणे (1kg)", "category": "Grocery", "base_unit": "Kg", "mrp": 120, "selling_price": 110, "wholesale_cost": 95, "min_stock": 10, "current_stock": 40, "barcode": "8901234567903"},
        {"name": "पोहे (1kg)", "category": "Grocery", "base_unit": "Kg", "mrp": 60, "selling_price": 55, "wholesale_cost": 48, "min_stock": 10, "current_stock": 35, "barcode": "8901234567904"},
        {"name": "हळद पावडर (100g)", "category": "Spices", "base_unit": "Box", "mrp": 40, "selling_price": 35, "wholesale_cost": 30, "min_stock": 10, "current_stock": 50, "barcode": "8901234567905"},
        {"name": "मिरची पावडर (100g)", "category": "Spices", "base_unit": "Box", "mrp": 50, "selling_price": 45, "wholesale_cost": 38, "min_stock": 10, "current_stock": 45, "barcode": "8901234567906"},
        {"name": "खोबरेल तेल (Parachute 100ml)", "category": "Oil", "base_unit": "Bottle", "mrp": 45, "selling_price": 42, "wholesale_cost": 36, "min_stock": 10, "current_stock": 30, "barcode": "8901234567907"},
        {"name": "बेसन (500g)", "category": "Flour", "base_unit": "Box", "mrp": 60, "selling_price": 55, "wholesale_cost": 48, "min_stock": 5, "current_stock": 25, "barcode": "8901234567908"},
        {"name": "कांदा (1kg)", "category": "Vegetables", "base_unit": "Kg", "mrp": 30, "selling_price": 25, "wholesale_cost": 20, "min_stock": 10, "current_stock": 50, "barcode": "8901234567909"},
    ]

    for p in products:
        if not db.query(models.Product).filter(models.Product.barcode == p["barcode"]).first():
            db_product = models.Product(**p, shop_id=shop.id)
            db.add(db_product)
    
    # Add a sample customer
    if not db.query(models.Customer).first():
        customer = models.Customer(name="Rahul Gosavi", mobile="9876543210", total_due=500.0, shop_id=shop.id)
        db.add(customer)

    db.commit()
    db.close()
    print("Seed completed!")

if __name__ == "__main__":
    seed()
