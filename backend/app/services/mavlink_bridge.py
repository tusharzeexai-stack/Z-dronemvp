"""
MAVLink Bridge Service — Z-DRONE GCS Backend
=============================================
Manages a persistent connection to ArduPilot via MAVSDK-Python.
Falls back to a realistic SITL mock simulation loop when no actual
autopilot (SITL or hardware) is reachable, so the dashboard always
works out-of-the-box in demo mode.

Connection modes:
  - Real SITL:     udp://:14540  (ArduPilot SITL default)
  - Real Pixhawk:  serial:///dev/ttyUSB0:57600
  - Mock SITL:     auto-engaged when the real endpoint is unreachable

External API (used by autopilot router):
  bridge = get_bridge()
  await bridge.connect("udp://:14540")
  await bridge.arm()
  await bridge.takeoff(15)
  await bridge.upload_mission(waypoints)   # list of {lat, lng, alt}
  await bridge.start_mission()
  await bridge.land()
  await bridge.rtl()
  await bridge.set_mode("LOITER")
  await bridge.disconnect()
  bridge.get_telemetry()  -> dict with current vehicle state
"""

import asyncio
import math
import random
import time
from typing import Callable, Dict, List, Optional

# ── Optional MAVSDK import (graceful fallback) ────────────────────────────────
try:
    from mavsdk import System
    from mavsdk.mission import MissionItem, MissionPlan
    MAVSDK_AVAILABLE = True
except ImportError:
    MAVSDK_AVAILABLE = False
    print("[MAVLink] mavsdk not installed — running in MOCK SIMULATION mode.")


# ═══════════════════════════════════════════════════════════════════════════════
#  Mock Simulation Engine (no ArduPilot required)
# ═══════════════════════════════════════════════════════════════════════════════

class MockSimulationEngine:
    """
    Realistic flight simulation engine.
    Interpolates between waypoints, drains battery, updates heading/altitude.
    Broadcasts telemetry via the callback supplied by MAVLinkBridge.
    """

    TICK_RATE = 0.5           # seconds between telemetry ticks
    STEPS_PER_WAYPOINT = 20   # sim steps to travel between two waypoints

    def __init__(self, on_telemetry: Callable):
        self._on_telemetry = on_telemetry
        self._running = False
        self._task: Optional[asyncio.Task] = None

        # Flight state — IMT Kharkhoda, Haryana, India (28.8308566°N, 76.931122°E)
        self._waypoints: List[Dict] = []
        self._step = 0
        self._flying = False
        self._armed = False
        self._mode = "STABILIZE"

        # Vehicle state
        self._lat = 28.8308566
        self._lng = 76.931122
        self._altitude = 0.0
        self._speed = 0.0
        self._heading = 90.0
        self._battery = 100.0
        self._flight_time = 0
        self._distance = 0.0
        self._satellites = random.randint(12, 20)
        self._gps_type = "3D Fix"
        self._firmware = "ArduCopter V4.5.3"
        self._vehicle_type = "Quadcopter"
        self._hdop = round(random.uniform(0.7, 1.2), 2)

    def arm(self):
        self._armed = True
        self._mode = "GUIDED"

    def disarm(self):
        self._armed = False
        self._mode = "STABILIZE"
        self._speed = 0.0

    def set_mode(self, mode: str):
        self._mode = mode

    def set_waypoints(self, waypoints: List[Dict]):
        self._waypoints = waypoints
        self._step = 0

    def start_mission(self):
        self._flying = True
        self._step = 0
        self._mode = "AUTO"
        self._speed = 10.0

    def pause_mission(self):
        self._flying = False
        self._mode = "LOITER"
        self._speed = 0.0

    def resume_mission(self):
        self._flying = True
        self._mode = "AUTO"
        self._speed = 10.0

    def abort_mission(self):
        self._flying = False
        self._mode = "RTL"
        self._speed = 5.0

    def land(self):
        self._flying = False
        self._mode = "LAND"
        self._speed = 1.0

    def rtl(self):
        self._flying = False
        self._mode = "RTL"
        self._speed = 8.0

    def takeoff(self, altitude: float):
        self._armed = True
        self._mode = "GUIDED"
        self._altitude = altitude
        self._speed = 2.0

    def get_state(self) -> Dict:
        return {
            "lat": round(self._lat, 6),
            "lng": round(self._lng, 6),
            "altitude": round(self._altitude, 1),
            "relative_alt": round(max(0.0, self._altitude - 5), 1),
            "ground_speed": round(self._speed, 1),
            "air_speed": round(self._speed + random.uniform(-0.5, 0.5), 1),
            "vertical_speed": round(random.uniform(-0.2, 0.2), 2),
            "heading": round(self._heading, 1),
            "yaw": round(self._heading, 1),
            "pitch": round(math.sin(time.time()) * 3, 1),
            "roll": round(math.cos(time.time()) * 2, 1),
            "battery_percent": round(self._battery, 1),
            "battery_voltage": round(14.8 * (self._battery / 100), 2),
            "flight_time_seconds": self._flight_time,
            "distance_travelled": round(self._distance, 2),
            "satellites": self._satellites,
            "gps_type": self._gps_type,
            "hdop": self._hdop,
            "firmware": self._firmware,
            "vehicle_type": self._vehicle_type,
            "flight_mode": self._mode,
            "armed": self._armed,
            "connected": True,
        }

    async def _tick(self):
        """Main simulation loop tick."""
        while True:
            await asyncio.sleep(self.TICK_RATE)

            if self._flying and self._waypoints:
                total_steps = len(self._waypoints) * self.STEPS_PER_WAYPOINT
                if self._step >= total_steps:
                    # Mission complete — auto land
                    self._flying = False
                    self._mode = "LAND"
                    self._altitude = max(0.0, self._altitude - 2.0)
                    if self._altitude <= 0:
                        self._armed = False
                        self._mode = "STABILIZE"
                else:
                    wp_idx = self._step // self.STEPS_PER_WAYPOINT
                    next_idx = (wp_idx + 1) % len(self._waypoints)
                    ratio = (self._step % self.STEPS_PER_WAYPOINT) / self.STEPS_PER_WAYPOINT

                    start = self._waypoints[wp_idx]
                    end = self._waypoints[next_idx]

                    self._lat = start["lat"] + (end["lat"] - start["lat"]) * ratio
                    self._lng = start["lng"] + (end["lng"] - start["lng"]) * ratio
                    self._altitude = float(start.get("alt", start.get("altitude", 30)) +
                                          (end.get("alt", end.get("altitude", 30)) -
                                           start.get("alt", start.get("altitude", 30))) * ratio)

                    # Compute heading
                    dlat = end["lat"] - start["lat"]
                    dlng = end["lng"] - start["lng"]
                    self._heading = (math.degrees(math.atan2(dlng, dlat)) + 360) % 360

                    self._speed = float(start.get("speed", 10))
                    self._distance += self._speed * self.TICK_RATE / 1000.0
                    self._step += 1

            elif self._mode == "LAND" and self._altitude > 0:
                self._altitude = max(0.0, self._altitude - 1.5)
                if self._altitude <= 0:
                    self._armed = False
                    self._mode = "STABILIZE"
                    self._speed = 0.0

            elif self._mode == "RTL":
                # Gradually return to home point
                home_lat, home_lng = 34.0522, -118.2437
                self._lat = self._lat + (home_lat - self._lat) * 0.1
                self._lng = self._lng + (home_lng - self._lng) * 0.1
                if abs(self._lat - home_lat) < 0.0001:
                    self._mode = "LAND"

            # Update battery and flight timer
            if self._armed:
                self._battery = max(5.0, self._battery - 0.03)
                self._flight_time += int(self.TICK_RATE)

            # Broadcast to WebSocket subscribers
            try:
                await self._on_telemetry(self.get_state())
            except Exception:
                pass

    async def start(self):
        if not self._task or self._task.done():
            self._task = asyncio.create_task(self._tick())

    async def stop(self):
        if self._task and not self._task.done():
            self._task.cancel()


# ═══════════════════════════════════════════════════════════════════════════════
#  Real MAVSDK Bridge
# ═══════════════════════════════════════════════════════════════════════════════

class RealMAVSDKBridge:
    """
    Wraps MAVSDK System for ArduPilot communication.
    Streams telemetry through the on_telemetry callback.
    """

    def __init__(self, on_telemetry: Callable):
        self._on_telemetry = on_telemetry
        self._drone: Optional["System"] = None
        self._stream_task: Optional[asyncio.Task] = None
        self._telemetry: Dict = {}

    async def connect(self, address: str):
        self._drone = System()
        await self._drone.connect(system_address=address)
        # Wait for connection (5 second timeout)
        async for state in self._drone.core.connection_state():
            if state.is_connected:
                break
        # Start streaming telemetry
        self._stream_task = asyncio.create_task(self._stream_telemetry())

    async def _stream_telemetry(self):
        async def stream_position():
            async for pos in self._drone.telemetry.position():
                self._telemetry.update({
                    "lat": pos.latitude_deg,
                    "lng": pos.longitude_deg,
                    "altitude": pos.absolute_altitude_m,
                    "relative_alt": pos.relative_altitude_m,
                })

        async def stream_velocity():
            async for vel in self._drone.telemetry.velocity_ned():
                speed = math.sqrt(vel.north_m_s**2 + vel.east_m_s**2)
                self._telemetry.update({
                    "ground_speed": round(speed, 2),
                    "vertical_speed": round(-vel.down_m_s, 2),
                })

        async def stream_attitude():
            async for att in self._drone.telemetry.attitude_euler():
                self._telemetry.update({
                    "heading": round(att.yaw_deg % 360, 1),
                    "yaw": round(att.yaw_deg, 1),
                    "pitch": round(att.pitch_deg, 1),
                    "roll": round(att.roll_deg, 1),
                })

        async def stream_battery():
            async for bat in self._drone.telemetry.battery():
                self._telemetry.update({
                    "battery_percent": round(bat.remaining_percent * 100, 1),
                    "battery_voltage": round(bat.voltage_v, 2),
                })

        async def stream_gps():
            async for gps in self._drone.telemetry.gps_info():
                fix_map = {0: "No Fix", 1: "No Fix", 2: "2D Fix", 3: "3D Fix", 4: "DGPS", 5: "RTK Float", 6: "RTK Fixed"}
                self._telemetry.update({
                    "satellites": gps.num_satellites,
                    "gps_type": fix_map.get(gps.fix_type.value, "3D Fix"),
                })

        async def stream_flight_mode():
            async for mode in self._drone.telemetry.flight_mode():
                self._telemetry.update({"flight_mode": str(mode)})

        async def stream_armed():
            async for armed in self._drone.telemetry.armed():
                self._telemetry.update({"armed": armed})

        async def broadcast_loop():
            while True:
                await asyncio.sleep(0.5)
                if self._telemetry:
                    try:
                        await self._on_telemetry({**self._telemetry, "connected": True})
                    except Exception:
                        pass

        # Run all streams concurrently
        await asyncio.gather(
            stream_position(),
            stream_velocity(),
            stream_attitude(),
            stream_battery(),
            stream_gps(),
            stream_flight_mode(),
            stream_armed(),
            broadcast_loop(),
            return_exceptions=True,
        )

    async def arm(self):
        await self._drone.action.arm()

    async def disarm(self):
        await self._drone.action.disarm()

    async def takeoff(self, altitude: float):
        await self._drone.action.set_takeoff_altitude(altitude)
        await self._drone.action.takeoff()

    async def land(self):
        await self._drone.action.land()

    async def rtl(self):
        await self._drone.action.return_to_launch()

    async def set_mode(self, mode: str):
        # ArduPilot mode mapping via MAVSDK hold/offboard
        mode_map = {
            "LOITER": self._drone.action.hold,
            "RTL": self._drone.action.return_to_launch,
            "LAND": self._drone.action.land,
        }
        if mode in mode_map:
            await mode_map[mode]()

    async def upload_mission(self, waypoints: List[Dict]):
        items = []
        for idx, wp in enumerate(waypoints):
            item = MissionItem(
                latitude_deg=wp["lat"],
                longitude_deg=wp["lng"],
                relative_altitude_m=float(wp.get("alt", wp.get("altitude", 30))),
                speed_m_s=float(wp.get("speed", 10)),
                is_fly_through=True,
                gimbal_pitch_deg=float(wp.get("gimbal_pitch", -45)),
                gimbal_yaw_deg=float(wp.get("heading", 90)),
                camera_action=MissionItem.CameraAction.NONE,
                loiter_time_s=float(wp.get("hover_time", 0)),
                camera_photo_interval_s=0,
            )
            items.append(item)

        mission_plan = MissionPlan(items)
        await self._drone.mission.upload_mission(mission_plan)

    async def start_mission(self):
        await self._drone.action.arm()
        await self._drone.mission.start_mission()

    async def pause_mission(self):
        await self._drone.mission.pause_mission()
        await self._drone.action.hold()

    async def resume_mission(self):
        await self._drone.mission.start_mission()

    async def abort_mission(self):
        await self._drone.action.return_to_launch()

    async def disconnect(self):
        if self._stream_task:
            self._stream_task.cancel()


# ═══════════════════════════════════════════════════════════════════════════════
#  MAVLink Bridge — Public Interface
# ═══════════════════════════════════════════════════════════════════════════════

class MAVLinkBridge:
    """
    Singleton-style bridge with automatic fallback:
    1. Try MAVSDK real connection
    2. If MAVSDK not installed or connection fails → Mock simulation
    """

    def __init__(self):
        self._telemetry_callbacks: List[Callable] = []
        self._mock: Optional[MockSimulationEngine] = None
        self._real: Optional[RealMAVSDKBridge] = None
        self._mode = "disconnected"   # connected_real | connected_mock | disconnected
        self._last_telemetry: Dict = {
            "lat": 28.8308566, "lng": 76.931122,
            "altitude": 0.0, "relative_alt": 0.0,
            "ground_speed": 0.0, "air_speed": 0.0, "vertical_speed": 0.0,
            "heading": 90.0, "yaw": 90.0, "pitch": 0.0, "roll": 0.0,
            "battery_percent": 100.0, "battery_voltage": 14.8,
            "flight_time_seconds": 0, "distance_travelled": 0.0,
            "satellites": 18, "gps_type": "3D Fix", "hdop": 0.85,
            "firmware": "ArduCopter V4.5.3", "vehicle_type": "Quadcopter",
            "flight_mode": "STABILIZE", "armed": False, "connected": False,
        }

    def add_telemetry_callback(self, cb: Callable):
        self._telemetry_callbacks.append(cb)

    def remove_telemetry_callback(self, cb: Callable):
        self._telemetry_callbacks.remove(cb)

    async def _broadcast(self, state: Dict):
        self._last_telemetry = {**self._last_telemetry, **state}
        for cb in self._telemetry_callbacks:
            try:
                await cb(self._last_telemetry)
            except Exception:
                pass

    def get_telemetry(self) -> Dict:
        return self._last_telemetry

    # ── Connection ──────────────────────────────────────────────────────────

    async def connect(self, connection_string: str = "udp://:14540") -> Dict:
        """Connect to autopilot. Falls back to mock simulation if unreachable."""

        # Try real MAVSDK first if available
        if MAVSDK_AVAILABLE:
            try:
                real = RealMAVSDKBridge(on_telemetry=self._broadcast)
                await asyncio.wait_for(real.connect(connection_string), timeout=5.0)
                self._real = real
                self._mode = "connected_real"
                self._last_telemetry["connected"] = True
                print(f"[MAVLink] ✅ Connected to ArduPilot via {connection_string}")
                return {"status": "success", "mode": "real", "message": f"ArduPilot connected via {connection_string}"}
            except Exception as e:
                print(f"[MAVLink] ⚠️  Real connection failed: {e}. Falling back to mock simulation.")

        # Fall through to mock simulation
        return await self._start_mock(connection_string)

    async def _start_mock(self, connection_string: str) -> Dict:
        if self._mock:
            await self._mock.stop()
        self._mock = MockSimulationEngine(on_telemetry=self._broadcast)
        await self._mock.start()
        self._mode = "connected_mock"
        self._last_telemetry["connected"] = True
        print(f"[MAVLink] 🟡 Mock simulation started (target: {connection_string})")
        return {
            "status": "success", "mode": "mock",
            "message": f"SITL Mock simulation active (ArduPilot not reachable at {connection_string})"
        }

    async def disconnect(self) -> Dict:
        if self._real:
            await self._real.disconnect()
            self._real = None
        if self._mock:
            await self._mock.stop()
            self._mock = None
        self._mode = "disconnected"
        self._last_telemetry["connected"] = False
        self._last_telemetry["armed"] = False
        self._last_telemetry["flight_mode"] = "STABILIZE"
        return {"status": "success", "message": "Autopilot link closed."}

    # ── Flight Actions ───────────────────────────────────────────────────────

    async def arm(self) -> Dict:
        if self._real:
            await self._real.arm()
        elif self._mock:
            self._mock.arm()
        else:
            return {"status": "error", "message": "Not connected."}
        self._last_telemetry["armed"] = True
        self._last_telemetry["flight_mode"] = "GUIDED"
        return {"status": "success", "message": "Motors ARMED successfully."}

    async def disarm(self) -> Dict:
        if self._real:
            await self._real.disarm()
        elif self._mock:
            self._mock.disarm()
        else:
            return {"status": "error", "message": "Not connected."}
        self._last_telemetry["armed"] = False
        self._last_telemetry["flight_mode"] = "STABILIZE"
        return {"status": "success", "message": "Motors DISARMED."}

    async def takeoff(self, altitude: float) -> Dict:
        if self._real:
            await self._real.takeoff(altitude)
        elif self._mock:
            self._mock.takeoff(altitude)
        else:
            return {"status": "error", "message": "Not connected."}
        self._last_telemetry["flight_mode"] = "GUIDED"
        return {"status": "success", "message": f"Guided takeoff to {altitude}m initiated."}

    async def land(self) -> Dict:
        if self._real:
            await self._real.land()
        elif self._mock:
            self._mock.land()
        else:
            return {"status": "error", "message": "Not connected."}
        self._last_telemetry["flight_mode"] = "LAND"
        return {"status": "success", "message": "Landing sequence started."}

    async def rtl(self) -> Dict:
        if self._real:
            await self._real.rtl()
        elif self._mock:
            self._mock.rtl()
        else:
            return {"status": "error", "message": "Not connected."}
        self._last_telemetry["flight_mode"] = "RTL"
        return {"status": "success", "message": "Return-to-Launch initiated."}

    async def set_mode(self, mode: str) -> Dict:
        if self._real:
            await self._real.set_mode(mode)
        elif self._mock:
            self._mock.set_mode(mode)
        else:
            return {"status": "error", "message": "Not connected."}
        self._last_telemetry["flight_mode"] = mode
        return {"status": "success", "message": f"Flight mode set to {mode}."}

    # ── Mission ──────────────────────────────────────────────────────────────

    async def upload_mission(self, waypoints: List[Dict]) -> Dict:
        if self._real:
            await self._real.upload_mission(waypoints)
        elif self._mock:
            self._mock.set_waypoints(waypoints)
        else:
            return {"status": "error", "message": "Not connected."}
        return {"status": "success", "message": f"{len(waypoints)} waypoints uploaded to autopilot."}

    async def start_mission(self) -> Dict:
        if self._real:
            await self._real.start_mission()
        elif self._mock:
            self._mock.start_mission()
        else:
            return {"status": "error", "message": "Not connected."}
        self._last_telemetry["flight_mode"] = "AUTO"
        self._last_telemetry["armed"] = True
        return {"status": "success", "message": "AUTO mission started."}

    async def pause_mission(self) -> Dict:
        if self._real:
            await self._real.pause_mission()
        elif self._mock:
            self._mock.pause_mission()
        else:
            return {"status": "error", "message": "Not connected."}
        self._last_telemetry["flight_mode"] = "LOITER"
        return {"status": "success", "message": "Mission paused. Holding position in LOITER."}

    async def resume_mission(self) -> Dict:
        if self._real:
            await self._real.resume_mission()
        elif self._mock:
            self._mock.resume_mission()
        else:
            return {"status": "error", "message": "Not connected."}
        self._last_telemetry["flight_mode"] = "AUTO"
        return {"status": "success", "message": "Mission resumed."}

    async def abort_mission(self) -> Dict:
        if self._real:
            await self._real.abort_mission()
        elif self._mock:
            self._mock.abort_mission()
        else:
            return {"status": "error", "message": "Not connected."}
        self._last_telemetry["flight_mode"] = "RTL"
        return {"status": "success", "message": "Mission aborted. Performing safety RTL."}


# ── Singleton Instance ─────────────────────────────────────────────────────────
_bridge_instance: Optional[MAVLinkBridge] = None


def get_bridge() -> MAVLinkBridge:
    global _bridge_instance
    if _bridge_instance is None:
        _bridge_instance = MAVLinkBridge()
    return _bridge_instance
