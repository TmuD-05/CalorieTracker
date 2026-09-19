import json
from unittest.mock import patch
from django.test import TestCase, Client
from django.core.files.uploadedfile import SimpleUploadedFile
from .models import MealLog
from .schemas import MealAnalysis, MacroNutrients, FoodItem


class MealApiTests(TestCase):
    def setUp(self):
        self.client = Client()

    def test_confirm_meal_creation_and_idempotency(self):
        payload = {
            "client_request_id": "0191c95e-3990-7d72-9a3b-2802bcfb17ce",
            "meal_name": "Chicken Breast with Brown Rice",
            "meal_type": "LUNCH",
            "consumed_at": "2026-09-18T12:00:00Z",
            "total_calories": 550,
            "total_macros": {
                "protein_g": 48,
                "carbs_g": 52,
                "fat_g": 12,
                "fiber_g": 5,
            },
            "food_items": [
                {
                    "name": "Grilled Chicken Breast",
                    "estimated_weight_g": 200,
                    "calories": 330,
                    "macros": {"protein_g": 46, "carbs_g": 0, "fat_g": 7, "fiber_g": 0},
                },
                {
                    "name": "Brown Rice",
                    "estimated_weight_g": 150,
                    "calories": 220,
                    "macros": {"protein_g": 2, "carbs_g": 52, "fat_g": 5, "fiber_g": 5},
                },
            ],
        }

        # First request: Creates the meal
        response = self.client.post(
            "/api/food/confirm-meal",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["client_request_id"], payload["client_request_id"])
        self.assertEqual(data["total_calories"], 550)
        self.assertEqual(MealLog.objects.count(), 1)

        # Second request with same client_request_id: Idempotent return, no duplicate record
        response2 = self.client.post(
            "/api/food/confirm-meal",
            data=json.dumps(payload),
            content_type="application/json",
        )
        self.assertEqual(response2.status_code, 200)
        self.assertEqual(MealLog.objects.count(), 1)

    def test_meal_history_endpoint(self):
        MealLog.objects.create(
            client_request_id="uuid-1",
            meal_name="Oatmeal with Blueberries",
            meal_type="BREAKFAST",
            consumed_at="2026-09-18T08:00:00Z",
            total_calories=320,
            protein_g=12,
            carbs_g=55,
            fat_g=6,
            fiber_g=8,
            food_items=[],
        )

        response = self.client.get("/api/food/history")
        self.assertEqual(response.status_code, 200)
        history = response.json()
        self.assertEqual(len(history), 1)
        self.assertEqual(history[0]["meal_name"], "Oatmeal with Blueberries")

    def test_analyze_food_rejects_non_image(self):
        text_file = SimpleUploadedFile("notes.txt", b"hello world", content_type="text/plain")
        response = self.client.post("/api/food/analyze-food", {"image": text_file})
        self.assertEqual(response.status_code, 400)

    @patch("api.endpoints.analyze_food_image")
    def test_analyze_food_success_with_mock(self, mock_analyze):
        mock_analyze.return_value = MealAnalysis(
            meal_name="Salmon and Asparagus",
            total_calories=420,
            total_macros=MacroNutrients(protein_g=40, carbs_g=4, fat_g=24, fiber_g=2),
            food_items=[
                FoodItem(
                    name="Pan-seared Salmon",
                    estimated_weight_g=180,
                    calories=380,
                    macros=MacroNutrients(protein_g=38, carbs_g=0, fat_g=23, fiber_g=0),
                )
            ],
        )

        dummy_img = SimpleUploadedFile("meal.webp", b"\x00\x00\x00\x00", content_type="image/webp")
        response = self.client.post(
            "/api/food/analyze-food",
            {"image": dummy_img},
            HTTP_X_CLIENT_REQUEST_ID="test-request-id",
        )

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual(data["meal_name"], "Salmon and Asparagus")
        self.assertEqual(data["total_calories"], 420)
