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
from app.routers import auth, drones, flights, alerts, streams, detections, inference
from app.routers import autopilot
from app.ws_manager import telemetry_manager, alert_manager, detection_manager
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
            {"id": "drone01", "model": "Jetson Edge Cam", "type": "Surveillance",
             "status": "Online", "battery": 100, "signal": "Excellent", "altitude": 0,
             "speed": 0, "lat": 28.8308, "lng": 76.9311,
             "health": {"propulsion": 100, "optical": 100, "chassis": 100},
             "payload": "Onboard Video Feed", "destination": "Active Site", "operator": "Admin"},
        ]
        for d in drones_data:
            existing = await db.execute(select(Drone).where(Drone.id == d["id"]))
            if not existing.scalar_one_or_none():
                stream_name = f"{settings.kvs_stream_name_prefix}-{d['id'].lower()}-cam"
                drone = Drone(stream_name=stream_name, **d)
                db.add(drone)

        # Seed sample flights
        flights_data = []
        for f in flights_data:
            existing = await db.execute(select(Flight).where(Flight.id == f["id"]))
            if not existing.scalar_one_or_none():
                db.add(Flight(**f))

        # Seed sample alerts
        alerts_data = []
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
# Allow all origins so that the app works regardless of the tunnel URL
# (lhr.life, ngrok, etc.) or Vercel preview URLs.
# The API is JWT-protected, so broad CORS is safe here.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,   # Must be False when allow_origins=["*"]
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

# ── REST Routers ─────────────────────────────────────────────
app.include_router(auth.router)
app.include_router(drones.router)
app.include_router(flights.router)
app.include_router(alerts.router)
app.include_router(streams.router)
app.include_router(autopilot.router)   # ArduPilot / MAVLink GCS control
app.include_router(detections.router)
app.include_router(inference.router)

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


# ── WebSocket: Live Detections ───────────────────────────────
@app.websocket("/ws/detections")
async def ws_detections(ws: WebSocket):
    """
    Live Jetson detection WebSocket.
    Clients connect here and receive real-time detection payloads whenever
    the Jetson posts to POST /api/v1/detections.
    Message format:
      { "type": "detection", "device_id": "drone01", "person_count": 2, "fps": 28.5,
        "frame_id": 4821, "timestamp": 1719628537528, "detections": [...] }
    """
    await detection_manager.connect(ws)
    try:
        while True:
            text = await ws.receive_text()
            if text == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
    except WebSocketDisconnect:
        detection_manager.disconnect(ws)


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
