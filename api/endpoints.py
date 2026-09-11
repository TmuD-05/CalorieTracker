# api/endpoints.py
from ninja import Router, File
from ninja.files import UploadedFile
from ninja.errors import HttpError
from .services import analyze_food_image, get_macronutrients_by_barcode
from .schemas import MealAnalysis, BarcodeProduct

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


@router.get("/get-macronutrients", response=BarcodeProduct, summary="Get product macronutrients by barcode")
def product_scan(request, barcode: str):
    """
    Look up a product from Open Food Facts using its barcode (UPC/EAN/GTIN).
    Preserves leading zeros and returns normalized calories and macronutrients.
    """
    try:
        clean_barcode = barcode.strip()
        product = get_macronutrients_by_barcode(clean_barcode)

        if not product:
            raise HttpError(404, f"Product with barcode '{clean_barcode}' not found.")

        return product

    except HttpError:
        raise
    except Exception as e:
        raise HttpError(500, f"Failed to get macronutrients: {str(e)}")
