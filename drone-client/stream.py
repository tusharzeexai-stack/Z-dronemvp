#!/usr/bin/env python3
"""
Z-DRONE Drone Client - AWS Kinesis Video Streams Pusher
=======================================================
Run this script ON YOUR DRONE DEVICE (Raspberry Pi / embedded computer).

This script captures the drone's camera feed using GStreamer and pushes it
to AWS Kinesis Video Streams so the dashboard can display it live via WebRTC.

Requirements (run on drone device):
  sudo apt-get install -y gstreamer1.0-plugins-base gstreamer1.0-plugins-good
                          gstreamer1.0-plugins-bad gstreamer1.0-tools python3-pip
  pip3 install boto3 awscli

Usage:
  python3 stream.py --drone-id ZD-109 --region us-east-1

Environment Variables (set on drone device):
  AWS_ACCESS_KEY_ID=...
  AWS_SECRET_ACCESS_KEY=...
  AWS_REGION=us-east-1
"""
import os
import sys
import json
import time
import argparse
import subprocess
import threading
import boto3
import requests

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

# ── Arguments ───────────────────────────────────────────────
parser = argparse.ArgumentParser(description="Z-DRONE Kinesis Video Streams Pusher")
parser.add_argument("--drone-id", default=os.environ.get("DEVICE_ID", "ZD-109"), help="Drone ID e.g. ZD-109")
parser.add_argument("--backend-url", default=default_backend, help="Z-DRONE Backend URL")
parser.add_argument("--region", default=os.environ.get("AWS_REGION", "us-east-1"))
parser.add_argument("--camera", default="/dev/video0", help="Camera device path")
parser.add_argument("--width", default="1280", help="Camera width")
parser.add_argument("--height", default="720", help="Camera height")
parser.add_argument("--fps", default="25", help="Frames per second")
args = parser.parse_args()

DRONE_ID = args.drone_id
# Use KVS Channel directly from env if set, otherwise build it from drone ID
STREAM_NAME = os.environ.get("AWS_KVS_CHANNEL", f"zdrone-{DRONE_ID.lower()}-cam")
REGION = args.region
BACKEND = args.backend_url

# ── AWS Kinesis Client ──────────────────────────────────────
kvs = boto3.client(
    "kinesisvideo",
    region_name=REGION,
    aws_access_key_id=os.environ["AWS_ACCESS_KEY_ID"],
    aws_secret_access_key=os.environ["AWS_SECRET_ACCESS_KEY"],
)


def ensure_stream_exists():
    """Create or verify the Kinesis Video Stream channel exists."""
    try:
        kvs.describe_signaling_channel(ChannelName=STREAM_NAME)
        print(f"✅ Kinesis channel '{STREAM_NAME}' exists.")
    except kvs.exceptions.ResourceNotFoundException:
        print(f"📡 Creating Kinesis channel '{STREAM_NAME}'...")
        kvs.create_signaling_channel(
            ChannelName=STREAM_NAME,
            ChannelType="SINGLE_MASTER",
            SingleMasterConfiguration={"MessageTtlSeconds": 60},
        )
        print(f"✅ Channel created.")


def get_data_endpoint():
    """Get the Kinesis Video Streams data ingestion endpoint."""
    resp = kvs.get_data_endpoint(
        StreamName=STREAM_NAME,
        APIName="PUT_MEDIA",
    )
    return resp["DataEndpoint"]


def start_gstreamer_pipeline():
    """
    Starts GStreamer pipeline to capture camera and push to Kinesis Video Streams.
    Uses the kvssink GStreamer plugin (must be installed separately).
    
    Installation: https://github.com/awslabs/amazon-kinesis-video-streams-producer-sdk-cpp
    Quick install on Raspberry Pi:
      git clone https://github.com/awslabs/amazon-kinesis-video-streams-producer-sdk-cpp
      cd amazon-kinesis-video-streams-producer-sdk-cpp && mkdir build && cd build
      cmake .. -DBUILD_GSTREAMER_PLUGIN=TRUE
      make -j4
    """
    pipeline_cmd = [
        "gst-launch-1.0", "-v",
        # Camera source
        "v4l2src", f"device={args.camera}",
        "!", f"video/x-raw,width={args.width},height={args.height},framerate={args.fps}/1",
        # H264 encoding
        "!", "videoconvert",
        "!", "x264enc", "bframes=0", "key-int-max=45", "bitrate=500",
        "!", "video/x-h264,stream-format=avc,alignment=au",
        # Push to KVS
        "!", "kvssink",
        f"stream-name={STREAM_NAME}",
        f"storage-size=512",
        f"aws-region={REGION}",
        f"access-key={os.environ['AWS_ACCESS_KEY_ID']}",
        f"secret-key={os.environ['AWS_SECRET_ACCESS_KEY']}",
    ]

    print(f"🎥 Starting GStreamer pipeline for drone {DRONE_ID}...")
    print(f"   Camera: {args.camera} | {args.width}x{args.height}@{args.fps}fps")
    print(f"   Streaming to Kinesis: {STREAM_NAME}")
    print("   Press Ctrl+C to stop.\n")

    proc = subprocess.Popen(pipeline_cmd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        for line in proc.stdout:
            print(f"[GST] {line.decode().strip()}")
    except KeyboardInterrupt:
        proc.terminate()
        print("\n🛑 Streaming stopped.")
    return proc


def send_telemetry_loop():
    """
    Optional: Send simulated/real GPS telemetry to the backend every 5 seconds.
    In a real drone, replace these values with actual GPS/sensor readings.
    """
    import random
    lat, lng = 34.0522, -118.2437

    while True:
        try:
            lat += (random.random() - 0.5) * 0.001
            lng += (random.random() - 0.5) * 0.001
            payload = {
                "lat": lat,
                "lng": lng,
                "altitude": round(random.uniform(30, 80), 1),
                "speed": round(random.uniform(5, 20), 1),
                "battery": max(0, round(random.uniform(40, 95), 1)),
                "signal": random.choice(["Excellent", "Good", "Fair"]),
                "status": "Online",
            }
            resp = requests.put(
                f"{BACKEND}/drones/{DRONE_ID}/telemetry",
                json=payload,
                timeout=5,
            )
            if resp.status_code == 200:
                print(f"📡 Telemetry sent: lat={lat:.4f}, lng={lng:.4f}, battery={payload['battery']}%")
            else:
                print(f"⚠️ Telemetry error {resp.status_code}: {resp.text}")
        except Exception as e:
            print(f"⚠️ Telemetry send failed: {e}")
        time.sleep(5)


# ── Main ────────────────────────────────────────────────────
if __name__ == "__main__":
    print(f"🚁 Z-DRONE Client Starting — Drone: {DRONE_ID}")
    print(f"   Stream: {STREAM_NAME}")
    print(f"   Region: {REGION}")
    print(f"   Backend: {BACKEND}\n")

    ensure_stream_exists()

    # Start telemetry thread
    t = threading.Thread(target=send_telemetry_loop, daemon=True)
    t.start()

    # Start video streaming (blocks until Ctrl+C)
    start_gstreamer_pipeline()
