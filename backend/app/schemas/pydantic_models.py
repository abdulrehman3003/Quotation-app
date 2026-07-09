# app/schemas/pydantic_models.py
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from decimal import Decimal

# --- Lead Schemas ---
class LeadCreate(BaseModel):
    title: str = Field(..., description="Subject or brief identifier of the lead")
    raw_text: str = Field(..., description="Raw text of the inquiry/email")
    source: str = Field("manual", description="Source of the lead (e.g. manual, email, webhook)")

class LeadResponse(BaseModel):
    id: str
    user_id: str
    source: str
    title: str
    raw_text: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- AI Engine Output Schemas ---
class ItemizedCost(BaseModel):
    description: str = Field(..., description="Description of the cost item (e.g. 5x sheets aluminum, 3 hours welding)")
    quantity: float = Field(..., description="Quantity of items or hours")
    unit_price: float = Field(..., description="Price per unit or hour")
    total_price: float = Field(..., description="Total price for this item (quantity * unit_price)")

class QuoteEngineOutput(BaseModel):
    material_cost: float = Field(..., description="Calculated total material cost")
    labor_cost: float = Field(..., description="Calculated total labor/machining cost")
    total_cost: float = Field(..., description="Total combined cost (material + labor)")
    itemized_breakdown: List[ItemizedCost] = Field(..., description="Itemized breakdown of all calculated costs")
    email_draft: str = Field(..., description="Polished, ready-to-send corporate email draft presenting the quote")

# --- Quote Schemas ---
class QuoteCreate(BaseModel):
    lead_id: str
    material_cost: Decimal
    labor_cost: Decimal
    total_cost: Decimal
    itemized_breakdown: List[ItemizedCost]
    email_draft: str
    status: str = "draft"

class QuoteResponse(BaseModel):
    id: str
    lead_id: str
    user_id: str
    material_cost: Decimal
    labor_cost: Decimal
    total_cost: Decimal
    itemized_breakdown: List[ItemizedCost]
    email_draft: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

# --- Knowledge Base Schemas ---
class KnowledgeBaseResponse(BaseModel):
    id: str
    user_id: str
    filename: str
    file_path: str
    content_type: str
    parsed_content: str
    created_at: datetime

    class Config:
        from_attributes = True
