# api/endpoints.py
import json
from ninja import Router, File
from ninja.files import UploadedFile
from .services import analyze_food_image

router = Router()

@router.post("/analyze-food")
def analyze_food(request, image: File[UploadedFile]):
    try:
        # 1. Read the image data into memory
        image_bytes = image.read()
        mime_type = image.content_type

        # 2. Send it to Gemini
        gemini_response_text = analyze_food_image(image_bytes, mime_type)

        # 3. Parse the strict JSON string Gemini returned back into a Python dictionary
        food_data = json.loads(gemini_response_text)

        return {
            "status": "success",
            "data": food_data
        }

    except Exception as e:
        return {
            "status": "error",
            "message": str(e)
        }