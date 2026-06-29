"""
Detections router — receives real-time AI detection payloads from Jetson edge devices.

Flow:
  1. Jetson sends POST /api/v1/detections with JWT bearer token.
  2. Payload is validated, persisted to detection_events table.
  3. Payload is broadcast over /ws/detections to all connected dashboard clients.
  4. If person_count > 0, an Alert is auto-created and broadcast over /ws/alerts.
"""
import json
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.schemas import DetectionPayload
from app.models import DetectionEvent, Alert, AlertSeverity
from app.database import get_db
from app.routers.auth import get_current_user
from app.ws_manager import detection_manager, alert_manager

router = APIRouter(prefix="/api/v1/detections", tags=["Detections"])


@router.post("", status_code=status.HTTP_200_OK)
async def process_detections(payload: DetectionPayload, db: AsyncSession = Depends(get_db)):
    """
    Ingest real-time AI detections from the Jetson edge device.
    - Persists to DB
    - Broadcasts over /ws/detections
    - Auto-creates alert if persons detected
    """
    # 1. Persist to database
    event = DetectionEvent(
        device_id=payload.device_id,
        frame_id=payload.frame_id,
        timestamp=payload.timestamp,
        fps=payload.fps,
        person_count=payload.person_count,
        detections=[d.model_dump() for d in payload.detections],
    )
    db.add(event)
    await db.commit()
    await db.refresh(event)

    # 2. Broadcast detection payload to /ws/detections subscribers
    ws_payload = {
        "type": "detection",
        "id": event.id,
        "device_id": payload.device_id,
        "frame_id": payload.frame_id,
        "timestamp": payload.timestamp,
        "fps": payload.fps,
        "person_count": payload.person_count,
        "detections": [d.model_dump() for d in payload.detections],
        "server_time": datetime.now(timezone.utc).isoformat(),
    }
    await detection_manager.broadcast(ws_payload)

    # 3. Auto-create alert when persons are detected
    if payload.person_count > 0:
        alert_id = f"ALT-DET-{payload.device_id}-{payload.frame_id}"
        # Check if alert already exists for this frame to avoid duplicates
        existing = await db.execute(select(Alert).where(Alert.id == alert_id))
        if not existing.scalar_one_or_none():
            now = datetime.now(timezone.utc)
            alert = Alert(
                id=alert_id,
                time=now.strftime("%I:%M %p"),
                unit=payload.device_id,
                type="person_detection",
                title=f"Person Detected — {payload.person_count} person(s)",
                description=(
                    f"Drone {payload.device_id} detected {payload.person_count} person(s) "
                    f"at frame {payload.frame_id} (confidence: "
                    f"{max((d.confidence for d in payload.detections), default=0):.1%}). "
                    f"FPS: {payload.fps:.1f}"
                ),
                severity=AlertSeverity.error if payload.person_count >= 2 else AlertSeverity.warning,
                resolved=False,
            )
            db.add(alert)
            await db.commit()

            # Broadcast alert to /ws/alerts
            alert_msg = {
                "type": "alert",
                "alert": {
                    "id": alert_id,
                    "time": alert.time,
                    "unit": alert.unit,
                    "type": alert.type,
                    "title": alert.title,
                    "description": alert.description,
                    "severity": alert.severity,
                    "resolved": False,
                },
                "timestamp": now.isoformat(),
            }
            await alert_manager.broadcast(alert_msg)

    print(
        f"[Detection] {payload.device_id} | frame={payload.frame_id} | "
        f"persons={payload.person_count} | fps={payload.fps:.1f}"
    )
    return {"status": "success", "message": "Detections received", "event_id": event.id}


@router.get("/stats/{device_id}", dependencies=[Depends(get_current_user)])
async def get_detection_stats(device_id: str, db: AsyncSession = Depends(get_db)):
    """Return aggregated detection stats for a device (total events, total persons, avg FPS)."""
    result = await db.execute(
        select(
            func.count(DetectionEvent.id).label("total_events"),
            func.sum(DetectionEvent.person_count).label("total_persons"),
            func.avg(DetectionEvent.fps).label("avg_fps"),
            func.max(DetectionEvent.person_count).label("peak_count"),
        ).where(DetectionEvent.device_id == device_id)
    )
    row = result.one()
    return {
        "device_id": device_id,
        "total_events": row.total_events or 0,
        "total_persons": int(row.total_persons or 0),
        "avg_fps": round(row.avg_fps or 0, 1),
        "peak_count": row.peak_count or 0,
    }


@router.get("/recent/{device_id}", dependencies=[Depends(get_current_user)])
async def get_recent_detections(device_id: str, limit: int = 50, db: AsyncSession = Depends(get_db)):
    """Return the last N detection events for a device."""
    result = await db.execute(
        select(DetectionEvent)
        .where(DetectionEvent.device_id == device_id)
        .order_by(DetectionEvent.id.desc())
        .limit(limit)
    )
    events = result.scalars().all()
    return [
        {
            "id": e.id,
            "device_id": e.device_id,
            "frame_id": e.frame_id,
            "timestamp": e.timestamp,
            "fps": e.fps,
            "person_count": e.person_count,
            "detections": e.detections,
            "created_at": e.created_at.isoformat(),
        }
        for e in events
    ]
