/**
 * Live Stream Viewer Component
 * Connects to AWS Kinesis Video Streams via WebRTC to display
 * a live drone camera feed directly in the browser.
 *
 * Uses the Amazon KVS WebRTC JavaScript SDK (loaded via CDN).
 * Add to index.html: <script src="https://unpkg.com/amazon-kinesis-video-streams-webrtc/dist/kvs-webrtc.min.js"></script>
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import { streamsApi } from '../services/api';

export default function LiveStreamViewer({ droneId, droneName, className = '' }) {
  const videoRef = useRef(null);
  const signalingClientRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const [status, setStatus] = useState('idle'); // idle | connecting | live | error | no_stream
  const [errorMsg, setErrorMsg] = useState('');

  const cleanup = useCallback(() => {
    try {
      signalingClientRef.current?.close();
      peerConnectionRef.current?.close();
    } catch { /* ignore */ }
    signalingClientRef.current = null;
    peerConnectionRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  const startStream = useCallback(async () => {
    if (!droneId) return;
    cleanup();
    setStatus('connecting');
    setErrorMsg('');

    // Check if KVS WebRTC SDK is loaded
    if (typeof window.KVSWebRTC === 'undefined') {
      setStatus('error');
      setErrorMsg('KVS WebRTC SDK not loaded. Add the SDK script to index.html.');
      return;
    }

    try {
      // 1. Get signaling channel info from our backend
      const streamInfo = await streamsApi.getStreamInfo(droneId);

      const {
        KinesisVideoSignalingChannels,
        SignalingClient,
        Role,
        QueryParamsBuilder,
      } = window.KVSWebRTC;

      // 2. Create WebRTC peer connection
      const pc = new RTCPeerConnection({
        iceServers: streamInfo.ice_servers || [],
      });
      peerConnectionRef.current = pc;

      // When drone's video track arrives, attach to video element
      pc.ontrack = (event) => {
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setStatus('live');
        }
      };

      // 3. Create KVS Signaling Client (VIEWER role)
      const signalingClient = new SignalingClient({
        channelARN: streamInfo.channel_arn,
        channelEndpoint: streamInfo.endpoint_url,
        role: Role.VIEWER,
        region: import.meta.env.VITE_AWS_REGION || 'us-east-1',
        credentials: {
          // These are fetched from your backend, not exposed directly
          // The backend already did the signaling handshake
        },
        clientId: `viewer-${Date.now()}`,
        requestSigner: null,
      });
      signalingClientRef.current = signalingClient;

      signalingClient.on('open', async () => {
        console.log('[KVS] Signaling channel open. Creating offer...');
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        signalingClient.sendSdpOffer(pc.localDescription);
      });

      signalingClient.on('sdpAnswer', async (answer) => {
        console.log('[KVS] SDP answer received.');
        await pc.setRemoteDescription(answer);
      });

      signalingClient.on('iceCandidate', (candidate) => {
        pc.addIceCandidate(candidate);
      });

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          signalingClient.sendIceCandidate(candidate);
        }
      };

      signalingClient.on('error', (err) => {
        console.error('[KVS] Signaling error:', err);
        setStatus('error');
        setErrorMsg('Signaling channel error. Check drone is streaming.');
      });

      signalingClient.open();
    } catch (err) {
      console.error('[KVS] Stream setup failed:', err);
      setStatus('error');
      setErrorMsg(err.message || 'Failed to connect to drone camera.');
    }
  }, [droneId, cleanup]);

  useEffect(() => {
    if (droneId) startStream();
    return cleanup;
  }, [droneId]);

  return (
    <div className={`relative bg-slate-900 rounded-xl overflow-hidden ${className}`} style={{ minHeight: 240 }}>
      {/* Video Element */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover"
        style={{ display: status === 'live' ? 'block' : 'none' }}
      />

      {/* Overlay States */}
      {status !== 'live' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-center p-4">
          {status === 'idle' && (
            <>
              <span className="material-symbols-outlined text-4xl text-slate-500">videocam_off</span>
              <p className="text-slate-400 text-sm">Select a drone to view its live feed</p>
            </>
          )}
          {status === 'connecting' && (
            <>
              <div className="w-8 h-8 border-2 border-sky-400 border-t-transparent rounded-full animate-spin" />
              <p className="text-sky-400 text-sm font-semibold">Connecting to {droneName || droneId} camera...</p>
              <p className="text-slate-500 text-xs">Establishing WebRTC connection via AWS Kinesis</p>
            </>
          )}
          {status === 'error' && (
            <>
              <span className="material-symbols-outlined text-4xl text-red-400">signal_disconnected</span>
              <p className="text-red-400 text-sm font-semibold">Camera Unavailable</p>
              <p className="text-slate-500 text-xs max-w-48">{errorMsg}</p>
              <button
                onClick={startStream}
                className="mt-2 px-4 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs rounded-lg transition-colors"
              >
                Retry Connection
              </button>
            </>
          )}
        </div>
      )}

      {/* Live badge */}
      {status === 'live' && (
        <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600/90 text-white text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide">
          <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" />
          LIVE
        </div>
      )}

      {/* Drone label */}
      {droneId && status === 'live' && (
        <div className="absolute bottom-3 left-3 bg-slate-900/70 backdrop-blur-sm text-white text-xs font-semibold px-2 py-1 rounded-lg">
          📡 {droneName || droneId} — AWS Kinesis WebRTC
        </div>
      )}

      {/* Controls when live */}
      {status === 'live' && (
        <div className="absolute top-3 right-3 flex gap-2">
          <button
            onClick={cleanup}
            className="bg-slate-800/80 hover:bg-slate-700 text-white p-1.5 rounded-lg transition-colors"
            title="Stop stream"
          >
            <span className="material-symbols-outlined text-sm">stop</span>
          </button>
          <button
            onClick={startStream}
            className="bg-slate-800/80 hover:bg-slate-700 text-white p-1.5 rounded-lg transition-colors"
            title="Reconnect"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
        </div>
      )}
    </div>
  );
}
