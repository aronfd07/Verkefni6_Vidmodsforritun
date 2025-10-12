// Þessi skrá inniheldur aðalega kóða úr verkefni 5 sem að ég er að endurnýta fyrir handapat
// en ég gerði gesture detection'ið relative frekar en að vera tengt við glugga hnitin.

let handsInstance = null;
let cameraInput = null;

let videoElement = null;
let previewCanvas = null;
let previewCtx = null;

let gestureSummaryCallback = null;

const handsDetected = { left: false, right: false };
const handLandmarks = { left: null, right: null };
let latestGestureSummary = [];
let fingersTogetherActive = false;

export function initHandTracking({ onGestureSummaryChange } = {}) {
    gestureSummaryCallback = typeof onGestureSummaryChange === 'function' ? onGestureSummaryChange : null;
    initMediaPipe();
}

export function getLatestGestureSummary() {
    return latestGestureSummary.map((entry) => ({
        hand: entry.hand,
        fingerStatus: { ...entry.fingerStatus },
        areTouching: entry.areTouching ? {
            touching: entry.areTouching.touching,
            touchingAt: { ...entry.areTouching.touchingAt },
            distances: { ...entry.areTouching.distances }
        } : null,
        isFingersTogether: entry.isFingersTogether ?? false,
        baseGesture: entry.baseGesture ?? false
    }));
}

export function isFingersTogetherActive() {
    return fingersTogetherActive;
}

export function setShapeFeedback(hand, message = '', tone = 'info') {
    if (!hand) return;
    const validHand = hand.toLowerCase();
    const elements = document.querySelectorAll(`.shape-feedback[data-hand="${validHand}"]`);

    elements.forEach((el) => {
        el.classList.remove('shape-success', 'shape-warning', 'shape-info', 'shape-flash');

        if (!message) {
            el.textContent = '';
            el.style.display = 'none';
            return;
        }

        el.textContent = message;
        el.style.display = 'block';

        switch (tone) {
            case 'success':
                el.classList.add('shape-success');
                break;
            case 'warning':
                el.classList.add('shape-warning');
                break;
            default:
                el.classList.add('shape-info');
        }

        void el.offsetWidth;
        el.classList.add('shape-flash');
    });
}

export function getHandLandmarks() {
    return {
        left: handLandmarks.left ? [...handLandmarks.left] : null,
        right: handLandmarks.right ? [...handLandmarks.right] : null
    };
}

export function getPreviewCanvas() {
    return { canvas: previewCanvas, ctx: previewCtx };
}

export { drawDotsAtPoints, landmarkToCanvasCoords };

function initMediaPipe() {
    videoElement = document.getElementById('input_video');
    previewCanvas = document.getElementById('output_canvas');

    if (!videoElement || !previewCanvas) {
        console.warn('Hand tracking elements not found in the DOM.');
        return;
    }

    previewCtx = previewCanvas.getContext('2d');

    if (handsInstance) {
        return;
    }

    handsInstance = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    handsInstance.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5
    });

    handsInstance.onResults(onResults);

    cameraInput = new Camera(videoElement, {
        onFrame: async () => {
            await handsInstance.send({ image: videoElement });
        },
        width: 640,
        height: 480
    });

    cameraInput.start();
}

function onResults(results) {
    if (!videoElement || videoElement.videoWidth === 0 || videoElement.videoHeight === 0) {
        return;
    }

    if (previewCanvas && previewCtx) {
        previewCanvas.width = videoElement.videoWidth;
        previewCanvas.height = videoElement.videoHeight;
        previewCtx.save();
        previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    }

    resetHandState();

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i].label;

            if (previewCtx) {
                drawLandmarks(previewCtx, landmarks, handedness);
            }

            if (handedness === 'Left') {
                handsDetected.right = true;
                handLandmarks.right = landmarks;
            } else if (handedness === 'Right') {
                handsDetected.left = true;
                handLandmarks.left = landmarks;
            }
        }

        updateHandStatus(true);
        updateFingerStates();
    } else {
        updateHandStatus(false);
        resetFingerStates();
    }

    if (previewCtx) {
        previewCtx.restore();
    }
}

function resetHandState() {
    handsDetected.left = false;
    handsDetected.right = false;
    handLandmarks.left = null;
    handLandmarks.right = null;
}

function landmarkToCanvasCoords(landmark, viewport, ctx) {
    const width = viewport ? viewport.width : ctx.canvas.width;
    const height = viewport ? viewport.height : ctx.canvas.height;
    const offsetX = viewport ? viewport.left : 0;
    const offsetY = viewport ? viewport.top : 0;
    const mirror = viewport ? viewport.mirror : false;

    const x = offsetX + (mirror ? (1 - landmark.x) * width : landmark.x * width);
    const y = offsetY + landmark.y * height;

    return { x, y };
}

function drawDotsAtPoints(ctx, landmarks, pointIndices, viewport = null, color = '#ff0088', radius = 8) {
    const width = viewport ? viewport.width : ctx.canvas.width;
    const baseRadius = viewport ? Math.max(4, Math.min(12, width * 0.01)) : radius;

    pointIndices.forEach((index) => {
        if (index >= 0 && index < landmarks.length) {
            const landmark = landmarks[index];
            const { x, y } = landmarkToCanvasCoords(landmark, viewport, ctx);

            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, y, baseRadius, 0, 2 * Math.PI);
            ctx.fill();

            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
    });
}

function drawLandmarks(ctx, landmarks, handedness = 'Right', viewport = null) {
    const color = handedness === 'Left' ? '#ff8800' : '#00ff88';
    const width = viewport ? viewport.width : ctx.canvas.width;
    const pointRadius = viewport ? Math.max(3, Math.min(10, width * 0.008)) : 4;

    landmarks.forEach((landmark, index) => {
        const { x, y } = landmarkToCanvasCoords(landmark, viewport, ctx);

        const isFingertip = [4, 8, 12, 16, 20].includes(index);
        ctx.fillStyle = isFingertip ? '#ff0088' : color;
        
        ctx.beginPath();
        ctx.arc(x, y, isFingertip ? pointRadius * 1.5 : pointRadius, 0, 2 * Math.PI);
        ctx.fill();
    });
}

function updateFingerStates() {
    const summary = [];
    let anyFingersTogether = false;

    if (handsDetected.left && handLandmarks.left) {
        const fingerStatus = getFingerStates(handLandmarks.left);
        const areTouching = checkFingersTouching(handLandmarks.left);
        const baseGesture = !fingerStatus.thumb && fingerStatus.index && fingerStatus.middle && !fingerStatus.ring && !fingerStatus.pinky;
        const isFingersTogether = baseGesture && areTouching.touching;

        if (isFingersTogether) {
            anyFingersTogether = true;
        }

        summary.push({ hand: 'left', fingerStatus, areTouching, isFingersTogether, baseGesture });
    }

    if (handsDetected.right && handLandmarks.right) {
        const fingerStatus = getFingerStates(handLandmarks.right);
        const areTouching = checkFingersTouching(handLandmarks.right);
        const baseGesture = !fingerStatus.thumb && fingerStatus.index && fingerStatus.middle && !fingerStatus.ring && !fingerStatus.pinky;
        const isFingersTogether = baseGesture && areTouching.touching;

        if (isFingersTogether) {
            anyFingersTogether = true;
        }

        summary.push({ hand: 'right', fingerStatus, areTouching, isFingersTogether, baseGesture });
    }

    latestGestureSummary = summary;
    fingersTogetherActive = anyFingersTogether;
    notifyGestureSummaryChange();
}

function resetFingerStates() {
    latestGestureSummary = [];
    fingersTogetherActive = false;
    notifyGestureSummaryChange();
}

function checkFingersTouching(landmarks) {
    if (!landmarks || landmarks.length < 21) return { touching: false, distances: {} };

    function distance3D(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = (p1.z ?? 0) - (p2.z ?? 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    const distances = {
        tip: distance3D(landmarks[8], landmarks[12]), 
        dip: distance3D(landmarks[7], landmarks[11]), 
        pip: distance3D(landmarks[6], landmarks[10]), 
        mcp: distance3D(landmarks[5], landmarks[9])   
    };

    
    const thresholds = {
        tip: 0.05,
        dip: 0.04,   
        pip: 0.04,   
        mcp: 0.06    
    };

    
    const touchingAt = {
        tip: distances.tip < thresholds.tip,
        dip: distances.dip < thresholds.dip,
        pip: distances.pip < thresholds.pip,
        mcp: distances.mcp < thresholds.mcp
    };

    const touchCount = Object.values(touchingAt).filter(Boolean).length;
    const touching = touchCount >= 3;

    return { touching, touchingAt, distances };
}

function updateHandStatus(detected) {
    const handCount = (handsDetected.left ? 1 : 0) + (handsDetected.right ? 1 : 0);

    const indicator = document.getElementById('statusIndicator');
    if (indicator) {
        indicator.classList.toggle('active', detected);
    }

    const textElement = document.getElementById('statusText');
    if (textElement) {
        textElement.textContent = detected
            ? `${handCount} hönd${handCount !== 1 ? 'ur' : ''} greind${handCount !== 1 ? 'ar' : ''}`
            : 'Engar hendur greindar';
    }
}

function notifyGestureSummaryChange() {
    if (!gestureSummaryCallback) return;
    const summaryClone = latestGestureSummary.map((entry) => ({
        hand: entry.hand,
        fingerStatus: { ...entry.fingerStatus },
        areTouching: entry.areTouching ? {
            touching: entry.areTouching.touching,
            touchingAt: { ...entry.areTouching.touchingAt },
            distances: { ...entry.areTouching.distances }
        } : null,
        isFingersTogether: entry.isFingersTogether ?? false,
        baseGesture: entry.baseGesture ?? false
    }));
    gestureSummaryCallback(summaryClone);
}

function getFingerStates(landmarks) {
    if (!landmarks || landmarks.length < 21) return {};

    function normalize(v) {
        const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
        if (len === 0) {
            return { x: 0, y: 0, z: 0 };
        }
        return { x: v.x / len, y: v.y / len, z: v.z / len };
    }

    function cross(a, b) {
        return {
            x: a.y * b.z - a.z * b.y,
            y: a.z * b.x - a.x * b.z,
            z: a.x * b.y - a.y * b.x
        };
    }

    function distance3D(p1, p2) {
        const dx = p1.x - p2.x;
        const dy = p1.y - p2.y;
        const dz = (p1.z ?? 0) - (p2.z ?? 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    function createHandCoordinateSystem(points) {
        const wrist = points[0];
        const indexMCP = points[5];
        const middleMCP = points[9];
        const ringMCP = points[13];
        const pinkyMCP = points[17];

        const palmCenter = {
            x: (indexMCP.x + middleMCP.x + ringMCP.x + pinkyMCP.x) / 4,
            y: (indexMCP.y + middleMCP.y + ringMCP.y + pinkyMCP.y) / 4,
            z: (indexMCP.z + middleMCP.z + ringMCP.z + pinkyMCP.z) / 4
        };

        const xAxis = normalize({
            x: pinkyMCP.x - indexMCP.x,
            y: pinkyMCP.y - indexMCP.y,
            z: pinkyMCP.z - indexMCP.z
        });

        const yAxis = normalize({
            x: wrist.x - palmCenter.x,
            y: wrist.y - palmCenter.y,
            z: wrist.z - palmCenter.z
        });

        const zAxis = normalize(cross(xAxis, yAxis));
        const yFixed = normalize(cross(zAxis, xAxis));

        const handScale = Math.max(distance3D(palmCenter, middleMCP), 0.001);

        return { palmCenter, xAxis, yAxis: yFixed, zAxis, handScale };
    }

    function toHandRelative(point, handSystem) {
        const v = {
            x: point.x - handSystem.palmCenter.x,
            y: point.y - handSystem.palmCenter.y,
            z: point.z - handSystem.palmCenter.z
        };

        return {
            x: v.x * handSystem.xAxis.x + v.y * handSystem.xAxis.y + v.z * handSystem.xAxis.z,
            y: v.x * handSystem.yAxis.x + v.y * handSystem.yAxis.y + v.z * handSystem.yAxis.z,
            z: v.x * handSystem.zAxis.x + v.y * handSystem.zAxis.y + v.z * handSystem.zAxis.z
        };
    }

    function angleBetween(a, b) {
        const dot = a.x * b.x + a.y * b.y + a.z * b.z;
        const magA = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
        const magB = Math.sqrt(b.x * b.x + b.y * b.y + b.z * b.z);
        if (magA === 0 || magB === 0) return 0;
        const cos = Math.max(-1, Math.min(1, dot / (magA * magB)));
        return Math.acos(cos) * (180 / Math.PI);
    }

    function vector(from, to) {
        return {
            x: to.x - from.x,
            y: to.y - from.y,
            z: (to.z ?? 0) - (from.z ?? 0)
        };
    }

    function isFingerExtended(tip, dip, pip, mcp, handSystem) {
        const pipAngle = angleBetween(vector(pip, mcp), vector(pip, dip));
        const dipAngle = angleBetween(vector(dip, pip), vector(dip, tip));

        const tipDistance = distance3D(tip, handSystem.palmCenter);
        const mcpDistance = distance3D(mcp, handSystem.palmCenter);
        const extension = (tipDistance - mcpDistance) / handSystem.handScale;

        return pipAngle > 160 && dipAngle > 160 && extension > 0.2;
    }

    function isThumbExtended(tip, ip, mp, cmc, handSystem) {
        const mcpAngle = angleBetween(vector(mp, cmc), vector(mp, ip));
        const ipAngle = angleBetween(vector(ip, mp), vector(ip, tip));

        const tipDistance = distance3D(tip, handSystem.palmCenter);
        const mcpDistance = distance3D(mp, handSystem.palmCenter);
        const extension = (tipDistance - mcpDistance) / handSystem.handScale;

        const tipRelative = toHandRelative(tip, handSystem);
        const lateral = Math.abs(tipRelative.x);

        return mcpAngle > 150 && ipAngle > 150 && (extension > 0.15 || lateral > 0.25);
    }

    const handSystem = createHandCoordinateSystem(landmarks);

    return {
        thumb: isThumbExtended(landmarks[4], landmarks[3], landmarks[2], landmarks[1], handSystem),
        index: isFingerExtended(landmarks[8], landmarks[7], landmarks[6], landmarks[5], handSystem),
        middle: isFingerExtended(landmarks[12], landmarks[11], landmarks[10], landmarks[9], handSystem),
        ring: isFingerExtended(landmarks[16], landmarks[15], landmarks[14], landmarks[13], handSystem),
        pinky: isFingerExtended(landmarks[20], landmarks[19], landmarks[18], landmarks[17], handSystem)
    };
}
