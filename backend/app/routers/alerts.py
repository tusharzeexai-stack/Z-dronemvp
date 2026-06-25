"""
Alerts router — safety incident management.
"""
import random
import string
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models import Alert
from app.schemas import AlertCreate, AlertResponse
from app.ws_manager import alert_manager

router = APIRouter(prefix="/alerts", tags=["Alerts"])


@router.get("", response_model=List[AlertResponse])
async def list_alerts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).order_by(Alert.created_at.desc()))
    return result.scalars().all()


@router.post("", response_model=AlertResponse, status_code=status.HTTP_201_CREATED)
async def create_alert(payload: AlertCreate, db: AsyncSession = Depends(get_db)):
    """Create an alert manually (also used by AI detection system)."""
    alert_id = f"ALT-{''.join(random.choices(string.ascii_uppercase + string.digits, k=6))}"
    alert = Alert(
        id=alert_id,
        time=datetime.now().strftime("%I:%M %p"),
        unit=payload.unit,
        type=payload.type,
        title=payload.title,
        description=payload.description,
        severity=payload.severity,
        video_url=payload.video_url,
        frame_timestamp=payload.frame_timestamp,
    )
    db.add(alert)
    await db.commit()
    await db.refresh(alert)

    # Broadcast to all connected dashboard clients via WebSocket
    await alert_manager.broadcast({
        "type": "alert",
        "alert": {
            "id": alert.id,
            "unit": alert.unit,
            "title": alert.title,
            "description": alert.description,
            "severity": str(alert.severity),
            "time": alert.time,
            "resolved": alert.resolved,
            "video_url": alert.video_url,
            "frame_timestamp": alert.frame_timestamp,
        }
    })

    return alert


@router.put("/{alert_id}/resolve", response_model=AlertResponse)
async def resolve_alert(alert_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).where(Alert.id == alert_id))
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    alert.resolved = True
    await db.commit()
    await db.refresh(alert)
    return alert


@router.put("/resolve-all", status_code=status.HTTP_200_OK)
async def resolve_all_alerts(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Alert).where(Alert.resolved == False))  # noqa: E712
    alerts = result.scalars().all()
    for a in alerts:
        a.resolved = True
    await db.commit()
    return {"resolved": len(alerts)}
