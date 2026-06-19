# Okutama-Action Inference Viewer

Real-time inference on aerial drone footage using the two official
**Okutama-Action** Caffe/SSD models, loaded entirely via **OpenCV DNN** — no Caffe install required.

---

## Models

| Model | File | Input size | Classes |
|---|---|---|---|
| Pedestrian Detection | `VGG_okutama_SSD_512x512_iter_20000.caffemodel` | 512×512 | background, **person** |
| Action Detection | `VGG_okutama_action_SSD_960x540_iter_12000.caffemodel` | 960×540 | background + **12 actions** |

### Action Classes (12)
Walking · Sitting · Standing · Running · Lying · Carrying · Pushing/Pulling · Reading · Drinking · Calling · Hand Shaking · Hugging

---

## Requirements

```bash
pip install -r requirements.txt
```

> **Note:** `opencv-python` already bundles DNN support for Caffe models.  
> For GPU inference add `opencv-python-headless` with CUDA and enable in the script.

---

## Usage

### 1. View Mode (Live Window)
Run inference and watch the live results in an OpenCV window:
```bash
# Run on the provided test video
python run_inference.py test.mp4

# Run on your own video
python run_inference.py path/to/your_video.mp4

# Run on webcam (index 0)
python run_inference.py 0
```

### 2. Save Mode (Export Annotated Video)
If you just want to generate and save the annotated video without opening a live viewing window, use the `--save` flag. The script will show a live progress bar in the terminal as it processes the file.

```bash
# Save annotated video (automatically outputs to test_annotated.avi)
python run_inference.py test.mp4 --save

# Save annotated video to a specific file path
python run_inference.py test.mp4 --save --out result.avi
```

### 3. Generate Synthetic Sample
Auto-generate a synthetic test clip (with moving blobs) and run immediately:
```bash
python run_inference.py sample
```

# Options
python run_inference.py video.mp4 --conf 0.4 --mode 1
#   --conf   confidence threshold (default 0.3)
#   --mode   1=Pedestrian only  2=Action only  3=Both (default)
#   --save   save output video to disk without opening GUI
#   --out    specify custom output path (default is <input>_annotated.avi)
```

---

## Keyboard Controls (OpenCV Window)

| Key | Action |
|-----|--------|
| `SPACE` | Pause / Resume |
| `S` | Step one frame (while paused) |
| `Q` / `ESC` | Quit |
| `1` | Pedestrian detection only |
| `2` | Action detection only |
| `B` | Both models |
| `+` / `=` | Increase confidence threshold (+0.05) |
| `-` | Decrease confidence threshold (-0.05) |

---

## Sample Videos

For best results use aerial/drone footage resembling the Okutama-Action dataset:
- Top-down or oblique drone view of people outdoors
- People visible as small figures (~20–60 px tall)
- Actions: walking, running, sitting, etc.

You can use `python run_inference.py sample` to auto-generate a synthetic test clip with moving pedestrian blobs on a green (grass-like) background.

---

## Directory Structure

```
FinalModels/
├── run_inference.py          ← main script (this file)
├── requirements.txt          ← Python dependencies
├── README.md

└── Final-Models/
    ├── Pedestrian-detection/
    │   ├── deploy.prototxt
    │   └── VGG_okutama_SSD_512x512_iter_20000.caffemodel
    └── Action-detection/
        ├── deploy.prototxt
        ├── map-12000.txt        ← per-class AP results
        └── VGG_okutama_action_SSD_960x540_iter_12000.caffemodel
```

---

## About the Dataset

**Okutama-Action** is an aerial human action detection dataset captured by drones over a baseball field in Okutama, Japan. Key challenges:
- Abrupt camera movement
- Varying object scales (altitude changes)
- Multi-label actors (e.g., *Walking* + *Calling* simultaneously)
- 12 concurrent action classes

Both models use a **VGG16 backbone + SSD multi-scale detector**, trained with the Caffe framework.
