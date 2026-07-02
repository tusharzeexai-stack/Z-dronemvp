"""
Autopilot Router — Z-DRONE ArduPilot / MAVLink Control API
===========================================================

All endpoints communicate with the MAVLink bridge service which wraps
either a real ArduPilot connection (MAVSDK) or the built-in mock SITL.

REST prefix:  /api/drone   and   /api/mission
WebSocket:    /ws/telemetry  (see main.py — telemetry pushed via bridge callback)
"""

from fastapi import APIRouter
from pydantic import BaseModel, Field
from typing import List, Optional
import subprocess
import os

from app.services.mavlink_bridge import get_bridge

router = APIRouter(prefix="/api", tags=["Autopilot"])


# ── Request Schemas ────────────────────────────────────────────────────────────

class ConnectRequest(BaseModel):
    connection_string: str = Field(
        default="udp://:14540",
        description="MAVLink connection string: udp://:14540 | serial:///dev/ttyUSB0:57600 | udp://192.168.1.10:14550"
    )

class TakeoffRequest(BaseModel):
    altitude: float = Field(default=15.0, description="Target altitude in meters AGL")

class ModeRequest(BaseModel):
    mode: str = Field(description="ArduPilot flight mode: STABILIZE, GUIDED, AUTO, LOITER, RTL, LAND")

class WaypointItem(BaseModel):
    lat: float
    lng: float
    alt: Optional[float] = Field(default=30.0, description="Altitude (m)")
    speed: Optional[float] = Field(default=10.0, description="Speed (m/s)")
    hover_time: Optional[float] = Field(default=0.0, description="Hover time at waypoint (s)")
    heading: Optional[float] = Field(default=90.0, description="Target heading (deg)")
    gimbal_pitch: Optional[float] = Field(default=-45.0, description="Gimbal pitch (deg)")
    action: Optional[str] = Field(default="None")

class MissionUploadRequest(BaseModel):
    waypoints: List[WaypointItem]


# ── Telemetry Snapshot ─────────────────────────────────────────────────────────

@router.get("/drone/telemetry", summary="Get latest telemetry snapshot")
async def get_telemetry():
    """Returns the most recent cached telemetry from the autopilot."""
    return get_bridge().get_telemetry()


# ── Connection Management ──────────────────────────────────────────────────────

@router.post("/drone/connect", summary="Connect to ArduPilot via MAVLink")
async def connect_autopilot(req: ConnectRequest):
    """
    Connect to ArduPilot via MAVLink.
    Automatically falls back to built-in SITL simulation if unreachable.
    """
    result = await get_bridge().connect(req.connection_string)
    return result


@router.post("/drone/disconnect", summary="Disconnect from autopilot")
async def disconnect_autopilot():
    result = await get_bridge().disconnect()
    return result


# ── SITL Simulation Control ───────────────────────────────────────────────────

@router.get("/drone/sitl/status", summary="Get local SITL status")
async def get_sitl_status():
    try:
        script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "manage-sitl.sh"))
        if os.path.exists(script_path):
            res = subprocess.run(["bash", script_path, "status"], capture_output=True, text=True)
            is_running = "SITL* RUNNING" in res.stdout
            return {"status": "success", "running": is_running}
        return {"status": "error", "message": f"manage-sitl.sh script not found at {script_path}."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/drone/sitl/start", summary="Start cloud SITL simulation")
async def start_sitl():
    try:
        script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "manage-sitl.sh"))
        if os.path.exists(script_path):
            # Run in background via Popen so it doesn't block the API response
            subprocess.Popen(["bash", script_path, "start"], start_new_session=True)
            return {"status": "success", "message": "SITL startup sequence initialized in background."}
        return {"status": "error", "message": f"manage-sitl.sh script not found at {script_path}."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


@router.post("/drone/sitl/stop", summary="Stop cloud SITL simulation")
async def stop_sitl():
    try:
        script_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", "manage-sitl.sh"))
        if os.path.exists(script_path):
            res = subprocess.run(["bash", script_path, "stop"], capture_output=True, text=True)
            return {"status": "success", "message": "SITL stop sequence executed.", "output": res.stdout}
        return {"status": "error", "message": f"manage-sitl.sh script not found at {script_path}."}
    except Exception as e:
        return {"status": "error", "message": str(e)}


# ── Flight Controls ────────────────────────────────────────────────────────────

@router.post("/drone/arm", summary="ARM drone motors")
async def arm():
    """Sends ARM command to the autopilot. Drone must be connected."""
    return await get_bridge().arm()


@router.post("/drone/disarm", summary="DISARM drone motors")
async def disarm():
    return await get_bridge().disarm()


@router.post("/drone/takeoff", summary="Guided takeoff to specified altitude")
async def takeoff(req: TakeoffRequest):
    return await get_bridge().takeoff(req.altitude)


@router.post("/drone/land", summary="Initiate landing sequence")
async def land():
    return await get_bridge().land()


@router.post("/drone/rtl", summary="Return-to-Launch")
async def rtl():
    """Commands drone to autonomously return to launch point."""
    return await get_bridge().rtl()


@router.post("/drone/mode", summary="Set flight mode")
async def set_mode(req: ModeRequest):
    """
    Change the active flight mode.
    Supported: STABILIZE, GUIDED, AUTO, LOITER, RTL, LAND
    """
    return await get_bridge().set_mode(req.mode)


# ── Mission Planning ───────────────────────────────────────────────────────────

@router.post("/mission/upload", summary="Upload waypoint mission to ArduPilot")
async def upload_mission(req: MissionUploadRequest):
    """
    Upload a list of waypoints to ArduPilot mission buffer.
    For real hardware this uses MAVSDK mission items.
    For simulation, waypoints are fed to the mock flight engine.
    """
    waypoints_dicts = [wp.model_dump() for wp in req.waypoints]
    return await get_bridge().upload_mission(waypoints_dicts)


@router.post("/mission/start", summary="Start AUTO mission")
async def start_mission():
    """
    Starts the uploaded mission in AUTO mode.
    Arms motors automatically if not already armed.
    """
    return await get_bridge().start_mission()


@router.post("/mission/pause", summary="Pause mission — hold in LOITER")
async def pause_mission():
    return await get_bridge().pause_mission()


@router.post("/mission/resume", summary="Resume paused mission")
async def resume_mission():
    return await get_bridge().resume_mission()


@router.post("/mission/abort", summary="Abort mission and initiate RTL")
async def abort_mission():
    return await get_bridge().abort_mission()
