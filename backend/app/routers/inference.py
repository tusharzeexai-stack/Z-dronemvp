"""
Inference router — simulates real-time AI pedestrian and activity detection metrics.
Provides endpoints for dashboard settings and EventSource (SSE) stats feed.
"""
import json
import asyncio
import random
from fastapi import APIRouter, Request
from fastapi.responses import StreamingResponse

router = APIRouter(tags=["AI Inference Simulation"])

class InferenceState:
    def __init__(self):
        self.paused = False
        self.conf_threshold = 0.4
        self.mode = 3
        self.frame_skip = 1
        self.video_path = "cam1.mp4"
        self.frame_idx = 0
        self.total_frames = 1500
        self.fps = 29.5
        self.backend = "OpenCV DNN (CPU)"

state = InferenceState()

def update_video_path(new_path: str):
    state.video_path = new_path
    state.frame_idx = 0
    if new_path == "cam1.mp4":
        state.total_frames = 1500
    elif new_path == "cam2.mp4":
        state.total_frames = 2253
    elif "test1" in new_path:
        state.total_frames = 1200
    elif "test2" in new_path:
        state.total_frames = 1800
    else:
        state.total_frames = 2000

@router.get("/api/videos")
async def get_videos():
    """Return available video sources for inference simulation."""
    return [
        {"value": "cam1.mp4", "label": "📹 Sector Delta — cam1.mp4 (Recorded/Annotated)"},
        {"value": "cam2.mp4", "label": "📹 Sector Charlie — cam2.mp4 (New Footage)"},
        {"value": "test1.mp4", "label": "📹 Sector Bravo — test1.mp4 (Test Footage)"},
        {"value": "test2.mp4", "label": "📹 Sector Alpha — test2.mp4 (Field Footage)"}
    ]

@router.post("/api/settings")
async def update_settings(request: Request):
    """Update active simulation parameters."""
    data = await request.json()
    if "paused" in data:
        state.paused = bool(data["paused"])
    if "conf_threshold" in data:
        state.conf_threshold = float(data["conf_threshold"])
    if "mode" in data:
        state.mode = int(data["mode"])
    if "frame_skip" in data:
        state.frame_skip = int(data["frame_skip"])
    if "video_path" in data:
        update_video_path(str(data["video_path"]))
    return {"status": "success", "message": "Settings updated"}

@router.post("/api/reset")
async def reset_simulation():
    """Reset the frame counter and play status."""
    state.frame_idx = 0
    state.paused = False
    return {"status": "success", "message": "Simulation reset"}

@router.get("/stats_feed")
async def stats_feed(request: Request):
    """EventSource (SSE) feed transmitting simulated AI analytics at ~3Hz."""
    async def event_generator():
        while True:
            # Check client disconnection to avoid hanging tasks
            if await request.is_disconnected():
                break

            if not state.paused:
                state.frame_idx += state.frame_skip
                if state.frame_idx >= state.total_frames:
                    state.frame_idx = 0

                state.fps = round(29.0 + random.uniform(-0.8, 0.8), 1)

                ped_count = 0
                act_count = 0

                # Simulate detections depending on selected video and current frame range
                if state.video_path == "cam1.mp4":
                    if 200 <= state.frame_idx <= 400:
                        ped_count = 2 if state.frame_idx % 20 < 12 else 1
                        act_count = 2
                    elif 800 <= state.frame_idx <= 1000:
                        ped_count = 1
                        act_count = 1
                elif state.video_path == "cam2.mp4":
                    if 400 <= state.frame_idx <= 600:
                        ped_count = 3 if state.frame_idx % 30 < 15 else 2
                        act_count = 3
                    elif 1200 <= state.frame_idx <= 1400:
                        ped_count = 1
                        act_count = 2
                else:
                    if (state.frame_idx // 150) % 4 == 1:
                        ped_count = 1
                        act_count = 1

                # Apply mode filters
                if state.mode == 2:  # Actions only
                    ped_count = 0
                elif state.mode == 1:  # Pedestrians only
                    act_count = 0
            else:
                ped_count = 0
                act_count = 0

            data = {
                "fps": float(state.fps),
                "ped_count": int(ped_count),
                "act_count": int(act_count),
                "frame_idx": int(state.frame_idx),
                "total_frames": int(state.total_frames),
                "status": "Paused" if state.paused else "Playing",
                "backend": state.backend
            }

            yield f"data: {json.dumps(data)}\n\n"
            await asyncio.sleep(0.33)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET",
            "Access-Control-Allow-Headers": "*",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive"
        }
    )
