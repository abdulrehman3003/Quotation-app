# app/services/ai_engine.py
import json
import logging
from openai import OpenAI
from app.core.config import settings
from app.schemas.pydantic_models import QuoteEngineOutput

logger = logging.getLogger(__name__)

# Initialize the OpenAI SDK client pointing to Gemini's OpenAI-compatible endpoint
client = OpenAI(
    api_key=settings.GEMINI_API_KEY,
    base_url=settings.OPENAI_BASE_URL
)

def run_quote_engine(
    lead_text: str,
    kb_contents: list[str],
    custom_api_key: str | None = None,
    user_profile: dict | None = None
) -> QuoteEngineOutput:
    """
    Feeds lead raw text and business knowledge base items into the AI engine.
    Uses Gemini (via OpenAI compatibility) with structured schema verification.
    """
    # Initialize the client dynamically if a custom API key is passed
    api_key = custom_api_key or settings.GEMINI_API_KEY
    openai_client = OpenAI(
        api_key=api_key,
        base_url=settings.OPENAI_BASE_URL
    )

    # Combine all knowledge base articles/files for context
    kb_context = "\n\n".join([
        f"--- Knowledge Base File {i+1} ---\n{content}"
        for i, content in enumerate(kb_contents)
    ]) if kb_contents else "No Knowledge Base files uploaded."

    # Load global settings (labor rate and markup multiplier)
    from app.api.admin import load_global_settings
    global_rates = load_global_settings()
    labor_rate = global_rates.get("base_labor_rate", 50.0)
    material_markup = global_rates.get("base_material_markup", 1.2)

    # Extract user profile information for signature personalization
    signature_instructions = ""
    if user_profile:
        from app.core.encryption import decrypt_key
        name = user_profile.get("name") or "Sales Representative"
        phone = user_profile.get("phone_number") or ""
        
        # Resolve user's assigned/decrypted GMail email if present, fallback to main account email
        enc_gmail = user_profile.get("encrypted_gmail_email")
        gmail_addr = decrypt_key(enc_gmail) if enc_gmail else None
        email = gmail_addr or user_profile.get("email") or ""
        
        signature_instructions = (
            f"\n8. SIGNATURE RULE: At the bottom of the email draft, you MUST sign off the email using "
            f"the name '{name}', phone number '{phone}' (if provided), and email '{email}'."
        )

    system_instruction = (
        "You are the expert AXRFLOWS AI Quote Engine.\n"
        "Your task is to analyze unstructured client requests and calculate an accurate B2B quote.\n\n"
        "CRITICAL RULES:\n"
        f"1. Base Labor Rate: Use a base labor/machining rate of ${labor_rate:.2f} per hour for all labor cost calculations.\n"
        f"2. Base Material Markup Rate: Apply a markup multiplier of {material_markup:.2f}x to all raw material costs.\n"
        "3. You MUST use the provided Knowledge Base as the absolute 'ground truth' for all pricing calculations, "
        "rates, material costs, labor multipliers, and templates. If the Knowledge Base defines specific rates, they override the base labor and markup rates.\n"
        "4. STRICT PRICING RULE: If the Knowledge Base does not contain specific pricing or information for a "
        "material, product, service, or process requested by the client, you MUST NOT generate or estimate the price on your own. "
        "Instead, you must set the price of that line item to 0 in the itemized breakdown, and explicitly specify in the itemized breakdown "
        "description and the email draft that the pricing for this item was not found in the Knowledge Base and requires human manual configuration.\n"
        "5. Provide a fully structured breakdown with material cost, labor cost, and total cost.\n"
        "6. Draft a highly professional B2B response email to the lead. Use the pricing sheets and standard operating procedures "
        "found in the Knowledge Base to structure the email style and tone.\n"
        "7. Output must conform exactly to the required JSON schema."
        f"{signature_instructions}"
    )

    user_prompt = (
        f"--- START KNOWLEDGE BASE DATA ---\n"
        f"{kb_context}\n"
        f"--- END KNOWLEDGE BASE DATA ---\n\n"
        f"--- START RAW CLIENT INQUIRY ---\n"
        f"{lead_text}\n"
        f"--- END RAW CLIENT INQUIRY ---\n\n"
        f"Extract client requirements, perform cost calculations using the Knowledge Base rules, "
        f"and output the pricing breakdown and email draft."
    )

    try:
        # First attempt: Use the OpenAI SDK beta.chat.completions.parse which enforces Pydantic structured output
        logger.info("Attempting structured generation via beta.chat.completions.parse")
        completion = openai_client.beta.chat.completions.parse(
            model=settings.GEMINI_MODEL,
            messages=[
                {"role": "system", "content": system_instruction},
                {"role": "user", "content": user_prompt}
            ],
            response_format=QuoteEngineOutput,
            temperature=0.2,
        )
        return completion.choices[0].message.parsed
        
    except Exception as e:
        logger.warning(f"Structured outputs beta endpoint failed, falling back to manual parsing. Error: {str(e)}")
        # Fallback: Request JSON mode and validate manually
        try:
            completion = openai_client.chat.completions.create(
                model=settings.GEMINI_MODEL,
                messages=[
                    {"role": "system", "content": system_instruction + "\nOutput MUST be a valid JSON object matching the schema."},
                    {"role": "user", "content": user_prompt}
                ],
                response_format={"type": "json_object"},
                temperature=0.2,
            )
            
            content = completion.choices[0].message.content
            parsed_json = json.loads(content)
            
            # Map manually to Pydantic object
            return QuoteEngineOutput(**parsed_json)
            
        except Exception as fallback_err:
            logger.error(f"Fallback AI generation failed: {str(fallback_err)}")
            raise RuntimeError(f"AI Quote engine failed: {str(fallback_err)}")

