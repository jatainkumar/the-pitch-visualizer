import os
import base64
import json
import asyncio
from concurrent.futures import ThreadPoolExecutor

import requests
import nltk
from dotenv import load_dotenv

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel
from google import genai
from google.genai import types

load_dotenv()

# Setup NLTK
import certifi
import ssl

try:
    _create_unverified_https_context = ssl._create_unverified_context
except AttributeError:
    pass
else:
    ssl._create_default_https_context = _create_unverified_https_context

def download_nltk_data():
    try:
        nltk.data.find('tokenizers/punkt')
    except LookupError:
        nltk.download('punkt')
    except Exception as e:
         print(f"Warning: punk download failed: {e}")

download_nltk_data()

app = FastAPI(title="The Pitch Visualizer")

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

class GenerateRequest(BaseModel):
    text: str
    style: str = "Cinematic"
    ratio: str = "16:9"

def generate_storyboard_prompts_with_gemini(text: str, style: str):
    """
    Uses Gemini to analyze the whole story at once.
    This ensures character and environmental continuity across all panels.
    Returns a Python dictionary with a 'scenes' array.
    """
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY is not set.")
    
    client = genai.Client(api_key=api_key)
    
    prompt = f"""
    You are an expert storyboard director for a cinematic movie.
    The user has provided a narrative story:
    "{text}"
    
    First, segment the story into 3 to 5 chronological key scenes based on the narrative.
    Then, describe the main character(s) and the primary setting so they remain visually identical in every panel.
    Finally, for each scene:
    1. Write a 'polished_caption': A compelling, beautifully written, and engaging script/caption that vividly depicts the story being told in this specific scene for the final presentation.
    2. Write an 'enhanced_prompt': A highly detailed text-to-image prompt. Every single prompt MUST explicitly restate the physical description of the main character (e.g., "A 30-year-old man with brown hair wearing a blue suit") and the environment to force the AI to keep them consistent across images. Force this visual style onto every prompt: {style}.
    
    Output strictly in this JSON format:
    {{
        "scenes": [
            {{
                "original_text": "The raw sentence or phrase representing the scene from the user input",
                "polished_caption": "The polished, engaging caption to display to the audience",
                "enhanced_prompt": "The detailed, continuous image prompt (max 60 words)"
            }}
        ]
    }}
    """
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            )
        )
        return json.loads(response.text.strip())
    except Exception as e:
        print(f"Gemini API Error: {e}")
        raise ValueError("Failed to process narrative narrative with Gemini.")

def generate_image_hf(prompt: str, ratio: str) -> str:
    """Uses Hugging Face Inference API to generate an image from a prompt with aspect ratio. Includes fallback models."""
    api_key = os.getenv("HUGGINGFACE_API_KEY")
    if not api_key:
        raise ValueError("HUGGINGFACE_API_KEY is not set.")
        
    MODELS = [
        "https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-xl-base-1.0",
        "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-schnell",
        "https://router.huggingface.co/hf-inference/models/runwayml/stable-diffusion-v1-5"
    ]
    
    headers = {"Authorization": f"Bearer {api_key}"}
    
    # Map ratio to optimal resolutions
    if ratio == "16:9":
        width, height = 1344, 768
    elif ratio == "9:16":
        width, height = 768, 1344
    else: # 1:1
        width, height = 1024, 1024
    
    payload = {
        "inputs": prompt,
        "parameters": {
            "num_inference_steps": 25,
            "guidance_scale": 7.5,
            "width": width,
            "height": height
        }
    }
    
    last_error = None
    
    for API_URL in MODELS:
        try:
            print(f"Requesting image from: {API_URL}")
            response = requests.post(API_URL, headers=headers, json=payload, timeout=90)
            
            if response.status_code == 200:
                image_b64 = base64.b64encode(response.content).decode("utf-8")
                return f"data:image/jpeg;base64,{image_b64}"
            else:
                last_error = f"Status {response.status_code}: {response.text}"
                print(f"Model {API_URL} failed: {last_error}")
                # If rate limited (429) or overloaded/loading (503), continue to next fallback
                continue 
        except Exception as e:
            last_error = str(e)
            print(f"Model {API_URL} raised exception: {last_error}")
            continue

    # If the loop finishes organically, all models have failed
    raise Exception(f"All fallback image generation models failed. Last error: {last_error}")

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/api/generate")
async def generate_storyboard(req: GenerateRequest):
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="Text input is required.")
        
    # Phase 1: Holistic Prompt Engineering & Segmentation
    try:
        storyboard_data = generate_storyboard_prompts_with_gemini(req.text, req.style)
        scenes = storyboard_data.get("scenes", [])
        if not scenes:
            raise Exception("No scenes returned.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    
    # Phase 2: Concurrent Image Generation
    loop = asyncio.get_event_loop()
    with ThreadPoolExecutor(max_workers=5) as pool:
        try:
            b64_images = await asyncio.gather(
                *[loop.run_in_executor(pool, generate_image_hf, scene["enhanced_prompt"], req.ratio) for scene in scenes]
            )
        except Exception as e:
             raise HTTPException(status_code=500, detail=f"Image generation failed: {str(e)}")
        
    # Combine results
    storyboard = []
    for i in range(len(scenes)):
        storyboard.append({
            "original_text": scenes[i]["original_text"],
            "polished_caption": scenes[i].get("polished_caption", scenes[i]["original_text"]),
            "enhanced_prompt": scenes[i]["enhanced_prompt"],
            "image": b64_images[i]
        })
        
    return {"storyboard": storyboard}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
