"""
Streams router — AWS Kinesis Video Streams WebRTC signaling for live drone cameras.

How it works:
  1. Each drone has a Kinesis Video Stream channel (named zdrone-{id}-cam).
  2. The drone device (Raspberry Pi / onboard computer) runs the KVS GStreamer plugin
     and pushes the RTSP camera feed to its assigned Kinesis channel.
  3. The dashboard frontend calls GET /streams/{drone_id} to get ICE servers + channel ARN.
  4. The frontend uses the Amazon KVS WebRTC JS SDK to connect as a VIEWER
     to the signaling channel and display the live feed in a <video> element.
"""
import boto3
from botocore.exceptions import ClientError
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.database import get_db
from app.models import Drone
from app.config import get_settings
from app.schemas import StreamInfo

router = APIRouter(prefix="/streams", tags=["Live Streams"])
settings = get_settings()


def get_kvs_client():
    return boto3.client(
        "kinesisvideo",
        region_name=settings.aws_region,
        aws_access_key_id=settings.aws_access_key_id,
        aws_secret_access_key=settings.aws_secret_access_key,
    )


@router.get("/{drone_id}", response_model=StreamInfo)
async def get_stream_info(drone_id: str, db: AsyncSession = Depends(get_db)):
    """
    Returns WebRTC signaling endpoint and ICE servers for the drone's live camera.
    The frontend uses this to connect as a WebRTC VIEWER.
    """
    result = await db.execute(select(Drone).where(Drone.id == drone_id))
    drone = result.scalar_one_or_none()
    if not drone:
        raise HTTPException(status_code=404, detail="Drone not found")

    stream_name = drone.stream_name or f"{settings.kvs_stream_name_prefix}-{drone_id.lower()}-cam"
    kvs = get_kvs_client()

    # 1. Ensure the Kinesis signaling channel exists
    try:
        ch_response = kvs.describe_signaling_channel(ChannelName=stream_name)
        channel_arn = ch_response["ChannelInfo"]["ChannelARN"]
    except ClientError as e:
        if e.response["Error"]["Code"] == "ResourceNotFoundException":
            # Auto-create the channel for this drone
            created = kvs.create_signaling_channel(
                ChannelName=stream_name,
                ChannelType="SINGLE_MASTER",
                SingleMasterConfiguration={"MessageTtlSeconds": 60},
            )
            channel_arn = created["ChannelARN"]
            # Update drone record
            drone.stream_name = stream_name
            await db.commit()
        else:
            raise HTTPException(status_code=502, detail=f"AWS KVS error: {str(e)}")

    # 2. Get WebRTC signaling endpoint for VIEWER role
    endpoint_response = kvs.get_signaling_channel_endpoint(
        ChannelARN=channel_arn,
        SingleMasterChannelEndpointConfiguration={
            "Protocols": ["WSS", "HTTPS"],
            "Role": "VIEWER",
        },
    )
    endpoints = {
        ep["Protocol"]: ep["ResourceEndpoint"]
        for ep in endpoint_response["ResourceEndpointList"]
    }
    wss_endpoint = endpoints.get("WSS", "")

    # 3. Get TURN/STUN ICE servers
    ice_response = kvs.get_ice_server_config(
        ChannelARN=channel_arn,
        ClientId="zdrone-dashboard-viewer",
        Service="TURN",
    )
    ice_servers = [
        {"urls": s["Uris"], "username": s.get("Username", ""), "credential": s.get("Password", "")}
        for s in ice_response.get("IceServerList", [])
    ]
    # Always include Google STUN as fallback
    ice_servers.insert(0, {"urls": ["stun:stun.kinesisvideo.us-east-1.amazonaws.com:443"]})

    return StreamInfo(
        drone_id=drone_id,
        stream_name=stream_name,
        channel_arn=channel_arn,
        endpoint_url=wss_endpoint,
        ice_servers=ice_servers,
        status="active",
    )


@router.post("/{drone_id}/create")
async def create_stream_channel(drone_id: str, db: AsyncSession = Depends(get_db)):
    """Manually provision a Kinesis signaling channel for a drone."""
    result = await db.execute(select(Drone).where(Drone.id == drone_id))
    drone = result.scalar_one_or_none()
    if not drone:
        raise HTTPException(status_code=404, detail="Drone not found")

    stream_name = f"{settings.kvs_stream_name_prefix}-{drone_id.lower()}-cam"
    kvs = get_kvs_client()

    try:
        created = kvs.create_signaling_channel(
            ChannelName=stream_name,
            ChannelType="SINGLE_MASTER",
            SingleMasterConfiguration={"MessageTtlSeconds": 60},
        )
        drone.stream_name = stream_name
        await db.commit()
        return {"stream_name": stream_name, "channel_arn": created["ChannelARN"], "status": "created"}
    except ClientError as e:
        if "ResourceAlreadyExists" in str(e):
            return {"stream_name": stream_name, "status": "already_exists"}
        raise HTTPException(status_code=502, detail=str(e))
