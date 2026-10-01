import logging
from typing import List, Optional
import google.generativeai as genai
from app.core.config import settings

logger = logging.getLogger(__name__)

# Configure Google Generative AI if key is present
if settings.GEMINI_API_KEY:
    try:
        genai.configure(api_key=settings.GEMINI_API_KEY)
    except Exception as e:
        logger.warning(f"Failed to configure Google Generative AI: {e}")


def get_embedding(text: str) -> List[float]:
    """
    Generates a 768-dimensional embedding vector using Google Gemini text-embedding-004.
    Falls back gracefully to deterministic normalized vector if API key is not configured or fails.
    """
    if settings.GEMINI_API_KEY:
        try:
            model = settings.GEMINI_EMBEDDING_MODEL or "models/text-embedding-004"
            if not model.startswith("models/"):
                model = f"models/{model}"
            result = genai.embed_content(
                model=model,
                content=text,
                task_type="retrieval_document",
            )
            emb = result.get("embedding")
            if emb and len(emb) == 768:
                return emb
            elif emb:
                # If dimension differs, pad or slice to 768 to fit schema vector(768)
                if len(emb) > 768:
                    return emb[:768]
                return emb + [0.0] * (768 - len(emb))
        except Exception as err:
            logger.warning(f"Gemini embedding API call failed: {err}. Falling back to deterministic vector.")

    # High-speed fallback vector (768 dimensions)
    # Generates a pseudo-semantic deterministic projection based on character hashing
    vector = [0.0] * 768
    for i, char in enumerate(text.lower()[:768]):
        idx = (ord(char) * 17 + i * 31) % 768
        vector[idx] += 1.0 / (1.0 + (i % 5))
    # Normalize
    norm = sum(v * v for v in vector) ** 0.5
    if norm > 0:
        vector = [v / norm for v in vector]
    else:
        vector[0] = 1.0
    return vector


def generate_llm_completion(prompt: str, system_instruction: Optional[str] = None) -> Optional[str]:
    """
    Generates text completion using Gemini LLM if configured.
    Returns None if not configured, allowing caller heuristics to handle gracefully.
    """
    if not settings.GEMINI_API_KEY:
        return None
    try:
        model = genai.GenerativeModel(
            model_name=settings.GEMINI_MODEL or "gemini-2.5-flash",
            system_instruction=system_instruction,
        )
        response = model.generate_content(prompt)
        return response.text
    except Exception as err:
        logger.warning(f"Gemini LLM generation failed: {err}")
        return None
