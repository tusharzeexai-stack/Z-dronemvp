# Z-DRONE Fleet Management System

Z-DRONE is an enterprise-grade drone fleet management, live telemetry tracking, and AI-enabled video analytics platform. It integrates a React/Vite frontend, a FastAPI/PostgreSQL backend, and an Edge-compatible Python streaming client with AWS Kinesis Video Streams (KVS) WebRTC.

---

## 🏗️ System Architecture

The platform consists of three main components:

1. **Frontend (`/` - React & Vite)**:
   * Real-time flight telemetry dashboard and interactive waypoint mapping (Leaflet).
   * Live WebRTC video feed rendering using AWS KVS WebRTC JS SDK.
   * Real-time AI inference analytics, alerts, and user management.
2. **Backend (`/backend` - FastAPI & PostgreSQL)**:
   * REST endpoints for drone registrations, telemetry updates, alerts, and flights.
   * WebSocket endpoints (`/ws/detections` and `/ws/telemetry`) to broadcast real-time inference metadata and flight coordinates.
   * AWS STS viewer credential generation for secure, temporary WebRTC access.
3. **Drone/Edge Client (`/drone-client` - Python / GStreamer / C++ SDK)**:
   * Captures drone camera feed (webcam or CSI camera) and streams it to AWS KVS as a WebRTC Master.
   * Emits live drone GPS telemetry (latitude, longitude, speed, battery) to the backend.

---

## 🛠️ Prerequisites

* **Runtime Environments**:
  * Node.js (v18.x or higher)
  * Python (v3.10.x or higher)
* **Databases & Cloud**:
  * PostgreSQL (Local database or AWS RDS Instance)
  * AWS Account with permission to access Kinesis Video Streams.
* **Hardware (For Edge Client)**:
  * A drone companion computer (e.g., Jetson Nano, Raspberry Pi) or a local development PC with a webcam (fallbacks to a synthetic radar feed if no camera is detected).

---

## 🚀 Setup & Execution Guide

### 1. AWS Cloud Infrastructure Setup

Before running the code, create the signaling channel in AWS:
1. Open the **AWS Kinesis Video Streams Console** in your target region (e.g., `ap-south-1`).
2. Go to **Signaling Channels** and click **Create Signaling Channel**.
3. Name it using the pattern: `zdrone-{drone_id}-cam` (e.g., `zdrone-drone01-cam`).
4. Ensure you have an IAM User with the following policy permissions to connect:
   ```json
   {
     "Version": "2012-10-17",
     "Statement": [
       {
         "Effect": "Allow",
         "Action": [
           "kinesisvideo:DescribeSignalingChannel",
           "kinesisvideo:GetSignalingChannelEndpoint",
           "kinesisvideo:ConnectAsViewer",
           "kinesisvideo:ConnectAsMaster"
         ],
         "Resource": "arn:aws:kinesisvideo:*:*:channel/zdrone-*"
       }
     ]
   }
   ```

---

### 2. Backend Setup (`/backend`)

1. **Create Virtual Environment**:
   ```bash
   cd backend
   python -m venv venv
   # On Windows:
   .\venv\Scripts\activate
   # On macOS/Linux:
   source venv/bin/activate
   ```
2. **Install Dependencies**:
   ```bash
   pip install -r requirements.txt
   ```
3. **Configure Environment Variables**:
   Create a `.env` file in the `/backend` folder based on `.env.example`:
   ```ini
   DATABASE_URL=postgresql+asyncpg://<user>:<password>@<host>:5432/<dbname>
   JWT_SECRET=your_jwt_secret_key
   JWT_ALGORITHM=HS256
   
   AWS_ACCESS_KEY_ID=your_aws_access_key
   AWS_SECRET_ACCESS_KEY=your_aws_secret_key
   AWS_REGION=ap-south-1
   S3_BUCKET=your_s3_bucket_name
   
   CORS_ORIGINS=http://localhost:5173,https://your-vercel-domain.vercel.app
   PORT=8000
   
   ADMIN_USERNAME=admin
   ADMIN_PASSWORD=your_secure_password
   ```
4. **Initialize and Seed Database**:
   Run the startup command. The backend will automatically bind to the database, construct tables, and seed the default user (`admin`) and sample fleet data if the database is empty:
   ```bash
   uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
   ```

---

### 3. Frontend Setup (Root `/`)

1. **Install Node Modules**:
   ```bash
   npm install
   ```
2. **Configure Backend URL Connection**:
   * **Local connection**: When running the app locally, configure the backend API target.
   * **Tunneling (Remote Hardware Dev)**: If the backend is running on a cloud instance/local machine and you are using a tunnel (e.g., Serveo or LocalTunnel), set the URL in the dashboard settings panel or write a `.env.local` file:
     ```ini
     VITE_API_URL=https://your-tunnel-subdomain.serveousercontent.com
     ```
3. **Run Dev Server**:
   ```bash
   npm run dev
   ```
   *The site will start locally at `http://localhost:5173`.*

4. **Production Build & Deploying to AWS**:
   ```bash
   npm run build
   ```
   * **AWS Amplify (Recommended)**: Connect your repository. In build settings, set the build base directory to `dist`. **Crucial SPA Redirect Rule**: Add a Rewrite (200) rule redirecting `</^[^.]+$|\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp|mp4)$)([^.]+$)/>` to `/index.html`.
   * **Terraform / S3 / CloudFront**: Navigate to `/terraform` and run `terraform init` and `terraform apply`. Once provisioned, upload the static files to S3.

---

### 4. Drone/Edge Client Setup (`/drone-client`)

The companion client script runs on the drone hardware to push telemetry and the video feed.

1. **Install Python Requirements**:
   ```bash
   cd drone-client
   pip install -r requirements.txt
   ```
2. **Run Streamer**:
   Ensure you export the AWS credentials in your terminal environment:
   ```bash
   export AWS_ACCESS_KEY_ID="your_key"
   export AWS_SECRET_ACCESS_KEY="your_secret"
   export AWS_REGION="ap-south-1"
   
   # Run the client:
   python webrtc_stream.py --drone-id drone01 --backend-url http://localhost:8000 --camera 0
   ```
   *If `--camera 0` is not accessible, it will automatically fall back to streaming a high-quality simulated telemetry HUD grid to Kinesis Video Streams.*

---

## 🧠 Solved Architectural Issues & Gotchas

If you are modifying or maintaining this codebase, please pay special attention to the following architectural solutions that have been put in place:

### ⚠️ WebRTC Signalling Lifetime (Stale Closures)
* **The Bug**: WebRTC signaling WebSockets naturally close once negotiation finishes and the PeerConnection becomes `'connected'`. However, functional React event handlers captured a stale snapshot of the `status` state (capturing `'connecting'`). When the WebSocket closed, it triggered a teardown and reconnection, putting the browser in an infinite loop of reconnecting.
* **The Solution**: The frontend now utilizes a `statusRef` synchronized with the `status` state. The signaling client's `close` and `error` listeners check `statusRef.current` and **skip teardowns** if the stream is already `'live'`.

### ⚠️ WebRTC SDP Null-Byte Parsing Bug
* **The Bug**: The AWS KVS C/C++ SDK appends a null terminator (`\0`) to serialized JSON payloads. The browser's standard JS WebSocket parsing fails to decode these strings and throws `Unexpected token \u0000`, silently breaking WebRTC negotiations.
* **The Solution**: We implemented a WebSocket monkey-patch in the frontend (`LiveStreamViewer.jsx`):
  ```javascript
  const originalSend = signalingClient.on; // Intercept messages
  // Raw messages have their trailing null characters stripped out 
  // before being parsed by the KVS client.
  ```

### ⚠️ Camera Device Locking Conflict (Black Screen / Buffering)
* **The Bug**: CSI and USB camera devices on Linux (e.g. `/dev/video0`) only support a single open handler at a time. If the Jetson AI Inference script is running (at 30 FPS), it locks the camera. The WebRTC streamer process is then blocked, sending zero video packets. The browser establishes the WebRTC link but gets stuck on `waiting/buffering` (a black screen).
* **The Solution**: Temporarily terminate the AI process to release the camera lock, or configure a video splitter pipeline (like `v4l2loopback` or a GStreamer split-mux) to feed both processes simultaneously.

### ⚠️ Mission Planner Leaflet Rendering Loop
* **The Bug**: The Leaflet map waypoint loader was listening to `appState.missions` updates. Telemetry updates trigger updates to `appState` multiple times per second. This caused the planner to reload coordinates continuously, resulting in rapidly blinking map markers, flashing statistics, and resetting selected waypoints.
* **The Solution**: We introduced `loadedMissionIdRef` inside `AdvancedMissionPlanner.jsx`. The mission loader now verifies if the new mission ID or waypoint list is structurally different (`JSON.stringify(waypoints) !== JSON.stringify(selected.waypointsList)`) before updating the state, successfully stopping the loops.
