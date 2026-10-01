import logging
from typing import List, Optional
from app.core.config import settings

logger = logging.getLogger(__name__)

# Initialize Google GenAI client if GEMINI_API_KEY is configured
_genai_client = None
if settings.GEMINI_API_KEY:
    try:
        from google import genai
        _genai_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    except Exception as e:
        logger.warning(f"Failed to initialize google-genai client: {e}")


def get_embedding(text: str) -> List[float]:
    """
    Generates a 768-dimensional embedding vector using Google Gemini text-embedding-004.
    Falls back gracefully to deterministic normalized vector if API key is not configured or fails.
    """
    global _genai_client
    if _genai_client:
        try:
            model = settings.GEMINI_EMBEDDING_MODEL or "text-embedding-004"
            if model.startswith("models/"):
                model = model.replace("models/", "")

            response = _genai_client.models.embed_content(
                model=model,
                contents=text,
            )
            # Retrieve embedding list
            if hasattr(response, "embeddings") and response.embeddings:
                emb = response.embeddings[0].values
            elif hasattr(response, "embedding") and response.embedding:
                emb = response.embedding.values
            else:
                emb = None

            if emb:
                emb_list = list(emb)
                if len(emb_list) == 768:
                    return emb_list
                elif len(emb_list) > 768:
                    return emb_list[:768]
                else:
                    return emb_list + [0.0] * (768 - len(emb_list))
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
    Generates text completion using the modern Google GenAI SDK if configured.
    Returns None if not configured, allowing caller heuristics to handle gracefully.
    """
    global _genai_client
    if not _genai_client:
        return None
    try:
        from google.genai import types
        config = types.GenerateContentConfig(
            system_instruction=system_instruction
        ) if system_instruction else None

        response = _genai_client.models.generate_content(
            model=settings.GEMINI_MODEL or "gemini-2.5-flash",
            contents=prompt,
            config=config,
        )
        return response.text
    except Exception as err:
        logger.warning(f"Gemini LLM generation failed: {err}")
        return None
