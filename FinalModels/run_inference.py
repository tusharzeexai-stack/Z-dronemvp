"""
Okutama-Action Inference Viewer / Exporter
==========================================
Runs the two official Okutama-Action Caffe/SSD models:
  1. Pedestrian Detection  – VGG SSD 512×512
  2. Action Detection      – VGG SSD 960×540

Save mode (--save):  writes annotated video to disk at original resolution.
View mode (default): opens an OpenCV window.

Controls (OpenCV window, view mode only):
  SPACE  – pause / resume
  S      – step one frame when paused
  Q/ESC  – quit
  1      – show only Pedestrian detections
  2      – show only Action detections
  B      – toggle both models
  +/-    – increase / decrease confidence threshold (0.05 steps)
"""

import cv2
import numpy as np
import argparse
import sys
import os
import time

# ─────────────────────────── paths ───────────────────────────
BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "Final-Models")

PED_DIR    = os.path.join(BASE, "Pedestrian-detection")
PED_PROTO  = os.path.join(PED_DIR, "deploy.prototxt")
PED_MODEL  = os.path.join(PED_DIR, "VGG_okutama_SSD_512x512_iter_20000.caffemodel")
PED_XML    = os.path.join(PED_DIR, "VGG_okutama_SSD_512x512_iter_20000.xml")
PED_W, PED_H = 512, 512

ACT_DIR    = os.path.join(BASE, "Action-detection")
ACT_PROTO  = os.path.join(ACT_DIR, "deploy.prototxt")
ACT_MODEL  = os.path.join(ACT_DIR, "VGG_okutama_action_SSD_960x540_iter_12000.caffemodel")
ACT_XML    = os.path.join(ACT_DIR, "VGG_okutama_action_SSD_960x540_iter_12000.xml")
ACT_W, ACT_H = 960, 540

# ImageNet mean used during Caffe SSD training
MEAN = (104.0, 117.0, 123.0)

# ─────────────────────────── labels ───────────────────────────
PEDESTRIAN_CLASSES = ["background", "person"]

ACTION_CLASSES = [
    "background",
    "Walking",
    "Sitting",
    "Standing",
    "Running",
    "Lying",
    "Carrying",
    "Pushing/Pulling",
    "Reading",
    "Drinking",
    "Calling",
    "Hand Shaking",
    "Hugging",
]

# ─────────────────────────── colours ──────────────────────────
ACTION_COLORS = [
    (0,   0,   0),      # background
    (0,   200, 80),     # Walking      – green
    (255, 180, 0),      # Sitting      – amber
    (30,  144, 255),    # Standing     – dodger blue
    (255, 50,  50),     # Running      – red
    (180, 50,  220),    # Lying        – purple
    (255, 140, 0),      # Carrying     – orange
    (0,   220, 220),    # Pushing/Pull – cyan
    (255, 20,  147),    # Reading      – deep pink
    (100, 200, 255),    # Drinking     – sky blue
    (144, 238, 144),    # Calling      – light green
    (255, 215, 0),      # Hand Shaking – gold
    (255, 105, 180),    # Hugging      – hot pink
]
PED_COLOR = (50, 220, 50)  # bright green for pedestrians

FONT      = cv2.FONT_HERSHEY_SIMPLEX
FONT_SCALE= 0.52
THICKNESS = 1


# ═══════════════════════════════════════════════════════════════
def load_networks():
    """Load both networks via OpenVINO if available, otherwise OpenCV DNN."""
    is_openvino = False
    ped_net = None
    act_net = None

    try:
        import openvino as ov
        if os.path.isfile(PED_XML) and os.path.isfile(ACT_XML):
            print("[INFO] Loading models with OpenVINO fast GPU/CPU acceleration...")
            core = ov.Core()
            ped_model = core.read_model(PED_XML)
            act_model = core.read_model(ACT_XML)
            
            # Compile to AUTO (will automatically select the best device, preference for GPU)
            ped_net = core.compile_model(ped_model, "AUTO")
            act_net = core.compile_model(act_model, "AUTO")
            is_openvino = True
            print("[INFO] OpenVINO models compiled successfully to AUTO device.\n")
            return ped_net, act_net, is_openvino
    except Exception as e:
        print(f"[WARNING] OpenVINO loading failed or not installed: {e}")
        print("[INFO] Falling back to default OpenCV DNN Caffe loading...")

    print("[INFO] Loading Pedestrian Detection model …")
    if not os.path.isfile(PED_MODEL):
        raise FileNotFoundError(f"Pedestrian model not found: {PED_MODEL}")
    ped_net = cv2.dnn.readNetFromCaffe(PED_PROTO, PED_MODEL)

    print("[INFO] Loading Action Detection model …")
    if not os.path.isfile(ACT_MODEL):
        raise FileNotFoundError(f"Action model not found: {ACT_MODEL}")
    act_net = cv2.dnn.readNetFromCaffe(ACT_PROTO, ACT_MODEL)

    print("[INFO] Caffe models loaded successfully via OpenCV DNN.\n")
    return ped_net, act_net, is_openvino


def detect(net, frame, inp_w, inp_h, is_openvino=False):
    """Run one forward pass and return raw SSD detections array."""
    blob = cv2.dnn.blobFromImage(
        frame, scalefactor=1.0, size=(inp_w, inp_h),
        mean=MEAN, swapRB=False, crop=False
    )
    if is_openvino:
        return net([blob])[0]
    else:
        net.setInput(blob)
        return net.forward()          # shape: (1, 1, N, 7)


def draw_detections(frame, detections, class_labels, class_colors, conf_thresh, label_prefix=""):
    """Draw bounding boxes and labels on *frame* in-place. Returns count."""
    h, w = frame.shape[:2]
    count = 0
    for det in detections[0, 0]:
        conf = float(det[2])
        if conf < conf_thresh:
            continue
        cls_id = int(det[1])
        if cls_id <= 0 or cls_id >= len(class_labels):
            continue

        x1 = max(0, int(det[3] * w))
        y1 = max(0, int(det[4] * h))
        x2 = min(w - 1, int(det[5] * w))
        y2 = min(h - 1, int(det[6] * h))

        color = class_colors[cls_id] if cls_id < len(class_colors) else (200, 200, 200)
        label = f"{label_prefix}{class_labels[cls_id]}: {conf:.2f}"

        cv2.rectangle(frame, (x1, y1), (x2, y2), color, 2)

        # Label background pill
        (tw, th), _ = cv2.getTextSize(label, FONT, FONT_SCALE, THICKNESS)
        cv2.rectangle(frame, (x1, y1 - th - 6), (x1 + tw + 4, y1), color, -1)
        lum = 0.299 * color[2] + 0.587 * color[1] + 0.114 * color[0]  # BGR → lum
        txt_color = (0, 0, 0) if lum > 128 else (255, 255, 255)
        cv2.putText(frame, label, (x1 + 2, y1 - 3), FONT, FONT_SCALE, txt_color, THICKNESS, cv2.LINE_AA)
        count += 1
    return count


def draw_hud(frame, conf_thresh, mode, fps, ped_count, act_count, paused):
    """Overlay HUD info at top-left."""
    h, w = frame.shape[:2]

    # Semi-transparent background strip
    overlay = frame.copy()
    cv2.rectangle(overlay, (0, 0), (w, 110), (10, 10, 30), -1)
    cv2.addWeighted(overlay, 0.55, frame, 0.45, 0, frame)

    mode_str = {1: "Pedestrian Only", 2: "Action Only", 3: "Both Models"}[mode]
    lines = [
        f"Mode: {mode_str}  |  Conf: {conf_thresh:.2f}  |  FPS: {fps:.1f}",
        f"Pedestrians: {ped_count}   Actions: {act_count}",
        "SPACE=pause  Q=quit  1/2/B=mode  +/-=threshold  S=step",
        "PAUSED" if paused else "",
    ]
    y = 22
    for ln in lines:
        if ln:
            cv2.putText(frame, ln, (10, y), FONT, 0.55,
                        (200, 230, 255), 1, cv2.LINE_AA)
        y += 24


# ═══════════════════════════════════════════════════════════════
def run(video_source, conf_thresh=0.3, mode=3, save=False, out_path=None):
    ped_net, act_net, is_openvino = load_networks()

    cap = cv2.VideoCapture(video_source)
    if not cap.isOpened():
        print(f"[ERROR] Cannot open video source: {video_source}")
        sys.exit(1)

    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    fps_video    = cap.get(cv2.CAP_PROP_FPS) or 30.0
    vid_w        = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    vid_h        = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    print(f"[INFO] Source  : {video_source}")
    print(f"       Size    : {vid_w}x{vid_h}  |  Frames: {total_frames}  |  FPS: {fps_video:.1f}")
    print(f"       Conf    : {conf_thresh}  |  Mode: {mode}")

    # ── output writer (save mode) ────────────────────────────────
    writer = None
    if save:
        if out_path is None:
            base = os.path.splitext(str(video_source))[0] if not isinstance(video_source, int) else "webcam"
            out_path = base + "_annotated.avi"
        else:
            out_path = os.path.splitext(out_path)[0] + ".avi"

        # Try codecs in order — MJPG is always available in opencv-python (no extra install)
        for codec in ("MJPG", "XVID", "DIVX", "mp4v"):
            fourcc = cv2.VideoWriter_fourcc(*codec)
            writer = cv2.VideoWriter(out_path, fourcc, fps_video, (vid_w, vid_h))
            if writer.isOpened():
                print(f"       Codec   : {codec}")
                break
            writer = None

        if writer is None:
            print("[ERROR] No working video codec found. Install XviD or try a different OpenCV build.")
            sys.exit(1)
        print(f"       Output  : {out_path}\n")
    else:
        WIN = "Okutama-Action  |  Q to quit"
        cv2.namedWindow(WIN, cv2.WINDOW_NORMAL)
        cv2.resizeWindow(WIN, 1280, 720)
        print()

    paused    = False
    step_once = False
    fps_disp  = 0.0
    t_prev    = time.time()
    frame_idx = 0

    while True:
        if not paused or step_once:
            ret, frame = cap.read()
            step_once = False
            if not ret:
                print("\n[INFO] End of video.")
                break
            frame_idx += 1

            ped_count = 0
            act_count = 0

            # ── collect verbose detection info before drawing ─────
            ped_verbose = []
            act_verbose = []

            if mode in (1, 3):
                raw_ped = detect(ped_net, frame, PED_W, PED_H, is_openvino)
                ped_count = draw_detections(
                    frame, raw_ped, PEDESTRIAN_CLASSES,
                    [PED_COLOR] * len(PEDESTRIAN_CLASSES),
                    conf_thresh
                )
                h, w = frame.shape[:2]
                for det in raw_ped[0, 0]:
                    conf = float(det[2])
                    cls_id = int(det[1])
                    if conf >= conf_thresh and 0 < cls_id < len(PEDESTRIAN_CLASSES):
                        x1 = max(0, int(det[3] * w)); y1 = max(0, int(det[4] * h))
                        x2 = min(w-1, int(det[5] * w)); y2 = min(h-1, int(det[6] * h))
                        ped_verbose.append(
                            f"    [PED]  {PEDESTRIAN_CLASSES[cls_id]:<12}  conf={conf:.3f}  box=({x1},{y1})-({x2},{y2})"
                        )

            if mode in (2, 3):
                raw_act = detect(act_net, frame, ACT_W, ACT_H, is_openvino)
                act_count = draw_detections(
                    frame, raw_act, ACTION_CLASSES, ACTION_COLORS,
                    conf_thresh
                )
                h, w = frame.shape[:2]
                for det in raw_act[0, 0]:
                    conf = float(det[2])
                    cls_id = int(det[1])
                    if conf >= conf_thresh and 0 < cls_id < len(ACTION_CLASSES):
                        x1 = max(0, int(det[3] * w)); y1 = max(0, int(det[4] * h))
                        x2 = min(w-1, int(det[5] * w)); y2 = min(h-1, int(det[6] * h))
                        act_verbose.append(
                            f"    [ACT]  {ACTION_CLASSES[cls_id]:<16}  conf={conf:.3f}  box=({x1},{y1})-({x2},{y2})"
                        )

            # FPS calculation
            t_now    = time.time()
            fps_disp = 1.0 / max(t_now - t_prev, 1e-6)
            t_prev   = t_now

            draw_hud(frame, conf_thresh, mode, fps_disp, ped_count, act_count, paused)

            if save:
                writer.write(frame)
                pct     = frame_idx / max(total_frames, 1)
                eta     = (total_frames - frame_idx) / max(fps_disp, 1)
                bar_str = ('#' * int(pct * 30)).ljust(30, '-')
                # ── verbose per-frame line ──────────────────────────
                print(
                    f"\nFrame {frame_idx:>4}/{total_frames}  [{bar_str}]  "
                    f"{fps_disp:.2f} fps  ETA {eta:.0f}s  "
                    f"| ped={ped_count}  act={act_count}"
                )
                for line in ped_verbose + act_verbose:
                    print(line)
                continue  # skip display logic in save mode

        if not save:
            cv2.imshow(WIN, frame)
            key = cv2.waitKey(1) & 0xFF
            if key in (ord('q'), ord('Q'), 27):
                break
            elif key == ord(' '):
                paused = not paused
            elif key == ord('s') and paused:
                step_once = True
            elif key == ord('1'):
                mode = 1
            elif key == ord('2'):
                mode = 2
            elif key in (ord('b'), ord('B')):
                mode = 3
            elif key in (ord('+'), ord('=')):
                conf_thresh = min(0.95, conf_thresh + 0.05)
                print(f"\n[INFO] Confidence threshold: {conf_thresh:.2f}")
            elif key == ord('-'):
                conf_thresh = max(0.05, conf_thresh - 0.05)
                print(f"\n[INFO] Confidence threshold: {conf_thresh:.2f}")

    cap.release()
    if writer:
        writer.release()
        print(f"\n[INFO] Saved annotated video -> {out_path}")
    if not save:
        cv2.destroyAllWindows()
    print("[INFO] Done.")


# ═══════════════════════════════════════════════════════════════
def main():
    ap = argparse.ArgumentParser(
        description="Okutama-Action SSD inference viewer / exporter (OpenCV)",
        formatter_class=argparse.ArgumentDefaultsHelpFormatter,
    )
    ap.add_argument(
        "video",
        help="Path to a video file OR webcam index (0, 1, …). "
             "Provide 'sample' to auto-generate a synthetic test clip.",
    )
    ap.add_argument(
        "--conf", type=float, default=0.3,
        help="Detection confidence threshold [0–1].",
    )
    ap.add_argument(
        "--mode", type=int, default=3, choices=[1, 2, 3],
        help="1=Pedestrian only  2=Action only  3=Both models.",
    )
    ap.add_argument(
        "--save", action="store_true",
        help="Save annotated video to disk instead of displaying it.",
    )
    ap.add_argument(
        "--out", type=str, default=None,
        help="Output video path (default: <input>_annotated.mp4).",
    )
    args = ap.parse_args()

    src = args.video

    # ── synthetic sample generation ──────────────────────────────
    if src.lower() == "sample":
        src = generate_sample_video()

    # ── webcam index shortcut ─────────────────────────────────────
    elif src.isdigit():
        src = int(src)

    run(src, conf_thresh=args.conf, mode=args.mode, save=args.save, out_path=args.out)


def generate_sample_video(out_path=None):
    """
    Creates a synthetic 10-second aerial-view test video with:
    - Moving 'pedestrian' blobs (light rectangles on dark background)
    - Colour overlay to simulate drone footage
    Returns path to saved video.
    """
    import random

    if out_path is None:
        out_path = os.path.join(
            os.path.dirname(os.path.abspath(__file__)), "sample_test.mp4"
        )

    W, H, FPS, DURATION = 1280, 720, 25, 10
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(out_path, fourcc, FPS, (W, H))
    if not writer.isOpened():
        # Fallback to AVI
        out_path = out_path.replace(".mp4", ".avi")
        fourcc = cv2.VideoWriter_fourcc(*"XVID")
        writer = cv2.VideoWriter(out_path, fourcc, FPS, (W, H))

    N_PEOPLE = 8
    rng = random.Random(42)

    # Initialise synthetic 'people'
    people = []
    for _ in range(N_PEOPLE):
        people.append({
            "x": rng.randint(60, W - 60),
            "y": rng.randint(60, H - 60),
            "vx": rng.uniform(-2.5, 2.5),
            "vy": rng.uniform(-2.5, 2.5),
            "w": rng.randint(20, 40),
            "h": rng.randint(35, 65),
            "color": (rng.randint(180, 240), rng.randint(180, 240), rng.randint(180, 240)),
        })

    total_frames = FPS * DURATION
    for f in range(total_frames):
        # Synthetic aerial grass-like background
        bg = np.full((H, W, 3), (34, 68, 34), dtype=np.uint8)
        # Add random noise for texture
        noise = np.random.randint(-20, 20, (H, W, 3), dtype=np.int16)
        bg = np.clip(bg.astype(np.int16) + noise, 0, 255).astype(np.uint8)

        # Draw & move people
        for p in people:
            p["x"] = (p["x"] + p["vx"]) % W
            p["y"] = (p["y"] + p["vy"]) % H
            x1 = int(p["x"] - p["w"] // 2)
            y1 = int(p["y"] - p["h"] // 2)
            x2 = int(p["x"] + p["w"] // 2)
            y2 = int(p["y"] + p["h"] // 2)
            cv2.rectangle(bg, (x1, y1), (x2, y2), p["color"], -1)
            # Head
            cv2.circle(bg, (int(p["x"]), y1 - 6), 8, p["color"], -1)

        # Timestamp
        ts = f"Frame {f+1}/{total_frames}"
        cv2.putText(bg, ts, (10, H - 10), FONT, 0.5, (200, 200, 200), 1)

        writer.write(bg)

    writer.release()
    print(f"[INFO] Sample video saved → {out_path}")
    return out_path


if __name__ == "__main__":
    main()
