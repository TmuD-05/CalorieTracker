# api/services.py
import os
from google import genai
from google.genai import types  # 1. Import 'types' from the new SDK
from dotenv import load_dotenv

# Load the API key from the .env file
load_dotenv()

# Initialize the client explicitly
client = genai.Client(api_key=os.environ["GEMINI_API_KEY"])

def analyze_food_image(image_bytes: bytes, mime_type: str) -> str:
    """
    Sends an image to Gemini 3.6 Flash and asks for a nutritional breakdown.
    """
    prompt = """
    Analyze this image of food. 
    Identify the food items, estimate the portion size in grams, and provide an 
    estimated calorie count and macronutrient breakdown (protein, carbs, fat).
    Return the result STRICTLY as a JSON object with keys: 
    'food_items' (list), 'total_calories' (int), 'protein_g' (int), 'carbs_g' (int), 'fat_g' (int).
    Do not include markdown blocks or any other text.
    """

    # 2. Use types.Part.from_bytes() instead of a standard dictionary
    image_part = types.Part.from_bytes(
        data=image_bytes,
        mime_type=mime_type,
    )

    # Call the Gemini model
    response = client.models.generate_content(
        model='gemini-3.6-flash',
        contents=[prompt, image_part]
    )

    return response.text