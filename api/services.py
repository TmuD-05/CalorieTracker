# api/services.py
import os
from google import genai
from google.genai import types
from dotenv import load_dotenv
from .schemas import MealAnalysis

# Load the API key from the .env file
load_dotenv()

# Initialize the client explicitly
client = genai.Client(api_key=os.environ.get("GEMINI_API_KEY"))

def analyze_food_image(image_bytes: bytes, mime_type: str) -> MealAnalysis:
    """
    Sends an image to Gemini Flash and asks for a structured nutritional breakdown.
    Guarantees valid JSON conforming to the MealAnalysis schema.
    """
    prompt = """
    Analyze this image of food.
    1. Identify all distinct food items on the plate.
    2. Estimate the portion size of each item in grams.
    3. Calculate the calories and macronutrients (protein, carbs, fat, fiber) for each item and the entire plate.
    """

    # Create image part from byte stream
    image_part = types.Part.from_bytes(
        data=image_bytes,
        mime_type=mime_type,
    )

    # Use GEMINI_MODEL from .env if defined, otherwise default to gemini-2.5-flash
    model_name = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")

    # Call the Gemini model with structured output configuration
    response = client.models.generate_content(
        model=model_name,
        contents=[prompt, image_part],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=MealAnalysis,
            temperature=0.2,  # Low temperature for factual, consistent estimates
        ),
    )

    # The SDK parses directly into the Pydantic schema when response_schema is provided
    if getattr(response, "parsed", None):
        return response.parsed
    return MealAnalysis.model_validate_json(response.text)