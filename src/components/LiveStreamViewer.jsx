/**
 * Live Stream Viewer — AWS Kinesis Video Streams WebRTC (VIEWER role)
 *
 * Connects to the KVS signaling channel for a given drone and displays
 * the live H.264 stream in a <video> element.
 *
 * Requires the Amazon KVS WebRTC JS SDK loaded via CDN in index.html:
 *   <script src="https://unpkg.com/amazon-kinesis-video-streams-webrtc/dist/kvs-webrtc.min.js"></script>
 *
 * Props:
 *   droneId      — drone DB id (e.g. "drone01")
 *   droneName    — display label
 *   getApiUrl    — function(path) → full URL (from Dashboard context)
 *   className    — extra Tailwind classes
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';

const AUTO_RECONNECT_DELAY_MS = 5_000;

export default function LiveStreamViewer({ droneId, droneName, getApiUrl, className = '' }) {
  const videoRef = useRef(null);
  const signalingClientRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const mountedRef = useRef(true);

  // status: 'idle' | 'connecting' | 'live' | 'error' | 'reconnecting'
  const [status, setStatus] = useState('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [reconnectCountdown, setReconnectCountdown] = useState(0);

  const cleanup = useCallback(() => {
    try { signalingClientRef.current?.close(); } catch { /* ignore */ }
    try { peerConnectionRef.current?.close(); } catch { /* ignore */ }
    signalingClientRef.current = null;
    peerConnectionRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  const scheduleReconnect = useCallback(() => {
    if (!mountedRef.current) return;
    setStatus('reconnecting');
    let remaining = Math.ceil(AUTO_RECONNECT_DELAY_MS / 1000);
    setReconnectCountdown(remaining);
    const tick = setInterval(() => {
      remaining -= 1;
      setReconnectCountdown(remaining);
      if (remaining <= 0) clearInterval(tick);
    }, 1000);
    reconnectTimerRef.current = setTimeout(() => {
      clearInterval(tick);
      if (mountedRef.current) startStream();
    }, AUTO_RECONNECT_DELAY_MS);
  }, []); // startStream added via closure below

  const startStream = useCallback(async () => {
    if (!droneId || !mountedRef.current) return;
    cleanup();
    clearTimeout(reconnectTimerRef.current);
    setStatus('connecting');
    setErrorMsg('');

    // ── 1. Check SDK is loaded ──────────────────────────────
    if (typeof window.KVSWebRTC === 'undefined') {
      setStatus('error');
      setErrorMsg('KVS WebRTC SDK not loaded. Add <script src="https://unpkg.com/amazon-kinesis-video-streams-webrtc/dist/kvs-webrtc.min.js"> to index.html');
      return;
    }

    try {
      // ── 2. Fetch channel info + viewer credentials from backend ──
      const apiBase = getApiUrl ? getApiUrl('') : '';
      console.log('[KVS Debug] Fetching channel info & viewer credentials...');
      const [streamInfo, creds] = await Promise.all([
        fetch(`${apiBase}/streams/${droneId}`, {
          headers: {
            Authorization: `Bearer ${(() => {
              try { return JSON.parse(localStorage.getItem('z_drone_user') || '{}').token || ''; }
              catch { return ''; }
            })()}`
          }
        }).then(r => { if (!r.ok) throw new Error(`streams API: ${r.status}`); return r.json(); }),
        fetch(`${apiBase}/streams/${droneId}/viewer-credentials`, {
          headers: {
            Authorization: `Bearer ${(() => {
              try { return JSON.parse(localStorage.getItem('z_drone_user') || '{}').token || ''; }
              catch { return ''; }
            })()}`
          }
        }).then(r => { if (!r.ok) throw new Error(`credentials API: ${r.status}`); return r.json(); }),
      ]);

      if (!mountedRef.current) return;
      console.log('[KVS Debug] Credentials & channel info fetched successfully!', {
        channelArn: streamInfo.channel_arn,
        endpointUrl: streamInfo.endpoint_url,
        region: creds.region
      });

      const { SignalingClient, Role } = window.KVSWebRTC;

      // ── 3. Create RTCPeerConnection with ICE servers from AWS ──
      console.log('[KVS Debug] Initializing RTCPeerConnection with ICE servers:', streamInfo.ice_servers);
      const pc = new RTCPeerConnection({
        iceServers: streamInfo.ice_servers || [],
        iceTransportPolicy: 'all',
      });
      peerConnectionRef.current = pc;

      // When the drone's video track arrives, attach it
      pc.ontrack = (event) => {
        if (!mountedRef.current) return;
        console.log('[KVS Debug] Received media track from Master (Jetson)!', event.streams);
        if (videoRef.current && event.streams[0]) {
          videoRef.current.srcObject = event.streams[0];
          setStatus('live');
        }
      };

      // ICE connection state monitoring
      pc.oniceconnectionstatechange = () => {
        if (!mountedRef.current) return;
        const state = pc.iceConnectionState;
        console.log('[KVS Debug] PeerConnection ICE state changed to:', state);
        if (state === 'disconnected' || state === 'failed' || state === 'closed') {
          setStatus('reconnecting');
          cleanup();
          scheduleReconnect();
        }
      };

      // ── 4. Create KVS Signaling Client as VIEWER ──────────────
      const region = creds.region || streamInfo.region || 'ap-south-1';
      console.log('[KVS Debug] Creating KVS SignalingClient for VIEWER role...');
      const signalingClient = new SignalingClient({
        channelARN: streamInfo.channel_arn,
        channelEndpoint: streamInfo.endpoint_url,
        role: Role.VIEWER,
        region,
        credentials: {
          accessKeyId: creds.accessKeyId,
          secretAccessKey: creds.secretAccessKey,
          ...(creds.sessionToken ? { sessionToken: creds.sessionToken } : {}),
        },
        clientId: `zdash-viewer-${Date.now()}`,
        systemClockOffset: 0,
      });
      signalingClientRef.current = signalingClient;

      signalingClient.on('open', async () => {
        if (!mountedRef.current) return;
        console.log('[KVS Debug] Signaling connection opened successfully! Generating SDP offer...');
        pc.addTransceiver('video', { direction: 'recvonly' });
        pc.addTransceiver('audio', { direction: 'recvonly' });
        
        const offer = await pc.createOffer();
        console.log('[KVS Debug] Created local SDP Offer. Setting local description...');
        await pc.setLocalDescription(offer);
        
        console.log('[KVS Debug] Sending SDP offer to KVS signaling channel...');
        signalingClient.sendSdpOffer(pc.localDescription);
      });

      signalingClient.on('sdpAnswer', async (answer) => {
        if (!mountedRef.current) return;
        console.log('[KVS Debug] Received SDP Answer from Master (Jetson). Setting remote description...');
        await pc.setRemoteDescription(answer);
      });

      signalingClient.on('iceCandidate', (candidate) => {
        if (!mountedRef.current) return;
        console.log('[KVS Debug] Received ICE Candidate from Master (Jetson). Adding candidate...');
        pc.addIceCandidate(candidate).catch(err => {
          console.warn('[KVS Debug] Error adding remote ICE candidate:', err);
        });
      });

      pc.onicecandidate = ({ candidate }) => {
        if (candidate) {
          console.log('[KVS Debug] Generated local ICE candidate. Sending to Master...');
          signalingClient.sendIceCandidate(candidate);
        }
      };

      signalingClient.on('error', (err) => {
        if (!mountedRef.current) return;
        console.error('[KVS Debug] Signaling error:', err);
        setStatus('error');
        setErrorMsg('Signaling error. Retrying in 5s…');
        cleanup();
        scheduleReconnect();
      });

      signalingClient.on('close', () => {
        if (!mountedRef.current) return;
        console.warn('[KVS Debug] Signaling connection closed. Scheduling auto-reconnect...');
        if (status !== 'reconnecting') scheduleReconnect();
      });

      console.log('[KVS Debug] Activating signalingClient.open() link...');
      signalingClient.open();
    } catch (err) {
      if (!mountedRef.current) return;
      console.error('[KVS] Stream setup failed:', err);
      setStatus('error');
      setErrorMsg(err.message || 'Failed to connect. Retrying…');
      scheduleReconnect();
    }
  }, [droneId, cleanup, getApiUrl]);

  // Patch scheduleReconnect to call startStream (closure workaround)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const scheduleReconnectFull = useCallback(() => {
    if (!mountedRef.current) return;
    setStatus('reconnecting');
    let remaining = Math.ceil(AUTO_RECONNECT_DELAY_MS / 1000);
    setReconnectCountdown(remaining);
    const tick = setInterval(() => {
      remaining -= 1;
      setReconnectCountdown(remaining);
      if (remaining <= 0) clearInterval(tick);
    }, 1000);
    reconnectTimerRef.current = setTimeout(() => {
      clearInterval(tick);
      if (mountedRef.current) startStream();
    }, AUTO_RECONNECT_DELAY_MS);
  }, [startStream]);

  useEffect(() => {
    mountedRef.current = true;
    if (droneId) startStream();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimerRef.current);
      cleanup();
    };
  }, [droneId]);

  // ── Status badge config ──────────────────────────────────────
  const statusConfig = {
    idle:         { color: 'bg-slate-600',           dot: '',                        label: 'Idle' },
    connecting:   { color: 'bg-amber-500/90',         dot: 'animate-pulse',           label: 'Connecting…' },
    live:         { color: 'bg-red-600/90',           dot: 'animate-pulse',           label: 'LIVE' },
    error:        { color: 'bg-red-800/90',           dot: '',                        label: 'Error' },
    reconnecting: { color: 'bg-orange-600/90',        dot: 'animate-ping',            label: `Reconnecting in ${reconnectCountdown}s` },
  };
  const badge = statusConfig[status] || statusConfig.idle;

  return (
    <div
      className={`relative bg-slate-900 rounded-xl overflow-hidden ${className}`}
      style={{ minHeight: 260 }}
    >
      {/* ── Video element ── */}
      <video
        ref={videoRef}
        autoPlay
        muted
        playsInline
        className="w-full h-full object-cover"
        style={{ display: status === 'live' ? 'block' : 'none' }}
      />

      {/* ── Overlay for non-live states ── */}
      {status !== 'live' && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 text-center p-6 bg-slate-900/90">
          {status === 'idle' && (
            <>
              <span className="material-symbols-outlined text-5xl text-slate-600">videocam_off</span>
              <p className="text-slate-400 text-sm">Select a drone to view its live feed</p>
            </>
          )}
          {status === 'connecting' && (
            <>
              <div className="relative">
                <div className="w-14 h-14 border-2 border-sky-500/30 rounded-full" />
                <div className="absolute inset-0 w-14 h-14 border-t-2 border-sky-400 rounded-full animate-spin" />
              </div>
              <div>
                <p className="text-sky-300 text-sm font-semibold">Connecting to {droneName || droneId}</p>
                <p className="text-slate-500 text-xs mt-1">Establishing WebRTC via AWS Kinesis Video Streams</p>
              </div>
            </>
          )}
          {(status === 'error' || status === 'reconnecting') && (
            <>
              <span className="material-symbols-outlined text-4xl text-orange-400">
                {status === 'error' ? 'signal_disconnected' : 'sync'}
              </span>
              <div>
                <p className="text-orange-300 text-sm font-semibold">
                  {status === 'reconnecting' ? `Auto-reconnecting…` : 'Connection Error'}
                </p>
                <p className="text-slate-500 text-xs mt-1 max-w-56 mx-auto">{errorMsg}</p>
                {status === 'reconnecting' && (
                  <p className="text-slate-400 text-xs mt-1">Retrying in {reconnectCountdown}s</p>
                )}
              </div>
              <button
                onClick={startStream}
                className="mt-1 px-5 py-1.5 bg-sky-600 hover:bg-sky-500 text-white text-xs font-semibold rounded-lg transition-colors"
              >
                Retry Now
              </button>
            </>
          )}
        </div>
      )}

      {/* ── Status badge (top-left) ── */}
      <div className={`absolute top-3 left-3 flex items-center gap-1.5 ${badge.color} text-white text-[10px] font-bold px-2.5 py-1 rounded-full uppercase tracking-wide backdrop-blur-sm shadow`}>
        <span className={`w-1.5 h-1.5 bg-white rounded-full ${badge.dot}`} />
        {badge.label}
      </div>

      {/* ── Controls (top-right, only when live) ── */}
      {status === 'live' && (
        <div className="absolute top-3 right-3 flex gap-2">
          <button
            onClick={scheduleReconnectFull}
            className="bg-slate-800/80 hover:bg-slate-700 text-white p-1.5 rounded-lg transition-colors backdrop-blur-sm"
            title="Reconnect stream"
          >
            <span className="material-symbols-outlined text-sm">refresh</span>
          </button>
          <button
            onClick={() => { cleanup(); setStatus('idle'); }}
            className="bg-slate-800/80 hover:bg-slate-700 text-white p-1.5 rounded-lg transition-colors backdrop-blur-sm"
            title="Stop stream"
          >
            <span className="material-symbols-outlined text-sm">stop</span>
          </button>
        </div>
      )}

      {/* ── Drone label (bottom-left, only when live) ── */}
      {droneId && status === 'live' && (
        <div className="absolute bottom-3 left-3 bg-slate-900/75 backdrop-blur-sm text-white text-xs font-semibold px-3 py-1 rounded-lg flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 bg-sky-400 rounded-full" />
          {droneName || droneId} — AWS KVS WebRTC
        </div>
      )}
    </div>
  );
}
