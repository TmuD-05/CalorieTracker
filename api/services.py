# api/services.py
import os
from typing import Optional
import requests
from google import genai
from google.genai import types
from dotenv import load_dotenv
from .schemas import MealAnalysis, BarcodeProduct

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

    image_part = types.Part.from_bytes(
        data=image_bytes,
        mime_type=mime_type,
    )
    model_name = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")


    response = client.models.generate_content(
        model=model_name,
        contents=[prompt, image_part],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=MealAnalysis,
            temperature=0.2,
        ),
    )


    if getattr(response, "parsed", None):
        return response.parsed
    return MealAnalysis.model_validate_json(response.text)


def get_macronutrients_by_barcode(barcode: str) -> Optional[BarcodeProduct]:
    """
    Look up packaged food product nutrition from Open Food Facts by barcode.
    Returns a typed BarcodeProduct instance or None if not found.
    """
    # Clean the barcode string (strip whitespace/newlines)
    clean_barcode = barcode.strip()

    url = f"https://world.openfoodfacts.org/api/v2/product/{clean_barcode}.json"
    headers = {
        "User-Agent": "CalorieTrackerApp - Web/Python - Version 1.0 (https://github.com/TmuD-05/CalorieTracker)"
    }
    params = {
        "fields": "product_name,brands,brand,serving_size,nutriments,status"
    }

    try:
        response = requests.get(url, headers=headers, params=params, timeout=5.0)
    except requests.exceptions.RequestException:
        return None

    if response.status_code == 404:
        return None

    try:
        raw_json = response.json()
    except Exception:
        return None

    # Let Pydantic do the extraction, normalization, and object instantiation
    return BarcodeProduct.from_open_food_facts(clean_barcode, raw_json)


def process_recipe(text: str) -> MealAnalysis:
    """
    Analyzes an unstructured recipe, list of ingredients, or meal description.
    Extracts individual food items, estimates portion weights, and calculates macros/calories.
    """
    model = os.environ.get("GEMINI_MODEL", "gemini-3.6-flash")
    prompt = """
    Analyze the following list of ingredients or meal description:
    1. Identify all distinct food items and ingredients.
    2. Estimate the portion weight in grams for each item.
    3. Calculate the calories and macronutrients (protein, carbs, fat, fiber) for each item and the entire meal.
    """
    response = client.models.generate_content(
        model=model,
        contents=[prompt, text],
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema=MealAnalysis,
            temperature=0.2,
        ),
    )

    if getattr(response, "parsed", None):
        return response.parsed
    return MealAnalysis.model_validate_json(response.text)


# Backward-compatible alias
process_reciepts = process_recipe