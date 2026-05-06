import os
import base64
import uuid
import json
import asyncio
from datetime import datetime, timedelta
from fastapi import FastAPI, Request, UploadFile, File, Form, HTTPException, BackgroundTasks
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from dotenv import load_dotenv
from google import genai
import PyPDF2
import io
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional

from motor.motor_asyncio import AsyncIOMotorClient
from bson import ObjectId

load_dotenv()
host = os.getenv("host", "localhost")
port = int(os.getenv("port", 8000))
app = FastAPI()

# MongoDB Connection
MONGO_URL = "mongodb://localhost:27017"
client_db = AsyncIOMotorClient(MONGO_URL)
db = client_db["ActiveRecall"] # New Database Named Active Recall
flashcard_sets_collection = db["flashcard_sets"]
sessions_collection = db["study_sessions"]

# Mount static files
os.makedirs("static", exist_ok=True)
os.makedirs("static/css", exist_ok=True)
os.makedirs("static/js", exist_ok=True)
app.mount("/static", StaticFiles(directory="static"), name="static")

# Templates
os.makedirs("templates", exist_ok=True)
templates = Jinja2Templates(directory="templates")

# Gemini Config
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
# genai.configure(api_key=GEMINI_API_KEY)
# model = genai.GenerativeModel('gemini-2.5-flash-lite')
client = genai.Client()

JOBS_DIR = "jobs"
os.makedirs(JOBS_DIR, exist_ok=True)
JOBS_FILE = os.path.join(JOBS_DIR, "jobs.json")

if not os.path.exists(JOBS_FILE):
    with open(JOBS_FILE, "w") as f:
        json.dump({}, f)

# Pydantic Models for AI Parsing
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
    timestamp: datetime = Field(default_factory=datetime.now)

def get_jobs():
    with open(JOBS_FILE, "r") as f:
        return json.load(f)

def save_jobs(jobs):
    with open(JOBS_FILE, "w") as f:
        json.dump(jobs, f, indent=4)

def update_job_status(job_id, status, results=None):
    jobs = get_jobs()
    if job_id in jobs:
        jobs[job_id]["status"] = status
        if results:
            jobs[job_id]["results"] = results
        save_jobs(jobs)

async def process_bulk_pdf(job_id: str, pdf_text: str, language: str, max_marks: str, system_prompt: str = None):
    try:
        # Step 1: Split PDF into 20 Q&A pairs using Gemini
        split_prompt = f"""
        Analyze the following UPSC Mains content extracted from a PDF. 
        It contains UP TO 20 questions and their respective answers.
        Please extract each question and answer pair and return them as a JSON list of objects.
        Each object MUST have 'question' and 'answer' keys.
        
        Content:
        {pdf_text[:50000]} # Increased limit to accommodate 20 UPSC answers
        """
        
        split_response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=split_prompt,
            config={
                'response_mime_type': 'application/json',
                'response_schema': QAPairList
            }
        )
        
        # Use Pydantic to parse and validate
        qa_data = QAPairList.model_validate_json(split_response.text)
        items = qa_data.pairs
            
        results = []
        # Step 2: Evaluate each pair
        current_system_prompt = system_prompt if system_prompt and system_prompt.strip() else SYSTEM_PROMPT
        
        for i, item in enumerate(items[:20]): # Ensure max 20
            q_text = item.get('question', '')
            a_text = item.get('answer', '')
            
            if not q_text or not a_text:
                continue
                
            parts = [current_system_prompt]
            parts.append(f"EVALUATION LANGUAGE: {language}")
            parts.append(f"MAX MARKS: {max_marks}")
            parts.append(f"Question: {q_text}")
            parts.append(f"Answer: {a_text}")
            
            resp = client.models.generate_content(
                model='gemini-2.5-flash-lite',
                contents=parts,
                config={
                    'response_mime_type': 'application/json',
                    'response_schema': EvaluationResponse
                }
            )
            
            # Parse to ensure it's valid
            eval_data = EvaluationResponse.model_validate_json(resp.text)
            
            # Create a model instance for the result
            eval_item = EvaluationItem(
                index=i + 1,
                question=q_text,
                result=resp.text # Keep the JSON string
            )
            
            results.append(eval_item.model_dump())
            
            # Small delay to avoid rate limits
            await asyncio.sleep(2)
            
        update_job_status(job_id, "completed", results)
        
    except Exception as e:
        print(f"Error in background processing: {e}")
        update_job_status(job_id, f"error: {str(e)}")

NOTES_SYSTEM_PROMPT = """
You are an elite UPSC academic content creator. Your goal is to provide comprehensive, high-scoring study notes for UPSC Mains.
For the given topic, structure your response as follows:

1. [TITLE]
   A clear, academic title for the notes.

2. [INTRODUCTION]
   Define the topic and its relevance to the UPSC syllabus/current affairs.

3. [CORE DIMENSIONS]
   Break down the topic into multiple dimensions (e.g., Historical, Economic, Social, Political, Legal, Ethical, etc. as applicable). Use clear bullet points and sub-headings.

4. [PROS & CONS / CHALLENGES & OPPORTUNITIES]
   Provide a balanced analysis of the issue.

5. [WAY FORWARD / CONCLUSION]
   Provide a constructive, forward-looking conclusion with suggestions or government initiatives where relevant.

Important rules:
- Use Markdown for formatting.
- The notes MUST be entirely in the requested language.
- Ensure the content is academic, data-driven, and neutral.
"""

SYSTEM_PROMPT = """
You are an expert UPSC Mains answer evaluator with deep knowledge of the UPSC Civil Services Examination pattern, GS Paper expectations, and what UPSC examiners look for in high-scoring answers.

The user will provide:
1. A UPSC Mains question (as text or image)
2. Their own written answer to that question (as text or image)

Your task is to evaluate the user's answer and return a structured JSON response matching this schema:
- score: Provide a single numerical score out of the specified MAX MARKS. Base this on UPSC standards where 50-60% is considered excellent.
- evaluation: Critically evaluate the answer using bullet points. Focus on strong points, structure (intro-body-conclusion), and UPSC-appropriateness.
- mistakes: Detailed breakdown of what was missing and 2 to 4 specific, actionable improvements.
- ideal_answer: Write a comprehensive, well-structured model answer.

Important rules:
- Use Markdown for formatting within the text fields.
- The evaluation, mistakes, and ideal_answer fields MUST be entirely in the specified evaluation language.
- Ensure the response is a valid JSON object.
"""


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse(request=request, name="index.html")

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
        parts = [current_system_prompt]
        
        # Build prompt parts
        parts.append(f"EVALUATION LANGUAGE: You MUST provide the evaluation, mistakes, and ideal answer entirely in {language}.")
        parts.append(f"MAX MARKS: The maximum score for this question is {max_marks}. Please provide the score out of {max_marks} (e.g. X/{max_marks}).")

        if question_text:
            parts.append(f"Question: {question_text}")
        
        if answer_text:
            parts.append(f"Answer: {answer_text}")
            
        if question_image and question_image.filename:
            q_image_data = await question_image.read()
            parts.append({
                "mime_type": question_image.content_type,
                "data": q_image_data
            })
            
        if answer_image and answer_image.filename:
            a_image_data = await answer_image.read()
            parts.append({
                "mime_type": answer_image.content_type,
                "data": a_image_data
            })

        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=parts,
            config={
                'response_mime_type': 'application/json',
                'response_schema': EvaluationResponse
            }
        )
        eval_data = EvaluationResponse.model_validate_json(response.text)
        return eval_data.model_dump()
        
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/evaluate_pdf")
async def evaluate_pdf(
    background_tasks: BackgroundTasks,
    pdf_file: UploadFile = File(...),
    language: str = Form("English"),
    max_marks: str = Form("10"),
    system_prompt: str = Form(None)
):
    try:
        # Read PDF content
        contents = await pdf_file.read()
        pdf_reader = PyPDF2.PdfReader(io.BytesIO(contents))
        pdf_text = ""
        for page in pdf_reader.pages:
            pdf_text += page.extract_text() + "\n"
        
        job_id = str(uuid.uuid4())
        created_at = datetime.now()
        available_at = created_at + timedelta(seconds=10)
        
        jobs = get_jobs()
        jobs[job_id] = {
            "status": "processing",
            "created_at": created_at.isoformat(),
            "available_at": available_at.isoformat(),
            "language": language,
            "max_marks": max_marks,
            "system_prompt": system_prompt,
            "results": []
        }
        save_jobs(jobs)
        
        background_tasks.add_task(process_bulk_pdf, job_id, pdf_text, language, max_marks, system_prompt)
        
        return {"job_id": job_id, "available_at": available_at.isoformat()}
        
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/job_status/{job_id}")
async def get_job_status(job_id: str):
    jobs = get_jobs()
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
        
    job = jobs[job_id]
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
        parts = [NOTES_SYSTEM_PROMPT]
        parts.append(f"TOPIC: {topic}")
        parts.append(f"LANGUAGE: {language}")
        
        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=parts,
        )
        return {"result": response.text}
        
    except Exception as e:
        print(f"Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

FLASHCARD_SYSTEM_PROMPT = """
You are an expert academic flashcard creator specializing in UPSC Civil Services exam content.
Your task is to generate high-quality, exam-focused flashcards from the given content or topic.

Rules:
- Each question must be clear, specific, and test one concept at a time.
- Answers must be concise yet complete (2-4 sentences max).
- Focus on facts, definitions, dates, comparisons, and cause-effect relationships.
- Make questions in the style of UPSC Mains/Prelims where appropriate.
- Vary question types: What, Why, How, Compare, Define, Enumerate.
- The title should reflect the topic of the flashcard set.
- Generate exactly the number of cards requested.
- All content must be in the specified language.
"""

@app.post("/generate_flashcards")
async def generate_flashcards(
    topic: str = Form(None),
    content: str = Form(None),
    num_cards: int = Form(20),
    language: str = Form("English")
):
    try:
        if not topic and not content:
            raise HTTPException(status_code=400, detail="Provide either a topic or content to generate flashcards.")

        source = f"TOPIC: {topic}" if topic else f"CONTENT:\n{content[:15000]}"
        
        # If num_cards is 0, we ask the AI to determine the count
        card_count_instruction = f"Generate exactly {num_cards} flashcards." if num_cards > 0 else "Generate an appropriate number of flashcards (between 10 and 60) to comprehensively cover all key points in the content without missing significant details."

        prompt = f"""{FLASHCARD_SYSTEM_PROMPT}

{source}

LANGUAGE: {language}
{card_count_instruction}
\
Return as JSON.
"""

        response = client.models.generate_content(
            model='gemini-2.5-flash-lite',
            contents=[prompt],
            config={
                'response_mime_type': 'application/json',
                'response_schema': FlashcardSet
            }
        )

        flashcard_data = FlashcardSet.model_validate_json(response.text)
        return flashcard_data.model_dump()

    except Exception as e:
        print(f"Flashcard generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# MongoDB Endpoints
@app.post("/api/save_flashcard_set")
async def save_flashcard_set(fc_set: SavedFlashcardSet):
    try:
        set_dict = fc_set.model_dump(exclude={"id"})
        result = await flashcard_sets_collection.insert_one(set_dict)
        return {"id": str(result.inserted_id), "status": "saved"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/flashcard_sets")
async def get_flashcard_sets():
    try:
        sets = []
        async for s in flashcard_sets_collection.find().sort("created_at", -1):
            s["_id"] = str(s["_id"])
            sets.append(s)
        return sets
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/save_session")
async def save_session(session: StudySession):
    try:
        session_dict = session.model_dump()
        result = await sessions_collection.insert_one(session_dict)
        return {"id": str(result.inserted_id), "status": "session_recorded"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/performance")
async def get_performance():
    try:
        sessions = []
        async for s in sessions_collection.find().sort("timestamp", -1):
            s["_id"] = str(s["_id"])
            sessions.append(s)
        return sessions
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=host, port=port,reload=True)