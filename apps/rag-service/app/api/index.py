"""
/index endpoint: triggered by BullMQ job via the Node.js API.
Indexes (or re-indexes) a plan's content into pgvector.
"""

from fastapi import APIRouter, HTTPException, Header, Depends
from pydantic import BaseModel
from app.core.config import settings
from app.services.indexer import index_plan

router = APIRouter()


def verify_internal_secret(x_internal_secret: str = Header(...)):
    if x_internal_secret != settings.rag_service_secret:
        raise HTTPException(status_code=401, detail="Unauthorized")


class IndexRequest(BaseModel):
    planId: str
    influencerId: str


@router.post("/index", dependencies=[Depends(verify_internal_secret)])
async def index_plan_endpoint(body: IndexRequest):
    try:
        await index_plan(body.planId, body.influencerId)
        return {"status": "ok", "planId": body.planId}
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Indexing failed: {str(e)}")
