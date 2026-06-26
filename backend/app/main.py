"""
FastAPI application entrypoint for Z-DRONE Backend.

Endpoints:
  REST:
    POST   /auth/login          — Get JWT token
    GET    /drones              — List all drones
    POST   /drones              — Register new drone
    PUT    /drones/{id}/telemetry — Update live telemetry
    GET    /flights             — List all flights/missions
    POST   /flights             — Dispatch new mission
    PUT    /flights/{id}        — Update flight status
    GET    /alerts              — List all alerts
    POST   /alerts              — Create alert (AI detection)
    PUT    /alerts/{id}/resolve — Resolve alert
    GET    /streams/{drone_id}  — Get KVS WebRTC info for live camera

  WebSocket:
    WS /ws/telemetry            — Live drone GPS/battery broadcast
    WS /ws/alerts               — Live AI safety alert broadcast

  Docs:
    GET /docs                   — Swagger interactive API docs
    GET /redoc                  — ReDoc API docs
"""
import json
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from passlib.context import CryptContext
from sqlalchemy import select

from app.config import get_settings
from app.database import init_db, AsyncSessionLocal
from app.models import User, Drone, Flight, Alert
from app.routers import auth, drones, flights, alerts, streams
from app.routers import autopilot
from app.ws_manager import telemetry_manager, alert_manager
from app.services.mavlink_bridge import get_bridge

settings = get_settings()
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")


# ── Seed initial data ────────────────────────────────────────
async def seed_database():
    async with AsyncSessionLocal() as db:
        # Seed admin user
        result = await db.execute(select(User).where(User.username == settings.admin_username))
        if not result.scalar_one_or_none():
            admin = User(
                username=settings.admin_username,
                name="Admin",
                role="Fleet Manager",
                email="admin@z-drone.com",
                hashed_password=pwd_ctx.hash(settings.admin_password),
                status="Active",
            )
            db.add(admin)

        # Seed sample drone fleet
        drones_data = [
            {"id": "ZD-109", "model": "Falcon Cargo X1", "type": "Cargo Delivery",
             "status": "Online", "battery": 88, "signal": "Excellent", "altitude": 45,
             "speed": 12, "lat": 34.0522, "lng": -118.2437,
             "health": {"propulsion": 98, "optical": 92, "chassis": 84},
             "payload": "2.5 kg Medical Package", "destination": "Westside Hospital Pad", "operator": "C. Nolan"},
            {"id": "ZD-088", "model": "Horizon Scan 4", "type": "Surveillance",
             "status": "Online", "battery": 14, "signal": "Poor", "altitude": 15,
             "speed": 5, "lat": 34.0622, "lng": -118.2537,
             "health": {"propulsion": 94, "optical": 88, "chassis": 78},
             "payload": "FLIR Camera Pod", "destination": "Automated Return-to-Base", "operator": "A. Miller"},
            {"id": "ZD-112", "model": "Inspector Pro V2", "type": "Infrastructure Inspection",
             "status": "Maintenance", "battery": 95, "signal": "None", "altitude": 0,
             "speed": 0, "lat": 34.0422, "lng": -118.2337,
             "health": {"propulsion": 90, "optical": 85, "chassis": 80},
             "payload": "LIDAR System", "destination": "Hangar Sector 4", "operator": "S. Jobs"},
            {"id": "ZD-055", "model": "Scout Nano", "type": "Mapping",
             "status": "Offline", "battery": 0, "signal": "None", "altitude": 0,
             "speed": 0, "lat": 34.0489, "lng": -118.2611,
             "health": {"propulsion": 80, "optical": 75, "chassis": 90},
             "payload": "High-Res Mapping Camera", "destination": "Storage Rack B", "operator": "E. Musk"},
        ]
        for d in drones_data:
            existing = await db.execute(select(Drone).where(Drone.id == d["id"]))
            if not existing.scalar_one_or_none():
                stream_name = f"{settings.kvs_stream_name_prefix}-{d['id'].lower()}-cam"
                drone = Drone(stream_name=stream_name, **d)
                db.add(drone)

        # Seed sample flights
        flights_data = [
            {"id": "F-9021", "drone_id": "ZD-109", "date": "2026-06-18", "duration": "42m 12s",
             "distance": "12.4 km", "pilot": "C. Nolan", "status": "Completed"},
            {"id": "F-9020", "drone_id": "ZD-088", "date": "2026-06-18", "duration": "15m 08s",
             "distance": "4.2 km", "pilot": "A. Miller", "status": "In Progress"},
        ]
        for f in flights_data:
            existing = await db.execute(select(Flight).where(Flight.id == f["id"]))
            if not existing.scalar_one_or_none():
                db.add(Flight(**f))

        # Seed sample alerts
        alerts_data = [
            {"id": "ALT-001", "time": "10:42 AM", "unit": "ZD-088", "type": "battery_alert",
             "title": "Critical Low Battery", "severity": "error",
             "description": "Battery dropped below 15%. Auto return-to-base initiated.", "resolved": False},
            {"id": "ALT-002", "time": "09:15 AM", "unit": "Sector Alpha", "type": "air",
             "title": "High Wind Warning", "severity": "warning",
             "description": "Wind speeds exceeding 35km/h. Lightweight units grounded.", "resolved": False},
        ]
        for a in alerts_data:
            existing = await db.execute(select(Alert).where(Alert.id == a["id"]))
            if not existing.scalar_one_or_none():
                db.add(Alert(**a))

        await db.commit()
        print("✅ Database seeded with initial data.")


# ── App Lifespan ─────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    print("🚀 Starting Z-DRONE Backend...")
    await init_db()
    await seed_database()

    # Wire MAVLink bridge telemetry → /ws/telemetry broadcaster
    async def _on_mavlink_telemetry(state: dict):
        """Called by MAVLinkBridge on every telemetry tick, forwarded to GCS clients."""
        await telemetry_manager.broadcast({
            "type": "mavlink_telemetry",
            "data": state,
        })
    get_bridge().add_telemetry_callback(_on_mavlink_telemetry)
    print("✅ MAVLink telemetry bridge wired to WebSocket broadcaster.")
    print(f"✅ Backend running. Docs: http://localhost:{settings.port}/docs")
    yield
    # Cleanup on shutdown
    get_bridge().remove_telemetry_callback(_on_mavlink_telemetry)
    await get_bridge().disconnect()
    print("🛑 Shutting down Z-DRONE Backend.")


# ── App Instance ─────────────────────────────────────────────
app = FastAPI(
    title="Z-DRONE Fleet Management API",
    description="Enterprise drone fleet management backend with live telemetry, WebRTC camera streaming via AWS Kinesis, and AI safety alerts.",
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ── CORS ─────────────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── REST Routers ─────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(drones.router)
app.include_router(flights.router)
app.include_router(alerts.router)
app.include_router(streams.router)
app.include_router(autopilot.router)   # ArduPilot / MAVLink GCS control


# ── WebSocket: Live Telemetry ─────────────────────────────────
@app.websocket("/ws/telemetry")
async def ws_telemetry(ws: WebSocket):
    """
    Live telemetry WebSocket.
    Clients connect here and receive real-time drone position/battery/speed
    messages broadcast whenever a drone's telemetry is updated.
    Message format:
      { "type": "telemetry", "drone_id": "ZD-109", "data": {...}, "timestamp": "..." }
    """
    await telemetry_manager.connect(ws)
    try:
        while True:
            # Keep connection alive; data is pushed via telemetry_manager.broadcast()
            text = await ws.receive_text()
            if text == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        telemetry_manager.disconnect(ws)


# ── WebSocket: Live Alerts ────────────────────────────────────
@app.websocket("/ws/alerts")
async def ws_alerts(ws: WebSocket):
    """
    Live safety alerts WebSocket.
    Clients connect here and receive real-time safety alerts
    (battery warnings, AI pedestrian detections, wind warnings, etc.)
    Message format:
      { "type": "alert", "alert": {...} }
    """
    await alert_manager.connect(ws)
    try:
        while True:
            text = await ws.receive_text()
            if text == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        alert_manager.disconnect(ws)


# ── Health Check ─────────────────────────────────────────────
@app.get("/health", tags=["System"])
async def health_check():
    return {"status": "healthy", "service": "Z-DRONE Backend API v1.0"}


@app.get("/", tags=["System"])
async def root():
    return {
        "message": "Z-DRONE Fleet Management API",
        "docs": "/docs",
        "websockets": ["/ws/telemetry", "/ws/alerts"],
    }
