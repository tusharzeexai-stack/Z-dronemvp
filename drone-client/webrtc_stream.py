#!/usr/bin/env python3
"""
Z-DRONE WebRTC Master Client & Telemetry Pusher
================================================
This script runs on the drone hardware (or local computer) to:
1. Connect to AWS Kinesis Video Streams WebRTC Signaling Channel as MASTER.
2. Sign WebSocket connection using AWS SigV4.
3. Fetch dynamic STUN/TURN ICE configurations from AWS KVS.
4. Stream live webcam video (or synthetic test frame if no camera is present) to the browser.
5. Push telemetry updates (GPS, speed, battery) to the dashboard database in real time.

Usage:
  python webrtc_stream.py --drone-id ZD-109 --region ap-south-1 --backend-url http://localhost:8000
"""
import os
import sys
import json
import time
import argparse
import asyncio
import base64
import random
import requests
import cv2
import numpy as np
import boto3
import websockets
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
from botocore.exceptions import ClientError
from aiortc import (
    RTCIceServer,
    RTCConfiguration,
    RTCPeerConnection,
    RTCSessionDescription,
    MediaStreamTrack,
)
from av import VideoFrame

# Try to load local .env file manually if it exists
if os.path.exists(".env"):
    with open(".env") as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, val = line.split("=", 1)
                os.environ[key.strip()] = val.strip()

# Determine default backend URL from API_LOGIN_URL if present
default_backend = "http://localhost:8000"
if "API_LOGIN_URL" in os.environ:
    from urllib.parse import urlparse
    parsed = urlparse(os.environ["API_LOGIN_URL"])
    default_backend = f"{parsed.scheme}://{parsed.netloc}"

# ── Command Line Arguments ──────────────────────────────────
parser = argparse.ArgumentParser(description="Z-DRONE WebRTC Master Client")
parser.add_argument("--drone-id", default=os.environ.get("DEVICE_ID", "ZD-109"), help="Registered Drone ID, e.g. ZD-109")
parser.add_argument("--backend-url", default=default_backend, help="FastAPI backend URL")
parser.add_argument("--region", default=os.environ.get("AWS_REGION", "ap-south-1"), help="AWS region")
parser.add_argument("--camera", default="0", help="Camera index or path (set to empty/mock to force synthetic test pattern)")
args = parser.parse_args()

DRONE_ID = args.drone_id
REGION = args.region
BACKEND = args.backend_url
# Use KVS Channel directly from env if set, otherwise build it from drone ID
STREAM_NAME = os.environ.get("AWS_KVS_CHANNEL", f"zdrone-{DRONE_ID.lower()}-cam")

# Retrieve AWS Credentials from Environment
AWS_ACCESS_KEY_ID = os.environ.get("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.environ.get("AWS_SECRET_ACCESS_KEY")

if not AWS_ACCESS_KEY_ID or not AWS_SECRET_ACCESS_KEY:
    print("❌ ERROR: AWS Credentials are not set in the environment.")
    print("Please export them on your command line before running this script:")
    print("  export AWS_ACCESS_KEY_ID='your-access-key-id'")
    print("  export AWS_SECRET_ACCESS_KEY='your-secret-access-key'")
    print("  export AWS_REGION='ap-south-1'")
    sys.exit(1)

# Initialize AWS clients
kvs = boto3.client(
    "kinesisvideo",
    region_name=REGION,
    aws_access_key_id=AWS_ACCESS_KEY_ID,
    aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
)

# ── OpenCV / Synthetic Video Track ───────────────────────────
class DroneCameraTrack(MediaStreamTrack):
    kind = "video"

    def __init__(self, camera_source):
        super().__init__()
        self.cap = None
        self.use_mock = True
        
        # Try to initialize real camera if requested
        if camera_source and camera_source.strip().lower() not in ["mock", "none", ""]:
            try:
                # Convert string index to integer if needed
                source = int(camera_source) if camera_source.isdigit() else camera_source
                self.cap = cv2.VideoCapture(source)
                if self.cap.isOpened():
                    self.use_mock = False
                    print(f"🎬 Successfully opened camera source: {camera_source}")
                else:
                    print(f"⚠️ Warning: Could not open camera source '{camera_source}', falling back to synthetic feed.")
            except Exception as e:
                print(f"⚠️ Warning: Camera init failed: {e}. Falling back to synthetic feed.")

    async def recv(self):
        pts, time_base = await self.next_timestamp()
        
        # 1. Capture real frame
        frame_read = False
        if not self.use_mock and self.cap:
            ret, cv_frame = self.cap.read()
            if ret:
                frame_read = True
                # Scale down for smooth WebRTC transmission
                cv_frame = cv2.resize(cv_frame, (640, 480))
                # Add status text
                cv2.putText(cv_frame, f"ZD-DRONE: {DRONE_ID} | LIVE", (15, 30), 
                            cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            else:
                print("⚠️ Failed to read frame from camera, reverting to mock pattern.")
                self.use_mock = True
        
        # 2. Capture synthetic frame if camera fails or is disabled
        if not frame_read:
            cv_frame = self.generate_synthetic_frame()
            
        # Convert BGR (OpenCV) to RGB for PyAV
        rgb_frame = cv2.cvtColor(cv_frame, cv2.COLOR_BGR2RGB)
        av_frame = VideoFrame.from_ndarray(rgb_frame, format="rgb24")
        av_frame.pts = pts
        av_frame.time_base = time_base
        
        # Limit rate to ~25 FPS
        await asyncio.sleep(0.04)
        return av_frame

    def generate_synthetic_frame(self):
        width, height = 640, 480
        img = np.zeros((height, width, 3), dtype=np.uint8)
        
        # Drawing a futuristic grid pattern
        for y in range(0, height, 40):
            cv2.line(img, (0, y), (width, y), (20, 30, 40), 1)
        for x in range(0, width, 40):
            cv2.line(img, (x, 0), (x, height), (20, 30, 40), 1)
            
        # Draw sweeping radar circle
        t = time.time()
        cx = int(width / 2 + 120 * np.cos(t * 1.5))
        cy = int(height / 2 + 80 * np.sin(t * 1.5))
        cv2.circle(img, (cx, cy), 20, (0, 190, 255), -1)
        cv2.circle(img, (cx, cy), 30, (0, 190, 255), 2)
        
        # Draw telemetry HUD overlay
        cv2.putText(img, "Z-DRONE COMMAND LINK", (25, 45), cv2.FONT_HERSHEY_SIMPLEX, 0.7, (0, 255, 0), 2)
        cv2.putText(img, f"DRONE ID: {DRONE_ID}", (25, 85), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 255), 1)
        cv2.putText(img, f"STREAM CHANNEL: {STREAM_NAME}", (25, 115), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1)
        cv2.putText(img, f"AWS REGION: {REGION}", (25, 145), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (180, 180, 180), 1)
        cv2.putText(img, f"FPS: 25.0 // WEBRTC MASTER", (25, 175), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 255, 255), 1)
        
        # Draw dynamic status clock
        cv2.putText(img, f"TIMESTAMP: {time.strftime('%Y-%m-%d %H:%M:%S')}", (25, 440), 
                    cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 0), 1)
        
        return img

    def __del__(self):
        if self.cap:
            self.cap.release()


# ── AWS SigV4 Signer ─────────────────────────────────────────
def get_signed_websocket_url(wss_endpoint, channel_arn):
    """Signs the WebSocket endpoint URL using AWS SigV4 credentials."""
    # Create request target containing channel ARN & master role query parameters
    url = f"{wss_endpoint}?X-Amz-ChannelARN={channel_arn}"
    request = AWSRequest(method="GET", url=url)
    
    # Run botocore SigV4 signing helper
    session = boto3.Session(
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    )
    creds = session.get_credentials().get_frozen_credentials()
    sigv4 = SigV4Auth(creds, "kinesisvideo", REGION)
    sigv4.add_auth(request)
    
    # Prepare and return the complete signed WSS URL
    return request.prepare().url


# ── Telemetry Transmission Loop ─────────────────────────────
async def telemetry_pusher_loop():
    """Periodically updates the drone telemetry in the database."""
    print("📡 Telemetry pusher started.")
    
    # Coordinates centered around Los Angeles / DTLA default region
    lat = 34.0522
    lng = -118.2437
    
    while True:
        try:
            # Simulate slight drone motion
            lat += (random.random() - 0.5) * 0.0005
            lng += (random.random() - 0.5) * 0.0005
            
            telemetry_data = {
                "lat": lat,
                "lng": lng,
                "altitude": round(random.uniform(20.0, 90.0), 1),
                "speed": round(random.uniform(5.0, 18.0), 1),
                "battery": max(0, round(random.uniform(60, 99))),
                "signal": random.choice(["Excellent", "Good", "Fair"]),
                "status": "Online"
            }
            
            # Send PUT request to FastAPI EC2 backend
            resp = requests.put(
                f"{BACKEND}/drones/{DRONE_ID}/telemetry",
                json=telemetry_data,
                timeout=5
            )
            if resp.status_code == 200:
                print(f"[TELEMETRY] Sent successfully: lat={lat:.5f}, lng={lng:.5f}, battery={telemetry_data['battery']}%")
            else:
                print(f"[TELEMETRY] Server returned error {resp.status_code}: {resp.text}")
                
        except Exception as e:
            print(f"[TELEMETRY] Failed to transmit coordinate payload: {e}")
            
        await asyncio.sleep(4.0)


# ── WebRTC Peer Connection signaling ───────────────────────
async def handle_signaling():
    """Main loop to connect to KVS signaling and handle incoming WebRTC connections."""
    print("🎬 Describing signaling channel on AWS KVS...")
    try:
        channel_desc = kvs.describe_signaling_channel(ChannelName=STREAM_NAME)
        channel_arn = channel_desc['ChannelInfo']['ChannelARN']
        print(f"✅ Found signaling channel ARN: {channel_arn}")
    except kvs.exceptions.ResourceNotFoundException:
        print(f"📡 Signaling channel '{STREAM_NAME}' does not exist on AWS. Creating it now...")
        channel_desc = kvs.create_signaling_channel(
            ChannelName=STREAM_NAME,
            ChannelType="SINGLE_MASTER",
            SingleMasterConfiguration={"MessageTtlSeconds": 60},
        )
        channel_arn = channel_desc['ChannelARN']
        print(f"✅ Created channel successfully.")
    except Exception as e:
        print(f"❌ Failed to get signaling channel: {e}")
        sys.exit(1)

    # Get resource endpoints
    print("📡 Fetching KVS connection endpoints...")
    endpoint_desc = kvs.get_signaling_channel_endpoint(
        ChannelARN=channel_arn,
        SingleMasterChannelEndpointConfiguration={
            'Protocols': ['WSS', 'HTTPS'],
            'Role': 'MASTER'
        }
    )
    endpoints = endpoint_desc['ResourceEndpointList']
    wss_endpoint = next(e['ResourceEndpoint'] for e in endpoints if e['Protocol'] == 'WSS')
    https_endpoint = next(e['ResourceEndpoint'] for e in endpoints if e['Protocol'] == 'HTTPS')
    print(f"✅ WSS Signaling Endpoint: {wss_endpoint}")
    print(f"✅ HTTPS Data Endpoint: {https_endpoint}")

    # Fetch STUN/TURN configurations from KVS
    print("🔒 Querying AWS TURN/STUN servers...")
    kv_signaling = boto3.client(
        "kinesis-video-signaling",
        region_name=REGION,
        endpoint_url=https_endpoint,
        aws_access_key_id=AWS_ACCESS_KEY_ID,
        aws_secret_access_key=AWS_SECRET_ACCESS_KEY,
    )
    ice_config = kv_signaling.get_ice_server_config(
        ChannelARN=channel_arn,
        ClientId="master-hardware-client",
        Service="TURN"
    )
    
    # Format ICE server list for aiortc
    ice_servers = []
    for s in ice_config.get('IceServerList', []):
        ice_servers.append(
            RTCIceServer(
                urls=s['Uris'],
                username=s.get('Username'),
                credential=s.get('Password')
            )
        )
    print(f"✅ Received {len(ice_servers)} ICE configurations from AWS.")

    # Sign WebSocket URL
    signed_wss_url = get_signed_websocket_url(wss_endpoint, channel_arn)

    # Dictionary to keep track of active WebRTC peer connections
    peer_connections = {}

    print(f"🔌 Connecting to KVS WebSocket signaling...")
    async for websocket in websockets.connect(signed_wss_url):
        print("⚡ WebSocket Connection Established. Listening for browser connection requests...")
        try:
            async for raw_msg in websocket:
                msg = json.loads(raw_msg)
                action = msg.get("action")
                sender_id = msg.get("senderClientId")
                
                if not sender_id:
                    continue

                # ── HANDLE SDP OFFER ──
                if action == "SDP_OFFER":
                    print(f"📩 Received SDP Offer from browser viewer [{sender_id}]")
                    
                    # Create new RTCPeerConnection for this viewer
                    config = RTCConfiguration(iceServers=ice_servers)
                    pc = RTCPeerConnection(configuration=config)
                    peer_connections[sender_id] = pc

                    @pc.on("iceconnectionstatechange")
                    async def on_iceconnectionstatechange():
                        print(f"❄️ ICE Connection state for [{sender_id}]: {pc.iceConnectionState}")
                        if pc.iceConnectionState in ["failed", "closed"]:
                            peer_connections.pop(sender_id, None)
                            await pc.close()
                            print(f"❌ Closed stream connection with [{sender_id}]")

                    # Add video track
                    video_track = DroneCameraTrack(args.camera)
                    pc.addTrack(video_track)

                    # Parse & Set Remote Description
                    payload = json.loads(base64.b64decode(msg["messagePayload"]).decode("utf-8"))
                    offer = RTCSessionDescription(sdp=payload["sdp"], type=payload["type"])
                    await pc.setRemoteDescription(offer)
                    print(f"✅ Remote description set for [{sender_id}]")

                    # Create Answer
                    answer = await pc.createAnswer()
                    await pc.setLocalDescription(answer)
                    print(f"📤 Created local Answer SDP, transmitting to AWS KVS...")

                    # Send SDP Answer back via Signaling WebSocket
                    answer_payload = base64.b64encode(
                        json.dumps({
                            "type": "answer",
                            "sdp": pc.localDescription.sdp
                        }).encode("utf-8")
                    ).decode("utf-8")

                    await websocket.send(
                        json.dumps({
                            "action": "SDP_ANSWER",
                            "recipientClientId": sender_id,
                            "messagePayload": answer_payload
                        })
                    )
                    print(f"🎉 Answer transmitted successfully to [{sender_id}].")

                # ── HANDLE ICE CANDIDATES ──
                elif action == "ICE_CANDIDATE":
                    pc = peer_connections.get(sender_id)
                    if pc:
                        payload = json.loads(base64.b64decode(msg["messagePayload"]).decode("utf-8"))
                        candidate_data = payload.get("candidate")
                        
                        # Add received candidate to peer connection
                        if candidate_data:
                            # Parse candidate string format
                            from aiortc.sdp import candidate_from_sdp
                            try:
                                candidate = candidate_from_sdp(candidate_data)
                                candidate.sdpMid = payload.get("sdpMid")
                                candidate.sdpMLineIndex = payload.get("sdpMLineIndex")
                                await pc.addIceCandidate(candidate)
                            except Exception as ex:
                                pass

        except websockets.exceptions.ConnectionClosed:
            print("⚠️ WebSocket connection dropped, reconnecting...")
            continue
        except Exception as e:
            print(f"❌ Signaling loop error: {e}")
            await asyncio.sleep(2)


# ── Main Runner ──────────────────────────────────────────────
async def main():
    print(f"🛸 STARTING Z-DRONE STREAMING HARDWARE CLIENT (ID: {DRONE_ID})")
    print(f"   Targeting Region: {REGION}")
    print(f"   EC2 API Server: {BACKEND}")
    
    # Run WebRTC connection loop and telemetry pusher concurrently
    await asyncio.gather(
        handle_signaling(),
        telemetry_pusher_loop()
    )

if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n👋 Drone client stopped.")
