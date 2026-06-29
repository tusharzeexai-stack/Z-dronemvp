"""
Streams router — AWS Kinesis Video Streams WebRTC signaling for live drone cameras.

How it works:
  1. Each drone has a Kinesis Video Stream channel (named zdrone-{id}-cam).
  2. The drone device (Jetson / Raspberry Pi) runs the KVS GStreamer plugin
     and pushes its camera feed to its assigned Kinesis signaling channel.
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
            drone.stream_name = stream_name
            await db.commit()
        else:
            raise HTTPException(status_code=502, detail=f"AWS KVS error: {str(e)}")

    # 2. Get WebRTC signaling endpoint for VIEWER role
    try:
        endpoint_response = kvs.get_signaling_channel_endpoint(
            ChannelARN=channel_arn,
            SingleMasterChannelEndpointConfiguration={
                "Protocols": ["WSS", "HTTPS"],
                "Role": "VIEWER",
            },
        )
    except ClientError as e:
        raise HTTPException(status_code=502, detail=f"KVS endpoint error: {str(e)}")

    endpoints = {
        ep["Protocol"]: ep["ResourceEndpoint"]
        for ep in endpoint_response["ResourceEndpointList"]
    }
    wss_endpoint = endpoints.get("WSS", "")
    https_endpoint = endpoints.get("HTTPS", wss_endpoint.replace("wss://", "https://"))

    # 3. Get TURN/STUN ICE servers.
    #    ⚠️  CRITICAL: get_ice_server_config lives on the 'kinesis-video-signaling-channels'
    #    client, NOT on the base 'kinesisvideo' client.  It must be called with the
    #    channel-specific HTTPS endpoint returned in step 2.
    ice_servers = []
    try:
        signaling_client = boto3.client(
            "kinesis-video-signaling-channels",
            region_name=settings.aws_region,
            aws_access_key_id=settings.aws_access_key_id,
            aws_secret_access_key=settings.aws_secret_access_key,
            endpoint_url=https_endpoint,
        )
        ice_response = signaling_client.get_ice_server_config(
            ChannelARN=channel_arn,
            ClientId="zdrone-dashboard-viewer",
            Service="TURN",
        )
        ice_servers = [
            {
                "urls": s["Uris"],
                "username": s.get("Username", ""),
                "credential": s.get("Password", ""),
            }
            for s in ice_response.get("IceServerList", [])
        ]
    except Exception as e:
        # TURN servers are optional — dashboard will still work with STUN only
        print(f"[streams] Could not fetch TURN ICE servers (non-fatal): {e}")

    # Always prepend a STUN server as fallback (region-matched)
    ice_servers.insert(0, {
        "urls": [f"stun:stun.kinesisvideo.{settings.aws_region}.amazonaws.com:443"]
    })

    return StreamInfo(
        drone_id=drone_id,
        stream_name=stream_name,
        channel_arn=channel_arn,
        endpoint_url=wss_endpoint,
        ice_servers=ice_servers,
        region=settings.aws_region,
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


@router.get("/{drone_id}/viewer-credentials")
async def get_viewer_credentials(drone_id: str, db: AsyncSession = Depends(get_db)):
    """
    Returns AWS credentials for the frontend KVS WebRTC SDK to sign the viewer
    WebSocket connection via AWS Signature V4.

    For a fixed IAM user deployment this returns the long-lived access key directly.
    For production, swap this out for STS AssumeRole with a short TTL and
    scoped kinesisvideo:ConnectAsViewer permission.
    """
    result = await db.execute(select(Drone).where(Drone.id == drone_id))
    drone = result.scalar_one_or_none()
    if not drone:
        raise HTTPException(status_code=404, detail="Drone not found")

    return {
        "accessKeyId": settings.aws_access_key_id,
        "secretAccessKey": settings.aws_secret_access_key,
        "sessionToken": None,   # None for long-lived IAM user keys
        "region": settings.aws_region,
        "channelName": drone.stream_name or f"{settings.kvs_stream_name_prefix}-{drone_id.lower()}-cam",
    }
