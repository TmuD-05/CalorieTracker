# api/endpoints.py
from typing import List
from django.utils import timezone
from ninja import Router, File
from ninja.files import UploadedFile
from ninja.errors import HttpError
from .services import analyze_food_image, get_macronutrients_by_barcode, process_recipe
from .schemas import (
    MealAnalysis,
    BarcodeProduct,
    RecipeInput,
    MealLogCreate,
    MealLogResponse,
)
from .models import MealLog

router = Router()

MAX_IMAGE_SIZE_BYTES = 25 * 1024 * 1024  # 25 MB ceiling


@router.post("/analyze-food", response=MealAnalysis, summary="Analyze a plate of food from an image")
def analyze_food(request, image: File[UploadedFile]):
    """
    Upload an image of a meal to receive an AI-generated nutritional breakdown:
    - Overall meal name and total calories (kcal)
    - Total macronutrients (protein, carbs, fat, fiber)
    - Itemized breakdown of each distinct food item with estimated portion weights in grams
    """
    # 1. Validate file size to prevent memory exhaustion
    if image.size > MAX_IMAGE_SIZE_BYTES:
        raise HttpError(413, f"Uploaded image exceeds maximum size of {MAX_IMAGE_SIZE_BYTES // (1024 * 1024)}MB.")

    # 2. Validate MIME type
    mime_type = image.content_type or "image/jpeg"
    if not mime_type.startswith("image/"):
        raise HttpError(400, f"Invalid file format '{mime_type}'. Must be an image file.")

    # 3. Extract client request ID if supplied
    client_request_id = request.headers.get("x-client-request-id") or request.headers.get("X-Client-Request-Id")

    try:
        image_bytes = image.read()
        result = analyze_food_image(image_bytes, mime_type)
        return result
    except ValueError as ve:
        raise HttpError(503, str(ve))
    except Exception as e:
        raise HttpError(500, f"Failed to analyze food image: {str(e)}")


@router.post("/confirm-meal", response=MealLogResponse, summary="Finalize and persist a meal entry")
def confirm_meal(request, payload: MealLogCreate):
    """
    Persists a finalized meal record in the database.
    Implements idempotency based on `client_request_id` (UUIDv7).
    """
    # Check if meal already logged with this client_request_id
    existing = MealLog.objects.filter(client_request_id=payload.client_request_id).first()
    if existing:
        return MealLogResponse(
            id=existing.id,
            client_request_id=existing.client_request_id,
            meal_name=existing.meal_name,
            meal_type=existing.meal_type,
            consumed_at=existing.consumed_at.isoformat(),
            total_calories=existing.total_calories,
            total_macros={
                "protein_g": existing.protein_g,
                "carbs_g": existing.carbs_g,
                "fat_g": existing.fat_g,
                "fiber_g": existing.fiber_g,
            },
            food_items=existing.food_items,
        )

    # Parse consumed_at timestamp
    consumed_at = timezone.now()
    if payload.consumed_at:
        try:
            consumed_at = timezone.datetime.fromisoformat(payload.consumed_at.replace("Z", "+00:00"))
        except Exception:
            consumed_at = timezone.now()

    meal = MealLog.objects.create(
        client_request_id=payload.client_request_id,
        meal_name=payload.meal_name,
        meal_type=payload.meal_type,
        consumed_at=consumed_at,
        total_calories=payload.total_calories,
        protein_g=payload.total_macros.protein_g,
        carbs_g=payload.total_macros.carbs_g,
        fat_g=payload.total_macros.fat_g,
        fiber_g=payload.total_macros.fiber_g or 0,
        food_items=[item.model_dump() for item in payload.food_items],
    )

    return MealLogResponse(
        id=meal.id,
        client_request_id=meal.client_request_id,
        meal_name=meal.meal_name,
        meal_type=meal.meal_type,
        consumed_at=meal.consumed_at.isoformat(),
        total_calories=meal.total_calories,
        total_macros={
            "protein_g": meal.protein_g,
            "carbs_g": meal.carbs_g,
            "fat_g": meal.fat_g,
            "fiber_g": meal.fiber_g,
        },
        food_items=meal.food_items,
    )


@router.get("/history", response=List[MealLogResponse], summary="Get recent logged meals")
def get_meal_history(request, limit: int = 20):
    """
    Returns recent finalized meal logs.
    """
    meals = MealLog.objects.all().order_by("-consumed_at")[:limit]
    results = []
    for m in meals:
        results.append(
            MealLogResponse(
                id=m.id,
                client_request_id=m.client_request_id,
                meal_name=m.meal_name,
                meal_type=m.meal_type,
                consumed_at=m.consumed_at.isoformat(),
                total_calories=m.total_calories,
                total_macros={
                    "protein_g": m.protein_g,
                    "carbs_g": m.carbs_g,
                    "fat_g": m.fat_g,
                    "fiber_g": m.fiber_g,
                },
                food_items=m.food_items,
            )
        )
    return results


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
