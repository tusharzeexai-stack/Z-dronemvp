"""
Drones router — CRUD + telemetry update for drone fleet.
"""
import random
import string
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models import Drone, Alert, TelemetryLog
from app.schemas import DroneCreate, DroneResponse, TelemetryUpdate, AlertCreate
from app.config import get_settings
from app.ws_manager import telemetry_manager, alert_manager

router = APIRouter(prefix="/drones", tags=["Drones"])
settings = get_settings()


def generate_drone_id() -> str:
    return f"ZD-{random.randint(100, 999)}"


@router.get("", response_model=List[DroneResponse])
async def list_drones(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Drone))
    return result.scalars().all()


@router.get("/{drone_id}", response_model=DroneResponse)
async def get_drone(drone_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Drone).where(Drone.id == drone_id))
    drone = result.scalar_one_or_none()
    if not drone:
        raise HTTPException(status_code=404, detail="Drone not found")
    return drone


@router.post("", response_model=DroneResponse, status_code=status.HTTP_201_CREATED)
async def register_drone(payload: DroneCreate, db: AsyncSession = Depends(get_db)):
    drone_id = payload.id or generate_drone_id()
    # Generate Kinesis stream name for this drone's camera
    stream_name = f"{settings.kvs_stream_name_prefix}-{drone_id.lower()}-cam"

    drone = Drone(
        id=drone_id,
        model=payload.model,
        type=payload.type,
        payload=payload.payload,
        destination=payload.destination,
        operator=payload.operator,
        stream_name=stream_name,
        lat=34.0522 + (random.random() - 0.5) * 0.02,
        lng=-118.2437 + (random.random() - 0.5) * 0.02,
        health={"propulsion": 100, "optical": 100, "chassis": 100},
    )
    db.add(drone)
    await db.commit()
    await db.refresh(drone)
    return drone


@router.put("/{drone_id}/telemetry", response_model=DroneResponse)
async def update_telemetry(drone_id: str, payload: TelemetryUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Drone).where(Drone.id == drone_id))
    drone = result.scalar_one_or_none()
    if not drone:
        raise HTTPException(status_code=404, detail="Drone not found")

    update_data = payload.model_dump(exclude_none=True)
    for key, val in update_data.items():
        setattr(drone, key, val)

    # Log telemetry snapshot
    log = TelemetryLog(
        drone_id=drone_id,
        battery=drone.battery,
        altitude=drone.altitude,
        speed=drone.speed,
        lat=drone.lat,
        lng=drone.lng,
        signal=drone.signal,
    )
    db.add(log)

    # Auto-trigger low battery alert
    settings_obj = settings
    if drone.battery is not None and drone.battery < 20 and str(drone.status) == "Online":
        existing = await db.execute(
            select(Alert).where(
                Alert.unit == drone_id,
                Alert.type == "battery_alert",
                Alert.resolved == False  # noqa: E712
            )
        )
        if not existing.scalar_one_or_none():
            alert = Alert(
                id=f"ALT-{''.join(random.choices(string.digits, k=6))}",
                time=__import__('datetime').datetime.now().strftime("%I:%M %p"),
                unit=drone_id,
                type="battery_alert",
                title="Critical Low Battery",
                description=f"Drone {drone_id} battery at {drone.battery:.0f}%. Auto return-to-base initiated.",
                severity="error",
            )
            db.add(alert)
            # Broadcast alert via WebSocket
            await alert_manager.broadcast({
                "type": "alert",
                "alert": {
                    "id": alert.id, "unit": alert.unit,
                    "title": alert.title, "severity": alert.severity,
                    "description": alert.description, "resolved": False
                }
            })

    await db.commit()
    await db.refresh(drone)

    # Broadcast telemetry to all dashboard clients
    await telemetry_manager.broadcast({
        "type": "telemetry",
        "drone_id": drone_id,
        "data": {
            "battery": drone.battery, "altitude": drone.altitude,
            "speed": drone.speed, "lat": drone.lat, "lng": drone.lng,
            "signal": drone.signal, "status": str(drone.status),
        },
        "timestamp": __import__('datetime').datetime.utcnow().isoformat(),
    })

    return drone


@router.delete("/{drone_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_drone(drone_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Drone).where(Drone.id == drone_id))
    drone = result.scalar_one_or_none()
    if not drone:
        raise HTTPException(status_code=404, detail="Drone not found")
    await db.delete(drone)
    await db.commit()
