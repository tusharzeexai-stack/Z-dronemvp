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

// Helper to filter and reduce SDP size for embedded WebRTC device limits (KVS C++ SDK)
function filterSDP(sdpString) {
  const lines = sdpString.split('\r\n');
  const newLines = [];
  
  let videoPayloadsToKeep = [];
  let audioPayloadsToKeep = [];
  let inVideoSection = false;
  let inAudioSection = false;
  
  for (const line of lines) {
    if (line.startsWith('m=video ')) {
      inVideoSection = true;
      inAudioSection = false;
    } else if (line.startsWith('m=audio ')) {
      inAudioSection = true;
      inVideoSection = false;
    }
    
    if (inVideoSection && line.startsWith('a=rtpmap:')) {
      const match = line.match(/^a=rtpmap:(\d+)\s+(\w+)\//);
      if (match) {
        const payloadType = match[1];
        const codec = match[2].toUpperCase();
        if (codec === 'H264') {
          videoPayloadsToKeep.push(payloadType);
        }
      }
    }
    if (inAudioSection && line.startsWith('a=rtpmap:')) {
      const match = line.match(/^a=rtpmap:(\d+)\s+(\w+)\//);
      if (match) {
        const payloadType = match[1];
        const codec = match[2].toUpperCase();
        if (codec === 'OPUS' || codec === 'PCMU' || codec === 'PCMA') {
          audioPayloadsToKeep.push(payloadType);
        }
      }
    }
  }
  
  inVideoSection = false;
  inAudioSection = false;
  
  for (const line of lines) {
    // Skip all extmap lines to reduce SDP payload size
    if (line.startsWith('a=extmap:')) {
      continue;
    }
    
    if (line.startsWith('m=video ')) {
      inVideoSection = true;
      inAudioSection = false;
      const parts = line.split(' ');
      const protocol = parts[2];
      newLines.push(`m=video 9 ${protocol} ${videoPayloadsToKeep.join(' ')}`);
      continue;
    } else if (line.startsWith('m=audio ')) {
      inAudioSection = true;
      inVideoSection = false;
      const parts = line.split(' ');
      const protocol = parts[2];
      newLines.push(`m=audio 9 ${protocol} ${audioPayloadsToKeep.join(' ')}`);
      continue;
    }
    
    if (inVideoSection) {
      if (line.startsWith('a=rtpmap:') || line.startsWith('a=rtcp-fb:') || line.startsWith('a=fmtp:')) {
        const match = line.match(/^a=\w+:(\d+)/);
        if (match) {
          const payloadType = match[1];
          if (!videoPayloadsToKeep.includes(payloadType)) {
            continue;
          }
        }
      }
    }
    
    if (inAudioSection) {
      if (line.startsWith('a=rtpmap:') || line.startsWith('a=rtcp-fb:') || line.startsWith('a=fmtp:')) {
        const match = line.match(/^a=\w+:(\d+)/);
        if (match) {
          const payloadType = match[1];
          if (!audioPayloadsToKeep.includes(payloadType)) {
            continue;
          }
        }
      }
    }
    
    newLines.push(line);
  }
  
  return newLines.join('\r\n');
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
        console.log('[KVS Debug] Signaling connection opened successfully! Adding video transceiver...');
        
        pc.addTransceiver('video', { direction: 'recvonly' });
        
        // --- Codec & Transceiver Diagnostics ---
        try {
          console.log('[KVS Debug] RTCPeerConnection Transceivers configured:');
          pc.getTransceivers().forEach((t, idx) => {
            const kind = t.receiver?.track?.kind || t.sender?.track?.kind || 'unknown';
            console.log(`  [Transceiver #${idx}] Kind: ${kind}, Direction: ${t.direction}`);
            
            // Log supported video/audio codecs if capability API is available
            if (RTCRtpReceiver && RTCRtpReceiver.getCapabilities) {
              const caps = RTCRtpReceiver.getCapabilities(kind);
              if (caps && caps.codecs) {
                console.log(`    Available Codecs for ${kind}:`, caps.codecs.map(c => `${c.mimeType} (${c.sdpFmtpLine || 'no parameters'})`));
              }
            }
          });
        } catch (e) {
          console.warn('[KVS Debug] Failed to read transceiver capabilities:', e);
        }

        console.log('[KVS Debug] Generating SDP Offer...');
        const offer = await pc.createOffer();
        console.log('[KVS Debug] Created local SDP Offer. Setting local description...');
        await pc.setLocalDescription(offer);
        
        // --- SDP Offer Diagnostics ---
        const sdp = offer.sdp || '';
        const lines = sdp.split('\r\n');
        console.log('[KVS SDP Debug] Offer SDP Length:', sdp.length, 'Total Lines:', lines.length);
        console.log('[KVS SDP Debug] --- FIRST 30 LINES ---');
        console.log(lines.slice(0, 30).join('\n'));
        console.log('[KVS SDP Debug] --- LAST 30 LINES ---');
        console.log(lines.slice(-30).join('\n'));
        
        console.log('[KVS SDP Debug] --- CRITICAL KEYS CHECKLIST ---');
        console.log('  - m=video present:', sdp.includes('m=video'));
        console.log('  - H264 codec listed:', sdp.toLowerCase().includes('h264'));
        console.log('  - a=ice-ufrag present:', sdp.includes('a=ice-ufrag'));
        console.log('  - a=ice-pwd present:', sdp.includes('a=ice-pwd'));
        console.log('  - a=fingerprint present:', sdp.includes('a=fingerprint'));
        console.log('  - a=setup:actpass present:', sdp.includes('a=setup:actpass'));
        
        const h264Specs = lines.filter(l => l.toLowerCase().includes('h264'));
        console.log('[KVS SDP Debug] H.264 specific lines:', h264Specs);

        const filteredSdpString = filterSDP(sdp);
        console.log('[KVS SDP Debug] Filtered SDP Length:', filteredSdpString.length, 'Total Lines:', filteredSdpString.split('\r\n').length);
        console.log('[KVS SDP Debug] Filtered SDP:\n', filteredSdpString);
        console.log('[KVS Debug] Sending filtered SDP offer to KVS signaling channel...');
        signalingClient.sendSdpOffer(new RTCSessionDescription({
          type: 'offer',
          sdp: filteredSdpString
        }));
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
