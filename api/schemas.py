from typing import List, Optional
from pydantic import BaseModel, Field


class MacroNutrients(BaseModel):
    protein_g: int = Field(description="Estimated grams of protein")
    carbs_g: int = Field(description="Estimated grams of carbohydrates")
    fat_g: int = Field(description="Estimated grams of dietary fat")
    fiber_g: Optional[int] = Field(default=0, description="Estimated grams of dietary fiber")


class FoodItem(BaseModel):
    name: str = Field(description="Name of the food item, e.g., 'Grilled Chicken Breast'")
    estimated_weight_g: int = Field(description="Estimated weight of this portion in grams")
    calories: int = Field(description="Estimated energy in kcal for this specific item")
    macros: MacroNutrients = Field(description="Macro breakdown for this specific item")


class MealAnalysis(BaseModel):
    meal_name: str = Field(description="A descriptive title for the overall meal, e.g., 'Steak with Rice and Broccoli'")
    total_calories: int = Field(description="The total kcal in the entire plate of food provided")
    total_macros: MacroNutrients = Field(description="Combined macronutrients for the entire plate")
    food_items: List[FoodItem] = Field(description="List of every individual food item identified on the plate")


class BarcodeProduct(BaseModel):
    barcode: str = Field(description="The GTIN/UPC/EAN barcode string")
    product_name: str = Field(description="The commercial brand name of the product")
    brand: Optional[str] = Field(default=None, description="Brand or manufacturer")
    serving_size: Optional[str] = Field(default=None, description="Serving size specification (e.g. '30g')")
    calories: int = Field(description="Total calories (kcal) per serving (or per 100g if serving unavailable)")
    macros: MacroNutrients = Field(description="Macronutrient breakdown per serving")

    @classmethod
    def from_open_food_facts(cls, barcode: str, raw_json: dict) -> Optional["BarcodeProduct"]:
        """
        Parses raw Open Food Facts API response into a typed BarcodeProduct instance.
        Returns None if product was not found.
        """
        if not raw_json or raw_json.get("status") == 0 or "product" not in raw_json:
            return None

        product = raw_json["product"]
        nutriments = product.get("nutriments", {})

        def _safe_int(val, default=0) -> int:
            try:
                if val is None or val == "":
                    return default
                return int(round(float(val)))
            except (ValueError, TypeError):
                return default

        # Calories: check serving first, fallback to 100g
        calories = _safe_int(
            nutriments.get("energy-kcal_serving")
            or nutriments.get("energy-kcal_100g")
            or nutriments.get("energy-kcal")
        )

        # Macros: check serving first, fallback to 100g
        protein = _safe_int(nutriments.get("proteins_serving") or nutriments.get("proteins_100g"))
        carbs = _safe_int(nutriments.get("carbohydrates_serving") or nutriments.get("carbohydrates_100g"))
        fat = _safe_int(nutriments.get("fat_serving") or nutriments.get("fat_100g"))
        fiber = _safe_int(nutriments.get("fiber_serving") or nutriments.get("fiber_100g"))

        return cls(
            barcode=barcode,
            product_name=product.get("product_name") or "Unknown Product",
            brand=product.get("brands") or product.get("brand"),
            serving_size=product.get("serving_size"),
            calories=calories,
            macros=MacroNutrients(
                protein_g=protein,
                carbs_g=carbs,
                fat_g=fat,
                fiber_g=fiber,
            ),
        )
