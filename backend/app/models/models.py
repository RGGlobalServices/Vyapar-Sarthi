from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from ..database.database import Base
import enum

class BaseUnit(str, enum.Enum):
    KG = "Kg"
    GRAM = "Gram"
    BOTTLE = "Bottle"
    BOX = "Box"
    GONI = "Goni"

class Shop(Base):
    __tablename__ = "shops"
    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), index=True)
    name = Column(String, index=True)
    address = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    owner = relationship("User", backref="shops")
    products = relationship("Product", back_populates="shop")
    sales = relationship("Sale", back_populates="shop")
    customers = relationship("Customer", back_populates="shop")

class Product(Base):
    __tablename__ = "products"
    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"))
    name = Column(String, index=True)
    category = Column(String, index=True)
    base_unit = Column(String)
    mrp = Column(Float)
    selling_price = Column(Float)
    wholesale_cost = Column(Float)
    conversion_factor = Column(Float, default=1.0)
    min_stock = Column(Float)
    current_stock = Column(Float)
    barcode = Column(String, index=True, unique=True)
    shop = relationship("Shop", back_populates="products")

class Customer(Base):
    __tablename__ = "customers"
    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"))
    name = Column(String, index=True)
    mobile = Column(String, index=True)
    total_due = Column(Float, default=0.0)
    shop = relationship("Shop", back_populates="customers")
    sales = relationship("Sale", back_populates="customer")

class Sale(Base):
    __tablename__ = "sales"
    id = Column(Integer, primary_key=True, index=True)
    shop_id = Column(Integer, ForeignKey("shops.id"))
    customer_id = Column(Integer, ForeignKey("customers.id"), nullable=True)
    total_amount = Column(Float)
    total_profit = Column(Float)
    payment_type = Column(String) # Cash, UPI, Udhar
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    shop = relationship("Shop", back_populates="sales")
    customer = relationship("Customer", back_populates="sales")
    items = relationship("SaleItem", back_populates="sale")

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    name = Column(String)
    mobile = Column(String, nullable=True)
    password = Column(String)
    store_name = Column(String, nullable=True)
    business_type = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class SaleItem(Base):
    __tablename__ = "sale_items"
    id = Column(Integer, primary_key=True, index=True)
    sale_id = Column(Integer, ForeignKey("sales.id"))
    product_id = Column(Integer, ForeignKey("products.id"))
    unit = Column(String)
    quantity = Column(Float)
    price_per_unit = Column(Float)
    margin_per_unit = Column(Float)
    sale = relationship("Sale", back_populates="items")
