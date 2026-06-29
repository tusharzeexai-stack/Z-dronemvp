"""
WebSocket Connection Manager — shared by telemetry and alert websocket endpoints.
"""
import asyncio
import json
from typing import List, Dict, Any
from fastapi import WebSocket


class ConnectionManager:
    def __init__(self, name: str):
        self.name = name
        self.active_connections: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.active_connections.append(ws)
        print(f"[WS:{self.name}] Client connected. Total: {len(self.active_connections)}")

    def disconnect(self, ws: WebSocket):
        if ws in self.active_connections:
            self.active_connections.remove(ws)
        print(f"[WS:{self.name}] Client disconnected. Total: {len(self.active_connections)}")

    async def broadcast(self, data: Dict[str, Any]):
        """Send a JSON message to all connected clients."""
        message = json.dumps(data)
        dead_connections = []
        for ws in self.active_connections:
            try:
                await ws.send_text(message)
            except Exception:
                dead_connections.append(ws)
        for ws in dead_connections:
            self.disconnect(ws)

    async def send_to(self, ws: WebSocket, data: Dict[str, Any]):
        """Send a JSON message to a specific client."""
        try:
            await ws.send_text(json.dumps(data))
        except Exception:
            self.disconnect(ws)


# Singleton managers — imported by routers and websocket handlers
telemetry_manager = ConnectionManager("telemetry")
alert_manager = ConnectionManager("alerts")
detection_manager = ConnectionManager("detections")
