import os
import sys
import time
import json
import threading
import cv2
import numpy as np
from flask import Flask, Response, request, jsonify
from flask_cors import CORS

# Add current directory to path to import run_inference
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
import run_inference

app = Flask(__name__)
CORS(app)

# Global state
video_path = "cam1.mp4"
conf_threshold = 0.4
mode = 3
frame_skip = 3
paused = False
reset_requested = False

# Metrics updated by background thread
frame_idx = 0
total_frames = 0
fps = 0.0
ped_count = 0
act_count = 0
backend_name = "CPU"
is_openvino_used = False

# Frame buffer
placeholder_img = np.zeros((480, 640, 3), dtype=np.uint8)
cv2.putText(placeholder_img, "Initializing Stream...", (100, 240), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
_, encoded_placeholder = cv2.imencode('.jpg', placeholder_img)
latest_frame = encoded_placeholder.tobytes()
frame_lock = threading.Lock()

# Load models once
print("[INFO] Loading networks for Flask server...")
ped_net, act_net, is_openvino_used = run_inference.load_networks()
backend_name = "OpenVINO" if is_openvino_used else "CPU"
print(f"[INFO] Loaded networks successfully. Backend: {backend_name}")

def resolve_video_path(path):
    # Try resolving relative to FinalModels first
    local_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), os.path.basename(path))
    if os.path.isfile(local_path):
        return local_path
    
    # Try public directory
    public_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "public", os.path.basename(path))
    if os.path.isfile(public_path):
        return public_path
        
    # If the exact path is a file, use it
    if os.path.isfile(path):
        return path
        
    # Default to test.mp4
    default_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "test.mp4")
    return default_path

def video_worker():
    global frame_idx, total_frames, fps, ped_count, act_count, latest_frame, reset_requested, video_path, paused
    
    cap = None
    current_resolved_path = None
    
    while True:
        try:
            # Re-resolve and open video if path changed or cap is not initialized or reset is requested
            resolved = resolve_video_path(video_path)
            if cap is None or current_resolved_path != resolved or reset_requested:
                if cap is not None:
                    cap.release()
                
                # Explicitly use FFMPEG backend for reliability and thread safety
                cap = cv2.VideoCapture(resolved, cv2.CAP_FFMPEG)
                current_resolved_path = resolved
                total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                frame_idx = 0
                reset_requested = False
                print(f"[INFO] Opened video source: {resolved} | Total frames: {total_frames}")
            
            if not cap.isOpened():
                print(f"[WARNING] Video source not opened: {resolved}")
                time.sleep(1.0)
                continue
                
            if paused:
                time.sleep(0.1)
                continue
                
            # Speed handling: grab multiple frames but only retrieve/process the last one
            grab_count = frame_skip
            ret = False
            frame = None
            
            for i in range(grab_count):
                if reset_requested or resolved != current_resolved_path:
                    break
                ret, frame = cap.read()
                if not ret:
                    break
                frame_idx += 1
                
            if not ret:
                # End of video -> loop again by releasing and reopening the video file
                print(f"[INFO] Reached end of video at frame_idx {frame_idx}, looping...")
                if cap is not None:
                    cap.release()
                cap = None
                frame_idx = 0
                time.sleep(1.0)  # Pause briefly before looping to avoid spamming
                continue
                
            # Perform inference
            t_start = time.time()
            
            curr_ped_count = 0
            curr_act_count = 0
            
            # Use run_inference functions
            if mode in (1, 3):
                raw_ped = run_inference.detect(ped_net, frame, run_inference.PED_W, run_inference.PED_H, is_openvino_used)
                curr_ped_count = run_inference.draw_detections(
                    frame, raw_ped, run_inference.PEDESTRIAN_CLASSES,
                    [run_inference.PED_COLOR] * len(run_inference.PEDESTRIAN_CLASSES),
                    conf_threshold
                )
                
            if mode in (2, 3):
                raw_act = run_inference.detect(act_net, frame, run_inference.ACT_W, run_inference.ACT_H, is_openvino_used)
                curr_act_count = run_inference.draw_detections(
                    frame, raw_act, run_inference.ACTION_CLASSES, run_inference.ACTION_COLORS,
                    conf_threshold
                )
                
            t_end = time.time()
            curr_fps = 1.0 / max(t_end - t_start, 1e-6)
            
            # Update metrics
            fps = curr_fps
            ped_count = curr_ped_count
            act_count = curr_act_count
            
            # Encode frame to JPEG
            ret_enc, encoded_img = cv2.imencode('.jpg', frame)
            if ret_enc:
                with frame_lock:
                    latest_frame = encoded_img.tobytes()
                    
            # Yield control to prevent CPU hogging
            time.sleep(0.01)
            
        except Exception as e:
            print(f"[ERROR] Exception in video worker: {e}")
            time.sleep(1.0)

# Start background thread
worker_thread = threading.Thread(target=video_worker, daemon=True)
worker_thread.start()

@app.route('/video_feed')
def video_feed():
    def generate():
        while True:
            with frame_lock:
                frame_data = latest_frame
            if frame_data is not None:
                yield (b'--frame\r\n'
                       b'Content-Type: image/jpeg\r\n\r\n' + frame_data + b'\r\n')
            time.sleep(0.05)

    resp = Response(generate(), mimetype='multipart/x-mixed-replace; boundary=frame')
    resp.headers['X-Accel-Buffering'] = 'no'
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp

@app.route('/stats_feed')
def stats_feed():
    def generate():
        while True:
            status_str = "Paused" if paused else "Playing"
            data = {
                "fps": float(fps),
                "ped_count": int(ped_count),
                "act_count": int(act_count),
                "frame_idx": int(frame_idx),
                "total_frames": int(total_frames),
                "status": status_str,
                "backend": backend_name
            }
            # Yield bytes — required by Waitress/PEP 3333
            yield f"data: {json.dumps(data)}\n\n".encode('utf-8')
            time.sleep(0.33)

    resp = Response(generate(), mimetype='text/event-stream')
    resp.headers['X-Accel-Buffering'] = 'no'
    resp.headers['Cache-Control'] = 'no-cache, no-store, must-revalidate'
    resp.headers['Pragma'] = 'no-cache'
    resp.headers['Access-Control-Allow-Origin'] = '*'
    return resp

@app.route('/api/settings', methods=['POST'])
def update_settings():
    global conf_threshold, mode, frame_skip, paused, video_path
    data = request.get_json() or {}
    
    if 'paused' in data:
        paused = bool(data['paused'])
    if 'conf_threshold' in data:
        conf_threshold = float(data['conf_threshold'])
    if 'mode' in data:
        mode = int(data['mode'])
    if 'frame_skip' in data:
        frame_skip = int(data['frame_skip'])
    if 'video_path' in data:
        video_path = str(data['video_path'])
        
    return jsonify({"status": "success", "message": "Settings updated"})

@app.route('/api/reset', methods=['POST'])
def reset_video():
    global reset_requested
    reset_requested = True
    return jsonify({"status": "success", "message": "Reset requested"})

@app.route('/api/videos', methods=['GET'])
def list_videos():
    """Return list of available video sources."""
    base_dir = os.path.dirname(os.path.abspath(__file__))
    public_dir = os.path.join(os.path.dirname(base_dir), 'public')
    
    available = []
    candidates = [
        ('cam1.mp4', 'Sector Delta — cam1.mp4 (Recorded/Annotated)'),
    ]
    for filename, label in candidates:
        local = os.path.join(base_dir, filename)
        pub = os.path.join(public_dir, filename)
        if os.path.isfile(local) or os.path.isfile(pub):
            available.append({'value': filename, 'label': label})
    return jsonify(available)

if __name__ == '__main__':
    # Use Gevent WSGI server — handles unlimited streaming connections via green threads.
    # Waitress exhausts its thread pool with long-lived SSE/multipart streams.
    # Flask dev server drops connections through tunnel proxies (ngrok, lhr.life).
    try:
        from gevent import monkey
        monkey.patch_all()
        from gevent.pywsgi import WSGIServer
        print('[INFO] Starting Gevent WSGI server on port 5000...')
        print('[INFO] Running on http://0.0.0.0:5000')
        print('[INFO] Running on http://192.168.1.178:5000')
        server = WSGIServer(('0.0.0.0', 5000), app)
        server.serve_forever()
    except ImportError:
        print('[WARN] gevent not found, falling back to Flask dev server (threaded)')
        app.run(host='0.0.0.0', port=5000, threaded=True)
