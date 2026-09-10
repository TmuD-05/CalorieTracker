# api/endpoints.py
from ninja import Router, File
from ninja.files import UploadedFile
from ninja.errors import HttpError
from .services import analyze_food_image
from .schemas import MealAnalysis

router = Router()

@router.post("/analyze-food", response=MealAnalysis, summary="Analyze a plate of food from an image")
def analyze_food(request, image: File[UploadedFile]):
    """
    Upload an image of a meal to receive an AI-generated nutritional breakdown:
    - Overall meal name and total calories (kcal)
    - Total macronutrients (protein, carbs, fat, fiber)
    - Itemized breakdown of each distinct food item with estimated portion weights in grams
    """
    try:
        # Read the image data into memory
        image_bytes = image.read()
        mime_type = image.content_type or "image/jpeg"

        # Send it to Gemini with guaranteed structured schema
        result = analyze_food_image(image_bytes, mime_type)
        return result

    except Exception as e:
        raise HttpError(500, f"Failed to analyze food image: {str(e)}")