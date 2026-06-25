"""
Flights router — mission planning & dispatch.
"""
import random
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import List

from app.database import get_db
from app.models import Flight, Drone
from app.schemas import FlightCreate, FlightResponse, FlightUpdate

router = APIRouter(prefix="/flights", tags=["Flights"])


@router.get("", response_model=List[FlightResponse])
async def list_flights(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Flight).order_by(Flight.created_at.desc()))
    return result.scalars().all()


@router.get("/{flight_id}", response_model=FlightResponse)
async def get_flight(flight_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Flight).where(Flight.id == flight_id))
    flight = result.scalar_one_or_none()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")
    return flight


@router.post("", response_model=FlightResponse, status_code=status.HTTP_201_CREATED)
async def dispatch_flight(payload: FlightCreate, db: AsyncSession = Depends(get_db)):
    # Validate drone exists
    dr = await db.execute(select(Drone).where(Drone.id == payload.drone_id))
    drone = dr.scalar_one_or_none()
    if not drone:
        raise HTTPException(status_code=404, detail=f"Drone {payload.drone_id} not found")

    flight_id = f"F-{random.randint(9000, 9999)}"
    flight = Flight(
        id=flight_id,
        drone_id=payload.drone_id,
        date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        pilot=payload.pilot,
        destination=payload.destination,
        payload=payload.payload,
        waypoints=[w.model_dump() for w in payload.waypoints] if payload.waypoints else None,
        status="Scheduled",
    )
    db.add(flight)

    # Set drone to Online/Busy
    drone.status = "Online"
    await db.commit()
    await db.refresh(flight)
    return flight


@router.put("/{flight_id}", response_model=FlightResponse)
async def update_flight(flight_id: str, payload: FlightUpdate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Flight).where(Flight.id == flight_id))
    flight = result.scalar_one_or_none()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")

    if payload.status:
        flight.status = payload.status
    if payload.duration:
        flight.duration = payload.duration
    if payload.distance:
        flight.distance = payload.distance

    await db.commit()
    await db.refresh(flight)
    return flight


@router.delete("/{flight_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_flight(flight_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Flight).where(Flight.id == flight_id))
    flight = result.scalar_one_or_none()
    if not flight:
        raise HTTPException(status_code=404, detail="Flight not found")
    await db.delete(flight)
    await db.commit()
