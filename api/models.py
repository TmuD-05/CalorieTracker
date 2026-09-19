from django.db import models


class MealLog(models.Model):
    """
    Server-side persistence for finalized meals.
    Supports idempotency via unique client_request_id (UUIDv7).
    """
    MEAL_TYPE_CHOICES = [
        ("BREAKFAST", "Breakfast"),
        ("LUNCH", "Lunch"),
        ("DINNER", "Dinner"),
        ("SNACK", "Snack"),
    ]

    client_request_id = models.CharField(max_length=64, unique=True, db_index=True)
    meal_name = models.CharField(max_length=255)
    meal_type = models.CharField(max_length=32, choices=MEAL_TYPE_CHOICES, default="LUNCH")
    consumed_at = models.DateTimeField()
    total_calories = models.IntegerField(default=0)
    protein_g = models.IntegerField(default=0)
    carbs_g = models.IntegerField(default=0)
    fat_g = models.IntegerField(default=0)
    fiber_g = models.IntegerField(default=0)
    food_items = models.JSONField(default=list)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"{self.meal_name} ({self.total_calories} kcal) - {self.client_request_id[:8]}"
