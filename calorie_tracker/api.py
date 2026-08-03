# calorie_tracker/api.py
from ninja import NinjaAPI
from api.endpoints import router as food_router  # 1. Import your router

api = NinjaAPI(
    title="Calorie Tracker API",
    description="API for AI-powered food tracking using Google Gemini"
)

# 2. Attach the router to the main API under the "/food" path
api.add_router("/food", food_router)