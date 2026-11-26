# app/schemas/pydantic_models.py
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, date
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
    category: str = Field("material", description="One of: material, labor, other (shipping, fees)")
    needs_review: bool = Field(False, description="True when the price could not be taken from the Knowledge Base and a human must set it")

class QuoteEngineOutput(BaseModel):
    material_cost: float = Field(..., description="Calculated total material cost")
    labor_cost: float = Field(..., description="Calculated total labor/machining cost")
    total_cost: float = Field(..., description="Total combined cost (material + labor)")
    itemized_breakdown: List[ItemizedCost] = Field(..., description="Itemized breakdown of all calculated costs")
    email_draft: str = Field(..., description="Polished, ready-to-send corporate email draft presenting the quote")
    customer_name: Optional[str] = Field(None, description="Name of the person asking for the quote, if stated")
    customer_email: Optional[str] = Field(None, description="Email address of the person asking for the quote, if stated")
    customer_phone: Optional[str] = Field(None, description="Phone number of the person asking for the quote, if stated")
    customer_company: Optional[str] = Field(None, description="Company the customer works for, if stated")
    missing_information: List[str] = Field(default_factory=list, description="Details the customer did not provide that are needed for a firm price")
    assumptions: List[str] = Field(default_factory=list, description="Assumptions made while pricing")
    # Filled in by the server after it recomputes the arithmetic; not produced by the model.
    review_notes: List[str] = Field(default_factory=list)

# --- Quote Schemas ---
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
    quote_number: Optional[str] = None
    currency: Optional[str] = "USD"
    subtotal: Optional[Decimal] = None
    discount_percent: Optional[Decimal] = Decimal("0")
    tax_percent: Optional[Decimal] = Decimal("0")
    valid_until: Optional[date] = None
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    customer_phone: Optional[str] = None
    customer_company: Optional[str] = None
    review_notes: List[str] = Field(default_factory=list)
    public_token: Optional[str] = None
    sent_at: Optional[datetime] = None
    first_viewed_at: Optional[datetime] = None
    last_viewed_at: Optional[datetime] = None
    view_count: Optional[int] = 0
    outcome: Optional[str] = None
    outcome_source: Optional[str] = None
    responded_at: Optional[datetime] = None
    customer_comment: Optional[str] = None
    follow_up_sent_at: Optional[datetime] = None
    # Automatic messages sent for this quote: [{at, kind, channel, text}] (migration v15).
    follow_up_log: List[dict] = Field(default_factory=list)
    # Set on the dispatch response only.
    delivery: Optional[str] = None
    sent_to: Optional[str] = None

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
