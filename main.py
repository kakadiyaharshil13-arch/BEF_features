import os
import base64
import uuid
import json
import asyncio
import logging
import io
from datetime import datetime, timedelta
from typing import List, Optional

from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from google import genai
import PyPDF2
from pydantic import BaseModel, Field, ConfigDict
from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

# Load environment variables
load_dotenv()

# Configuration
HOST = os.getenv("host", "0.0.0.0")
PORT = int(os.getenv("port", 8000))
MONGO_URL = os.getenv("MONGO_URL", "mongodb://localhost:27017")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

# Configure Logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler("app.log")
    ]
)
logger = logging.getLogger("ActiveRecallApp")

# FastAPI App Initialization
app = FastAPI(
    title="Active Recall API",
    description="Production-ready API for UPSC evaluation and flashcard generation",
    version="1.1.0"
)

# Middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# MongoDB Connection
client_db = AsyncIOMotorClient(MONGO_URL)
db = client_db["ActiveRecall"]
flashcard_sets_collection = db["flashcard_sets"]
sessions_collection = db["study_sessions"]
jobs_collection = db["jobs"]

# Static files and Templates
os.makedirs("static", exist_ok=True)
os.makedirs("templates", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

# Gemini Client
client = genai.Client(api_key=GEMINI_API_KEY)

# --- Pydantic Models ---

class QAPair(BaseModel):
    question: str = Field(description="The UPSC Mains question text")
    answer: str = Field(description="The student's written answer to the question")

class QAPairList(BaseModel):
    pairs: List[QAPair] = Field(description="List of question and answer pairs extracted from the PDF")

class EvaluationItem(BaseModel):
    index: int
    question: str
    result: str

class EvaluationResponse(BaseModel):
    score: str = Field(description="Numerical score out of max marks, e.g., '7/10'")
    evaluation: str = Field(description="Detailed evaluation of the answer structure and content")
    mistakes: str = Field(description="List of mistakes and actionable improvements")
    ideal_answer: str = Field(description="A comprehensive model answer for the question")

class Flashcard(BaseModel):
    question: str = Field(description="The flashcard question")
    answer: str = Field(description="The answer to the flashcard question")

class FlashcardSet(BaseModel):
    title: str = Field(description="A short descriptive title for this flashcard set")
    cards: List[Flashcard] = Field(description="List of flashcard question-answer pairs")

class SavedFlashcardSet(BaseModel):
    model_config = ConfigDict(populate_by_name=True)
    id: Optional[str] = Field(None, alias="_id")
    title: str
    language: str
    cards: List[Flashcard]
    created_at: datetime = Field(default_factory=datetime.now)

class StudySession(BaseModel):
    set_id: str
    set_title: str
    correct_count: int
    incorrect_count: int
    total_cards: int
    incorrect_indices: List[int] = []
    timestamp: datetime = Field(default_factory=datetime.now)

# --- Helper Functions ---

async def save_job(job_id: str, job_data: dict):
    await jobs_collection.update_one(
        {"job_id": job_id},
        {"$set": job_data},
        upsert=True
    )

async def update_job_status(job_id: str, status: str, results: Optional[list] = None):
    update_data = {"status": status}
    if results is not None:
        update_data["results"] = results
    await jobs_collection.update_one(
        {"job_id": job_id},
        {"$set": update_data}
    )
    logger.info(f"Job {job_id} status updated to: {status}")

# --- Background Processing ---

async def process_bulk_pdf(job_id: str, pdf_text: str, language: str, max_marks: str, system_prompt: Optional[str] = None):
    try:
        split_prompt = f"""
        Analyze the following UPSC Mains content extracted from a PDF. 
        It contains UP TO 20 questions and their respective answers.
        Please extract each question and answer pair and return them as a JSON list of objects.
        Each object MUST have 'question' and 'answer' keys.
        
        Content:
        {pdf_text[:50000]}
        """
        
        split_response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=split_prompt,
            config={
                'response_mime_type': 'application/json',
                'response_schema': QAPairList
            }
        )
        
        qa_data = QAPairList.model_validate_json(split_response.text)
        items = qa_data.pairs
        results = []
        current_system_prompt = system_prompt if system_prompt and system_prompt.strip() else SYSTEM_PROMPT
        
        for i, item in enumerate(items[:20]):
            q_text = item.question
            a_text = item.answer
            
            if not q_text or not a_text:
                continue
                
            parts = [
                current_system_prompt,
                f"EVALUATION LANGUAGE: {language}",
                f"MAX MARKS: {max_marks}",
                f"Question: {q_text}",
                f"Answer: {a_text}"
            ]
            
            resp = client.models.generate_content(
                model='gemini-2.5-flash-lite',
                contents=parts,
                config={
                    'response_mime_type': 'application/json',
                    'response_schema': EvaluationResponse
                }
            )
            
            results.append({
                "index": i + 1,
                "question": q_text,
                "result": resp.text
            })
            
            await asyncio.sleep(1) # Reduced delay for production but kept for safety
            
        await update_job_status(job_id, "completed", results)
        
    except Exception as e:
        logger.error(f"Error in background processing job {job_id}: {e}", exc_info=True)
        await update_job_status(job_id, f"error: {str(e)}")

# --- System Prompts ---

NOTES_SYSTEM_PROMPT = """
You are an elite UPSC academic content creator. Your goal is to provide comprehensive, high-scoring study notes for UPSC Mains.
Structure your response as follows:
1. [TITLE]
2. [INTRODUCTION]
3. [CORE DIMENSIONS] (Historical, Economic, Social, Political, etc.)
4. [PROS & CONS / CHALLENGES & OPPORTUNITIES]
5. [WAY FORWARD / CONCLUSION]

Important: Use Markdown. Entirely in requested language. Academic and neutral.
"""

SYSTEM_PROMPT = """
You are an expert UPSC Mains answer evaluator.
Evaluate the user's answer and return a structured JSON response:
- score: Numerical score out of MAX MARKS (UPSC standards).
- evaluation: Strong points, structure, etc. (bullet points).
- mistakes: Specific missing points and 2-4 improvements.
- ideal_answer: Comprehensive model answer.

Rules: Use Markdown. Entirely in specified language. Valid JSON.
"""

FLASHCARD_SYSTEM_PROMPT = """
You are an expert academic flashcard creator specializing in UPSC Civil Services exam content.
Generate high-quality, exam-focused flashcards.
- clear, specific questions.
- concise answers (2-4 sentences).
- Focus on facts, definitions, dates, comparisons.
- All content in specified language.
"""

# --- Endpoints ---

@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})

@app.post("/evaluate")
async def evaluate(
    question_text: str = Form(None),
    answer_text: str = Form(None),
    question_image: UploadFile = File(None),
    answer_image: UploadFile = File(None),
    language: str = Form("English"),
    max_marks: str = Form("10"),
    system_prompt: str = Form(None)
):
    try:
        current_system_prompt = system_prompt if system_prompt and system_prompt.strip() else SYSTEM_PROMPT
        parts = [
            current_system_prompt,
            f"EVALUATION LANGUAGE: You MUST provide the evaluation, mistakes, and ideal answer entirely in {language}.",
            f"MAX MARKS: The maximum score for this question is {max_marks}."
        ]

        if question_text:
            parts.append(f"Question: {question_text}")
        if answer_text:
            parts.append(f"Answer: {answer_text}")
            
        if question_image and question_image.filename:
            q_image_data = await question_image.read()
            parts.append({"mime_type": question_image.content_type, "data": q_image_data})
            
        if answer_image and answer_image.filename:
            a_image_data = await answer_image.read()
            parts.append({"mime_type": answer_image.content_type, "data": a_image_data})

        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=parts,
            config={
                'response_mime_type': 'application/json',
                'response_schema': EvaluationResponse
            }
        )
        return EvaluationResponse.model_validate_json(response.text).model_dump()
        
    except Exception as e:
        logger.error(f"Evaluation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Evaluation failed. Please try again.")

@app.post("/evaluate_pdf")
async def evaluate_pdf(
    background_tasks: BackgroundTasks,
    pdf_file: UploadFile = File(...),
    language: str = Form("English"),
    max_marks: str = Form("10"),
    system_prompt: str = Form(None)
):
    try:
        contents = await pdf_file.read()
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(contents))
        pdf_text = "".join([page.extract_text() + "\n" for page in pdf_reader.pages])
        
        job_id = str(uuid.uuid4())
        created_at = datetime.now()
        available_at = created_at + timedelta(seconds=10)
        
        job_data = {
            "job_id": job_id,
            "status": "processing",
            "created_at": created_at.isoformat(),
            "available_at": available_at.isoformat(),
            "language": language,
            "max_marks": max_marks,
            "system_prompt": system_prompt,
            "results": []
        }
        await save_job(job_id, job_data)
        background_tasks.add_task(process_bulk_pdf, job_id, pdf_text, language, max_marks, system_prompt)
        
        return {"job_id": job_id, "available_at": available_at.isoformat()}
        
    except Exception as e:
        logger.error(f"PDF evaluation upload failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to process PDF.")

@app.get("/job_status/{job_id}")
async def get_job_status(job_id: str):
    job = await jobs_collection.find_one({"job_id": job_id})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
        
    now = datetime.now()
    available_at = datetime.fromisoformat(job["available_at"])
    is_available = now >= available_at
    
    response = {
        "status": job["status"],
        "is_available": is_available,
        "available_at": job["available_at"]
    }
    
    if is_available and job["status"] == "completed":
        response["results"] = job["results"]
    elif not is_available:
        wait_time = available_at - now
        response["message"] = f"Evaluation results will be available in {wait_time.seconds // 3600}h {(wait_time.seconds % 3600) // 60}m."
        
    return response

@app.post("/generate_notes")
async def generate_notes(
    topic: str = Form(...),
    language: str = Form("English")
):
    try:
        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=[NOTES_SYSTEM_PROMPT, f"TOPIC: {topic}", f"LANGUAGE: {language}"],
        )
        return {"result": response.text}
    except Exception as e:
        logger.error(f"Notes generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate notes.")

@app.post("/generate_flashcards")
async def generate_flashcards(
    topic: str = Form(None),
    content: str = Form(None),
    num_cards: int = Form(20),
    language: str = Form("English")
):
    try:
        if not topic and not content:
            raise HTTPException(status_code=400, detail="Provide topic or content.")

        source = f"TOPIC: {topic}" if topic else f"CONTENT:\n{content[:15000]}"
        card_count_instr = f"Generate exactly {num_cards} cards." if num_cards > 0 else "Generate 10-60 appropriate cards."

        prompt = f"{FLASHCARD_SYSTEM_PROMPT}\n\n{source}\n\nLANGUAGE: {language}\n{card_count_instr}\nReturn as JSON."
        
        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=[prompt],
            config={'response_mime_type': 'application/json', 'response_schema': FlashcardSet}
        )
        return FlashcardSet.model_validate_json(response.text).model_dump()
    except Exception as e:
        logger.error(f"Flashcard generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate flashcards.")

# --- MongoDB API Endpoints ---

@app.post("/api/save_flashcard_set")
async def save_flashcard_set(fc_set: SavedFlashcardSet):
    try:
        set_dict = fc_set.model_dump(exclude={"id"})
        result = await flashcard_sets_collection.insert_one(set_dict)
        return {"id": str(result.inserted_id), "status": "saved"}
    except Exception as e:
        logger.error(f"Failed to save flashcard set: {e}")
        raise HTTPException(status_code=500, detail="Database save failed.")

@app.get("/api/flashcard_sets")
async def get_flashcard_sets():
    try:
        sets = []
        async for s in flashcard_sets_collection.find().sort("created_at", -1):
            s["_id"] = str(s["_id"])
            sets.append(s)
        return sets
    except Exception as e:
        logger.error(f"Failed to fetch flashcard sets: {e}")
        raise HTTPException(status_code=500, detail="Database fetch failed.")

@app.post("/api/save_session")
async def save_session(session: StudySession):
    try:
        result = await sessions_collection.insert_one(session.model_dump())
        return {"id": str(result.inserted_id), "status": "session_recorded"}
    except Exception as e:
        logger.error(f"Failed to save session: {e}")
        raise HTTPException(status_code=500, detail="Database save failed.")

@app.get("/api/performance")
async def get_performance():
    try:
        sessions = []
        async for s in sessions_collection.find().sort("timestamp", -1):
            s["_id"] = str(s["_id"])
            sessions.append(s)
        return sessions
    except Exception as e:
        logger.error(f"Failed to fetch performance: {e}")
        raise HTTPException(status_code=500, detail="Database fetch failed.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=HOST, port=PORT, reload=False, access_log=True)