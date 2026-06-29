from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from enum import Enum


# ── Enums ──────────────────────────────────────────────────
class DroneStatus(str, Enum):
    online = "Online"
    offline = "Offline"
    maintenance = "Maintenance"

class FlightStatus(str, Enum):
    scheduled = "Scheduled"
    in_progress = "In Progress"
    completed = "Completed"
    aborted = "Aborted"

class AlertSeverity(str, Enum):
    error = "error"
    warning = "warning"
    success = "success"


# ── Auth ───────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: Dict[str, Any]


# ── Drones ─────────────────────────────────────────────────
class DroneHealth(BaseModel):
    propulsion: float = 100.0
    optical: float = 100.0
    chassis: float = 100.0

class DroneBase(BaseModel):
    model: str
    type: str
    payload: Optional[str] = None
    destination: Optional[str] = None
    operator: Optional[str] = None

class DroneCreate(DroneBase):
    id: Optional[str] = None  # Auto-generated if not provided

class DroneResponse(DroneBase):
    id: str
    status: DroneStatus
    battery: float
    signal: str
    altitude: float
    speed: float
    lat: float
    lng: float
    health: Dict[str, float]
    stream_name: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class TelemetryUpdate(BaseModel):
    battery: Optional[float] = None
    altitude: Optional[float] = None
    speed: Optional[float] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    signal: Optional[str] = None
    status: Optional[DroneStatus] = None


# ── Flights ────────────────────────────────────────────────
class WayPoint(BaseModel):
    lat: float
    lng: float

class FlightCreate(BaseModel):
    drone_id: str
    pilot: str
    destination: Optional[str] = None
    payload: Optional[str] = None
    waypoints: Optional[List[WayPoint]] = None

class FlightResponse(BaseModel):
    id: str
    drone_id: str
    date: str
    duration: str
    distance: str
    pilot: str
    status: FlightStatus
    destination: Optional[str] = None
    payload: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True

class FlightUpdate(BaseModel):
    status: Optional[FlightStatus] = None
    duration: Optional[str] = None
    distance: Optional[str] = None


# ── Alerts ─────────────────────────────────────────────────
class AlertCreate(BaseModel):
    unit: str
    type: str
    title: str
    description: str
    severity: AlertSeverity
    video_url: Optional[str] = None
    frame_timestamp: Optional[float] = None

class AlertResponse(BaseModel):
    id: str
    time: str
    unit: str
    type: str
    title: str
    description: str
    severity: AlertSeverity
    resolved: bool
    video_url: Optional[str] = None
    frame_timestamp: Optional[float] = None
    created_at: datetime

    class Config:
        from_attributes = True


# ── Users ──────────────────────────────────────────────────
class UserResponse(BaseModel):
    id: int
    name: str
    role: str
    email: Optional[str]
    status: str
    flights: int

    class Config:
        from_attributes = True


# ── Streams ────────────────────────────────────────────────
class StreamInfo(BaseModel):
    drone_id: str
    stream_name: str
    channel_arn: Optional[str] = None
    endpoint_url: Optional[str] = None
    ice_servers: Optional[List[Dict[str, Any]]] = None
    region: Optional[str] = None
    status: str  # "active", "inactive", "creating"


# ── WebSocket Messages ─────────────────────────────────────
class TelemetryMessage(BaseModel):
    type: str = "telemetry"
    drone_id: str
    data: Dict[str, Any]
    timestamp: str

class AlertMessage(BaseModel):
    type: str = "alert"
    alert: Dict[str, Any]
    timestamp: str

# ── Detections ────────────────────────────────────────────────
class BoundingBox(BaseModel):
    model_config = {"extra": "allow"}  # Accept any extra fields from Jetson
    id: Optional[int] = None
    confidence: float = 0.0
    x: Optional[int] = None
    y: Optional[int] = None
    w: Optional[int] = None
    h: Optional[int] = None
    cls: Optional[str] = None          # class name e.g. "person"
    class_id: Optional[int] = None
    bbox: Optional[List[float]] = None  # alternative [x,y,w,h] format

class DetectionPayload(BaseModel):
    model_config = {"extra": "allow"}  # Accept any extra fields without crashing
    device_id: str
    frame_id: int = 0
    timestamp: int = 0
    fps: float = 0.0
    person_count: int = 0
    detections: List[BoundingBox] = []


class DetectionEventResponse(BaseModel):
    id: int
    device_id: str
    frame_id: int
    timestamp: int
    fps: float
    person_count: int
    detections: List[Dict[str, Any]]
    created_at: datetime

    class Config:
        from_attributes = True

