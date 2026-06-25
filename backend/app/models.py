from sqlalchemy import Column, String, Float, Integer, Boolean, DateTime, JSON, ForeignKey, Enum as SAEnum
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from app.database import Base
import enum


class DroneStatus(str, enum.Enum):
    online = "Online"
    offline = "Offline"
    maintenance = "Maintenance"


class FlightStatus(str, enum.Enum):
    scheduled = "Scheduled"
    in_progress = "In Progress"
    completed = "Completed"
    aborted = "Aborted"


class AlertSeverity(str, enum.Enum):
    error = "error"
    warning = "warning"
    success = "success"


class Drone(Base):
    __tablename__ = "drones"

    id = Column(String, primary_key=True, index=True)  # e.g. ZD-109
    model = Column(String, nullable=False)
    type = Column(String, nullable=False)  # Cargo Delivery, Surveillance, etc.
    status = Column(SAEnum(DroneStatus), default=DroneStatus.offline)
    battery = Column(Float, default=100.0)
    signal = Column(String, default="Excellent")
    altitude = Column(Float, default=0.0)
    speed = Column(Float, default=0.0)
    lat = Column(Float, default=0.0)
    lng = Column(Float, default=0.0)
    payload = Column(String, nullable=True)
    destination = Column(String, nullable=True)
    operator = Column(String, nullable=True)
    health = Column(JSON, default={"propulsion": 100, "optical": 100, "chassis": 100})
    # Kinesis stream name for live camera
    stream_name = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    flights = relationship("Flight", back_populates="drone_rel", lazy="select")
    telemetry_logs = relationship("TelemetryLog", back_populates="drone_rel", lazy="select")


class Flight(Base):
    __tablename__ = "flights"

    id = Column(String, primary_key=True, index=True)  # e.g. F-9021
    drone_id = Column(String, ForeignKey("drones.id"), nullable=False)
    date = Column(String, nullable=False)
    duration = Column(String, default="--")
    distance = Column(String, default="--")
    pilot = Column(String, nullable=False)
    status = Column(SAEnum(FlightStatus), default=FlightStatus.scheduled)
    destination = Column(String, nullable=True)
    payload = Column(String, nullable=True)
    waypoints = Column(JSON, nullable=True)  # List of {lat, lng} for mission path
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    drone_rel = relationship("Drone", back_populates="flights")


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(String, primary_key=True, index=True)  # e.g. ALT-001
    time = Column(String, nullable=False)
    unit = Column(String, nullable=False)  # drone id or sector
    type = Column(String, nullable=False)  # battery_alert, pedestrian, wind_warning
    title = Column(String, nullable=False)
    description = Column(String, nullable=False)
    severity = Column(SAEnum(AlertSeverity), default=AlertSeverity.warning)
    resolved = Column(Boolean, default=False)
    video_url = Column(String, nullable=True)  # S3/Kinesis clip URL for evidence
    frame_timestamp = Column(Float, nullable=True)  # video timestamp for clip
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, autoincrement=True)
    username = Column(String, unique=True, nullable=False, index=True)
    name = Column(String, nullable=False)
    role = Column(String, default="Operator")
    email = Column(String, unique=True, nullable=True)
    hashed_password = Column(String, nullable=False)
    status = Column(String, default="Active")
    flights = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))


class TelemetryLog(Base):
    __tablename__ = "telemetry_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    drone_id = Column(String, ForeignKey("drones.id"), nullable=False)
    battery = Column(Float)
    altitude = Column(Float)
    speed = Column(Float)
    lat = Column(Float)
    lng = Column(Float)
    signal = Column(String)
    logged_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    drone_rel = relationship("Drone", back_populates="telemetry_logs")
