import cv2
import os

def extract_frames(video_path, output_dir, max_duration_sec=30, frame_count=15):
    if not os.path.exists(output_dir):
        os.makedirs(output_dir)
        print(f"Created output directory: {output_dir}")
        
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error opening video file: {video_path}")
        return
        
    fps = cap.get(cv2.CAP_PROP_FPS)
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration_sec = total_frames / fps
    print(f"Video FPS: {fps}, Total Frames: {total_frames}, Duration: {duration_sec:.2f}s")
    
    # We only process up to max_duration_sec
    limit_frames = min(total_frames, int(max_duration_sec * fps))
    interval = max(1, limit_frames // frame_count)
    
    saved_count = 0
    for i in range(frame_count):
        frame_idx = i * interval
        if frame_idx >= limit_frames:
            break
            
        cap.set(cv2.CAP_PROP_POS_FRAMES, frame_idx)
        ret, frame = cap.read()
        if not ret:
            break
            
        # Resize frame to a sensible size for web (e.g. 480x270)
        resized_frame = cv2.resize(frame, (480, 270))
        output_path = os.path.join(output_dir, f"frame_{i:02d}.jpg")
        cv2.imwrite(output_path, resized_frame)
        print(f"Saved frame {i} (frame index {frame_idx}) to {output_path}")
        saved_count += 1
        
    cap.release()
    print(f"Extraction completed. Saved {saved_count} frames.")

if __name__ == "__main__":
    video_path = "d:\\DroneMVP\\public\\test1.mp4"
    output_dir = "d:\\DroneMVP\\public\\digital_twin\\frames"
    extract_frames(video_path, output_dir)
