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

/**
 * mungeSDPForKVSCSDK — Transforms the browser SDP offer to be compatible with
 * the Amazon KVS WebRTC C SDK running on Jetson hardware.
 *
 * Two problems the KVS C SDK has with raw Chrome SDP:
 *
 * 1. STATUS_SDP_MISSING_ICE_VALUES (0x40100001)
 *    Chrome puts a=ice-ufrag / a=ice-pwd only at the MEDIA level (inside each
 *    m= section). The KVS C SDK parses for those attributes at SESSION level
 *    (before any m= line). Fix: copy the ICE credentials to the session block.
 *
 * 2. Audio direction mismatch
 *    Jetson adds an audio transceiver as SENDRECV. Chrome offered audio as
 *    recvonly — the C SDK rejects the direction conflict. Fix: strip the audio
 *    m-line from the offer entirely (drone is video-only anyway).
 */
function mungeSDPForKVSCSDK(sdpString) {
  const lines = sdpString.split('\r\n');

  // ── Step 1: Extract session-level ICE credentials from media sections ─────
  // Chrome only emits a=ice-ufrag / a=ice-pwd at media level.
  // KVS C SDK (STATUS_SDP_MISSING_ICE_VALUES = 0x40100001) requires them at
  // SESSION level (before the first m= line). We copy them up.
  let iceUfrag = '';
  let icePwd   = '';
  let inMedia  = false;
  for (const line of lines) {
    if (line.startsWith('m=')) inMedia = true;
    if (inMedia && !iceUfrag && line.startsWith('a=ice-ufrag:')) iceUfrag = line;
    if (inMedia && !icePwd   && line.startsWith('a=ice-pwd:'))   icePwd   = line;
    if (iceUfrag && icePwd) break;
  }

  // ── Step 2: Find the correct H264 payload type (profile 42E01F, mode 1) ───
  let targetVideoPayload = '109'; // Chrome default, but verify
  let inVideoSection = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('m=video')) { inVideoSection = true; continue; }
    if (line.startsWith('m=') && !line.startsWith('m=video')) { inVideoSection = false; continue; }
    if (inVideoSection && line.startsWith('a=rtpmap:')) {
      const m = line.match(/^a=rtpmap:(\d+)\s+H264\//i);
      if (m) {
        const pt = m[1];
        // look ahead for the matching fmtp line
        for (let j = i + 1; j < Math.min(i + 20, lines.length); j++) {
          if (lines[j].startsWith(`a=fmtp:${pt} `) &&
              lines[j].toLowerCase().includes('profile-level-id=42e01f') &&
              lines[j].includes('packetization-mode=1')) {
            targetVideoPayload = pt;
            break;
          }
        }
      }
    }
  }
  console.log('[KVS SDP] Using H264 payload type:', targetVideoPayload);

  // ── Step 3: Build the munged SDP ──────────────────────────────────────────
  const out = [];
  let sessionDone   = false; // have we injected session-level ICE yet?
  let inAudio       = false; // are we inside the audio m-section?
  let skipAudio     = false; // drop audio m-line entirely

  for (const line of lines) {
    // Inject session-level ICE just before the first m= line
    if (!sessionDone && line.startsWith('m=')) {
      if (iceUfrag) out.push(iceUfrag);
      if (icePwd)   out.push(icePwd);
      sessionDone = true;
    }

    // ── Audio: strip entire m=audio section ──────────────────────────────────
    // Jetson hardware C SDK adds audio transceiver as SENDRECV; browser offers
    // recvonly — KVS C SDK rejects the direction mismatch. Drone has no mic anyway.
    if (line.startsWith('m=audio')) { inAudio = true; skipAudio = true; continue; }
    if (line.startsWith('m=') && !line.startsWith('m=audio')) { inAudio = false; skipAudio = false; }
    if (skipAudio) continue;

    // ── Video m-line: lock to single payload type ─────────────────────────────
    if (line.startsWith('m=video')) {
      const parts = line.split(' ');
      out.push(`m=video 9 ${parts[2]} ${targetVideoPayload}`);
      continue;
    }

    // ── Inside video: keep only lines belonging to our payload type ───────────
    if (!inAudio && (line.startsWith('a=rtpmap:') || line.startsWith('a=rtcp-fb:'))) {
      const m = line.match(/^a=(?:rtpmap|rtcp-fb):(\d+)/);
      if (m && m[1] !== targetVideoPayload) continue; // drop other codecs
    }

    // ── Dynamic a=fmtp parsing and reordering (KVS C SDK compliance) ─────────
    if (line.startsWith('a=fmtp:')) {
      const m = line.match(/^a=fmtp:(\d+)/);
      if (m && m[1] !== targetVideoPayload) continue; // drop other codecs
      
      const spaceIdx = line.indexOf(' ');
      if (spaceIdx !== -1) {
        const prefix = line.substring(0, spaceIdx); // e.g. "a=fmtp:109"
        const paramsStr = line.substring(spaceIdx + 1);
        const params = paramsStr.split(';').map(p => p.trim());
        
        let profileLevelId = '42e01f';
        let levelAsymmetryAllowed = '1';
        let packetizationMode = '1';
        
        for (const param of params) {
          const parts = param.split('=');
          if (parts.length === 2) {
            const key = parts[0].trim().toLowerCase();
            const val = parts[1].trim();
            if (key === 'profile-level-id') {
              profileLevelId = val.toLowerCase();
            } else if (key === 'level-asymmetry-allowed') {
              levelAsymmetryAllowed = val;
            } else if (key === 'packetization-mode') {
              packetizationMode = val;
            }
          }
        }
        // Force profile-level-id FIRST, then level-asymmetry-allowed, then packetization-mode
        out.push(`${prefix} profile-level-id=${profileLevelId};level-asymmetry-allowed=${levelAsymmetryAllowed};packetization-mode=${packetizationMode}`);
        continue;
      }
    }

    // ── Strip extmap to keep SDP small ───────────────────────────────────────
    if (line.startsWith('a=extmap:')) continue;

    // ── Fix BUNDLE group: only video mid=0 ───────────────────────────────────
    if (line.startsWith('a=group:BUNDLE')) {
      out.push('a=group:BUNDLE 0');
      continue;
    }

    out.push(line);
  }

  return out.join('\r\n');
}

export default function LiveStreamViewer({ droneId, droneName, getApiUrl, className = '' }) {
  const videoRef = useRef(null);
  const signalingClientRef = useRef(null);
  const peerConnectionRef = useRef(null);
  const reconnectTimerRef = useRef(null);
  const mountedRef = useRef(true);
  const startStreamRef = useRef(null);

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
      if (mountedRef.current && startStreamRef.current) {
        startStreamRef.current();
      }
    }, AUTO_RECONNECT_DELAY_MS);
  }, []);

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
        console.log('[KVS] Signaling open — building KVS-C-SDK-compatible offer...');

        // Monkey-patch underlying WebSocket to strip null bytes from KVS C SDK payload
        try {
          const ws = signalingClient.websocket;
          if (ws && !ws._patchedForNullBytes) {
            ws._patchedForNullBytes = true;
            const origOnMsg = ws.onmessage;
            if (origOnMsg) {
              ws.onmessage = (event) => {
                if (typeof event.data === 'string' && event.data.includes('messagePayload')) {
                  const fixedData = event.data.replace(/"messagePayload"\s*:\s*"([^"]+)"/g, (_, b64) => {
                    try {
                      const decoded = atob(b64).replace(/\0/g, '');
                      return `"messagePayload":"${btoa(decoded)}"`;
                    } catch (e) {
                      return _;
                    }
                  });
                  origOnMsg.call(ws, new MessageEvent('message', {
                    data: fixedData,
                    origin: event.origin,
                    lastEventId: event.lastEventId,
                    source: event.source,
                    ports: event.ports
                  }));
                  return;
                }
                origOnMsg.call(ws, event);
              };
            }
          }
        } catch (e) {
          console.warn('[KVS Debug] Failed to apply websocket null-byte patch:', e);
        }

        // Video-only transceiver. No audio — the Jetson adds audio SENDRECV which
        // conflicts with browser recvonly; KVS C SDK rejects it (0x40100001).
        pc.addTransceiver('video', { direction: 'recvonly' });

        const rawOffer = await pc.createOffer();

        // ── Full KVS C SDK compatibility munge in one pass ──────────────────────
        // 1. Injects session-level a=ice-ufrag / a=ice-pwd (fixes STATUS_SDP_MISSING_ICE_VALUES)
        // 2. Strips audio m-section entirely (avoids SENDRECV vs recvonly mismatch)
        // 3. Locks to H264 pt=109, uppercase profile-level-id=42E01F
        // 4. Fixes BUNDLE group to contain only mid 0
        const finalSdp = mungeSDPForKVSCSDK(rawOffer.sdp || '');
        const offer = new RTCSessionDescription({ type: rawOffer.type, sdp: finalSdp });

        await pc.setLocalDescription(offer);

        console.log('[KVS SDP] Final munged offer — length:', finalSdp.length, '| lines:', finalSdp.split('\r\n').length);
        console.log('[KVS SDP] Audio stripped:', !finalSdp.includes('m=audio'));
        console.log('[KVS SDP] H264 42e01f present:', finalSdp.includes('profile-level-id=42e01f'));
        console.log('[KVS SDP] Sending to Jetson master...');

        signalingClient.sendSdpOffer(offer);
      });

      signalingClient.on('sdpAnswer', async (answer) => {
        if (!mountedRef.current) return;
        console.log('[KVS Debug] Received SDP Answer from Master (Jetson). Setting remote description...');
        await pc.setRemoteDescription(answer);
      });

      signalingClient.on('close', () => {
        console.log('[KVS Debug] Signaling WebSocket CLOSED');
      });
      signalingClient.on('error', (err) => {
        console.log('[KVS Debug] Signaling WebSocket ERROR', err);
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

  // Keep startStreamRef up to date on each render
  startStreamRef.current = startStream;

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
            onClick={scheduleReconnect}
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
