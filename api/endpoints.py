# api/endpoints.py
from ninja import Router, File
from ninja.files import UploadedFile
from ninja.errors import HttpError
from .services import analyze_food_image, get_macronutrients_by_barcode, process_recipe
from .schemas import MealAnalysis, BarcodeProduct, RecipeInput

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


@router.post("/parse-recipe", response=MealAnalysis, summary="Analyze text description of a meal or ingredients")
def parse_recipe_endpoint(request, payload: RecipeInput):
    """
    Send a JSON body with an ingredients or recipe description:
    `{"ingredients": "200g of beef, 150g of rice, and a cup of broccoli"}`

    Returns an AI-analyzed breakdown with total calories, macros, and itemized ingredients.
    """
    try:
        clean_ingredients = payload.ingredients.strip()
        if not clean_ingredients:
            raise HttpError(400, "Ingredients field cannot be empty.")

        result = process_recipe(clean_ingredients)
        return result

    except HttpError:
        raise
    except Exception as e:
        raise HttpError(500, f"Failed to analyze ingredients: {str(e)}")
