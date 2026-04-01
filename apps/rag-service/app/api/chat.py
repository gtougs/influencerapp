"""
/chat endpoint: accepts a user message + session context, streams back GPT-4o
response via SSE, grounded in the influencer's indexed documents.
"""

from fastapi import APIRouter, HTTPException, Header, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from app.core.config import settings
from app.services.chat import stream_chat_response

router = APIRouter()


def verify_internal_secret(x_internal_secret: str = Header(...)):
    if x_internal_secret != settings.rag_service_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")


class ChatRequest(BaseModel):
    sessionId: str
    influencerId: str
    message: str


@router.post("/chat", dependencies=[Depends(verify_internal_secret)])
async def chat_endpoint(body: ChatRequest):
    return StreamingResponse(
        stream_chat_response(
            session_id=body.sessionId,
            influencer_id=body.influencerId,
            user_message=body.message,
        ),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
