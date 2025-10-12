import { 
    initHandTracking, 
    getHandLandmarks,
    getPreviewCanvas,
    getLatestGestureSummary,
    isFingersTogetherActive,
    setShapeFeedback
} from './handTracking.js';

let drawingPoints = [];
let isDrawing = false;
let drawingCanvas = null;
let drawingCtx = null;
let effectsCanvas = null;
let effectsCtx = null;
let calculationPoints = [];
let lastDrawTimestamp = 0;
let lastCalculationTimestamp = 0;
let lastDrawTime = 0;
let rafHandle = null;

const DOT_INTERVAL_MS = 20;
const CALCULATION_INTERVAL_MS = 100;
const MAX_DRAW_POINTS = 6000;
const MAX_CALCULATION_POINTS = 1200;
const LINE_BREAK_THRESHOLD_MS = 400;
const CLEAR_TIMEOUT_MS = 4000;
const MIN_CIRCLE_POINTS = 10;
const MIN_CIRCLE_DIAMETER = 0.035;
const MAX_DIAMETER_REL_DEVIATION = 0.25;
const MAX_ASPECT_RATIO_DEVIATION = 0.35;
const MAX_CLOSURE_REL_DISTANCE = 0.6;
const MAX_RADIAL_REL_DEVIATION = 0.4;
const RADIAL_DEVIATION_PERCENTILE = 0.9;
const MIN_TRIANGLE_POINTS = 6;
const MIN_TRIANGLE_SIDE = 0.02;
const MIN_TRIANGLE_AREA = 0.0005;
const MAX_TRIANGLE_SIDE_RATIO = 4.0;
const MIN_TRIANGLE_CORNER_ANGLE = 0.4;
const MIN_TRIANGLE_CORNER_SEPARATION_RATIO = 0.15;
const MAX_TRIANGLE_CLOSURE_REL_DISTANCE = 0.8;
const EXPLOSION_DURATION_MS = 900;
const EXPLOSION_SPEED_MIN = 80;
const EXPLOSION_SPEED_MAX = 220;
const EXPLOSION_RADIUS_GROW = 18;

document.addEventListener('DOMContentLoaded', () => {
    drawingCanvas = document.getElementById('drawingCanvas');
    if (drawingCanvas) {
        drawingCtx = drawingCanvas.getContext('2d');
    }

    effectsCanvas = document.getElementById('effectsCanvas');
    if (effectsCanvas) {
        effectsCtx = effectsCanvas.getContext('2d');
    }

    initHandTracking({});

    startDrawingSystem();
});

let currentStrokeCalcPoints = [];
let newStrokePending = true;
let detectedShapes = [];
let activeExplosions = [];

function getDominantHand(points) {
    if (!Array.isArray(points) || points.length === 0) return null;

    const tally = points.reduce((acc, pt) => {
        if (!pt.hand) return acc;
        const key = pt.hand.toLowerCase();
        acc[key] = (acc[key] || 0) + 1;
        return acc;
    }, {});

    if (!tally.left && !tally.right) {
        const lastHand = points[points.length - 1]?.hand;
        return lastHand ? lastHand.toLowerCase() : null;
    }

    if ((tally.left || 0) > (tally.right || 0)) return 'left';
    if ((tally.right || 0) > (tally.left || 0)) return 'right';

    const lastHand = points[points.length - 1]?.hand;
    return lastHand ? lastHand.toLowerCase() : null;
}

function startDrawingSystem() {
    const loop = (timestamp) => {
        updateDrawing(timestamp);
        rafHandle = window.requestAnimationFrame(loop);
    };

    rafHandle = window.requestAnimationFrame(loop);
}

function updateDrawing(timestamp = performance.now()) {
    const landmarks = getHandLandmarks();
    const gestureSummary = getLatestGestureSummary();
    const gestureActiveFlag = isFingersTogetherActive();
    const { canvas } = getPreviewCanvas();
    
    if (!canvas || !drawingCanvas || !drawingCtx) return;

    if (drawingCanvas.width !== canvas.width || drawingCanvas.height !== canvas.height) {
        drawingCanvas.width = canvas.width;
        drawingCanvas.height = canvas.height;
        redrawDrawingCanvas();
    }

    if (effectsCanvas && (effectsCanvas.width !== canvas.width || effectsCanvas.height !== canvas.height)) {
        effectsCanvas.width = canvas.width;
        effectsCanvas.height = canvas.height;
    }

    const drawPoint = gestureActiveFlag ? getGestureDrawingPoint(landmarks, gestureSummary) : null;

    if (gestureActiveFlag && drawPoint) {
        maybeSpawnDot(drawPoint);
        maybeRecordCalculationPoint(drawPoint);
        isDrawing = true;
    } else if (isDrawing) {
        finalizeCurrentStroke('gesture-ended');
        isDrawing = false;
        lastDrawTimestamp = 0;
        lastCalculationTimestamp = 0;
        newStrokePending = true;
    }

    checkAutoClear(timestamp);
    updateExplosions(timestamp);
}

function getGestureDrawingPoint(landmarks, gestureSummary) {
    if (!Array.isArray(gestureSummary) || gestureSummary.length === 0) {
        return null;
    }

    for (const handSummary of gestureSummary) {
        if (!handSummary?.isFingersTogether) {
            continue;
        }

        const isLeft = handSummary.hand === 'left';
        const handLandmarks = isLeft ? landmarks.left : landmarks.right;

        if (!handLandmarks || handLandmarks.length < 13) {
            continue;
        }

        const indexTip = handLandmarks[8];
        const middleTip = handLandmarks[12];

        if (!indexTip || !middleTip) {
            continue;
        }

        return {
            x: (indexTip.x + middleTip.x) / 2,
            y: (indexTip.y + middleTip.y) / 2,
            z: (indexTip.z + middleTip.z) / 2,
            hand: isLeft ? 'left' : 'right'
        };
    }

    return null;
}

function maybeSpawnDot(point) {
    const now = performance.now();

    if (now - lastDrawTimestamp < DOT_INTERVAL_MS) {
        return;
    }

    lastDrawTimestamp = now;

    if (!drawingCanvas || !drawingCtx) return;

    const canvasX = (1 - point.x) * drawingCanvas.width;
    const canvasY = point.y * drawingCanvas.height;

    let prevPoint = null;
    for (let i = drawingPoints.length - 1; i >= 0; i--) {
        if (drawingPoints[i].hand === point.hand) {
            prevPoint = drawingPoints[i];
            break;
        }
    }

    let shouldConnect = false;
    if (prevPoint) {
        const gap = now - prevPoint.timestamp;
        if (gap <= LINE_BREAK_THRESHOLD_MS) {
            shouldConnect = true;
        } else {
            finalizeCurrentStroke('stroke-gap');
            newStrokePending = true;
        }
    }

    const dotPoint = {
        x: canvasX,
        y: canvasY,
        z: point.z,
        hand: point.hand,
        normalized: { x: point.x, y: point.y, z: point.z },
        timestamp: now,
        breakBefore: false
    };

    drawingPoints.push(dotPoint);
    lastDrawTime = now;

    if (drawingPoints.length > MAX_DRAW_POINTS) {
        drawingPoints = drawingPoints.slice(-MAX_DRAW_POINTS);
    }

    if (shouldConnect) {
        drawingCtx.strokeStyle = 'rgba(0, 255, 255, 0.85)';
        drawingCtx.lineWidth = 3;
        drawingCtx.lineJoin = 'round';
        drawingCtx.lineCap = 'round';
        drawingCtx.shadowColor = '#00ffff';
        drawingCtx.shadowBlur = 6;
        drawingCtx.beginPath();
        drawingCtx.moveTo(prevPoint.x, prevPoint.y);
        drawingCtx.lineTo(canvasX, canvasY);
        drawingCtx.stroke();
    } else {
        dotPoint.breakBefore = true;
    }

    drawingCtx.fillStyle = '#00ffff';
    drawingCtx.shadowColor = '#00ffff';
    drawingCtx.shadowBlur = 4;
    drawingCtx.beginPath();
    drawingCtx.arc(canvasX, canvasY, 2, 0, 2 * Math.PI);
    drawingCtx.fill();
    drawingCtx.shadowBlur = 0;

    if (drawingPoints.length % 100 === 0) {
        console.log(`📊 Spawned ${drawingPoints.length} dots`);
    }
}

function maybeRecordCalculationPoint(point) {
    const now = performance.now();

    if (now - lastCalculationTimestamp < CALCULATION_INTERVAL_MS) {
        return;
    }

    lastCalculationTimestamp = now;

    if (newStrokePending) {
        currentStrokeCalcPoints = [];
        newStrokePending = false;
    }

    currentStrokeCalcPoints.push({
        x: point.x,
        y: point.y,
        timestamp: now,
        hand: point.hand
    });

    calculationPoints.push({
        normalized: { x: point.x, y: point.y, z: point.z },
        hand: point.hand,
        timestamp: now
    });

    if (calculationPoints.length > MAX_CALCULATION_POINTS) {
        calculationPoints = calculationPoints.slice(-MAX_CALCULATION_POINTS);
    }
}

function finalizeCurrentStroke(reason = 'unknown') {
    if (currentStrokeCalcPoints.length === 0) {
        newStrokePending = true;
        return;
    }

    if (currentStrokeCalcPoints.length < MIN_CIRCLE_POINTS) {
        const strokeHandSmall = getDominantHand(currentStrokeCalcPoints);
        if (strokeHandSmall) {
            setShapeFeedback(strokeHandSmall, '', 'info');
        }
        currentStrokeCalcPoints = [];
        newStrokePending = true;
        return;
    }

    const strokeHand = getDominantHand(currentStrokeCalcPoints);
    const circleAnalysis = analyzeCircle(currentStrokeCalcPoints);

    if (circleAnalysis.isCircle) {
        const detection = {
            type: 'circle',
            detectedAt: performance.now(),
            reason,
            hand: strokeHand,
            pointCount: currentStrokeCalcPoints.length,
            ...circleAnalysis
        };
        detectedShapes.push(detection);
        console.log('⭕ Circle detected', detection);

        if (strokeHand) {
            const diameterPercent = Math.round(circleAnalysis.averageDiameter * 100);
            setShapeFeedback(
                strokeHand,
                `⭕ Circle detected! Ø ≈ ${diameterPercent}% of frame`,
                'success'
            );

            triggerStrokeExplosion(strokeHand, {
                hueBase: 178,
                hueRange: 36,
                saturation: 100,
                lightness: 60,
                shadowLightness: 72,
                alpha: 0.9,
                speedMin: EXPLOSION_SPEED_MIN,
                speedMax: EXPLOSION_SPEED_MAX,
                radiusGrow: EXPLOSION_RADIUS_GROW
            });
        }
    } else {
        const triangleAnalysis = analyzeTriangle(currentStrokeCalcPoints);

        if (triangleAnalysis.isTriangle) {
            const detection = {
                type: 'triangle',
                detectedAt: performance.now(),
                reason,
                hand: strokeHand,
                pointCount: currentStrokeCalcPoints.length,
                ...triangleAnalysis
            };
            detectedShapes.push(detection);
            console.log('🔺 Triangle detected', detection);

            if (strokeHand) {
                const sidePercent = Math.round(triangleAnalysis.averageSide * 100);
                setShapeFeedback(
                    strokeHand,
                    `🔺 Triangle detected! Sides ≈ ${sidePercent}% of frame`,
                    'success'
                );

                triggerStrokeExplosion(strokeHand, {
                    hueBase: 8,
                    hueRange: 40,
                    saturation: 92,
                    lightness: 58,
                    shadowLightness: 68,
                    alpha: 0.92,
                    speedMin: EXPLOSION_SPEED_MIN * 1.1,
                    speedMax: EXPLOSION_SPEED_MAX * 1.25,
                    radiusGrow: EXPLOSION_RADIUS_GROW * 1.15
                });
            }
        } else if (strokeHand) {
            const {
                reason: circleReason,
                averageDiameter,
                diameterDeviation,
                aspectDeviation,
                radialRelativeDeviation,
                maxRadialRelativeDeviation,
                center
            } = circleAnalysis;

            console.log('⭕ Circle check failed', {
                reason: circleReason,
                averageDiameter,
                diameterDeviation,
                aspectDeviation,
                radialRelativeDeviation,
                maxRadialRelativeDeviation,
                center
            });

            console.log('🔺 Triangle check failed', triangleAnalysis);

            setShapeFeedback(strokeHand, '', 'info');
        }
    }

    currentStrokeCalcPoints = [];
    newStrokePending = true;
}

function analyzeCircle(points) {
    if (!Array.isArray(points) || points.length < MIN_CIRCLE_POINTS) {
        return { isCircle: false, reason: 'insufficient-points' };
    }

    const total = points.length;
    const oppositeOffset = Math.floor(total / 2);

    if (oppositeOffset < 2) {
        return { isCircle: false, reason: 'insufficient-opposites' };
    }

    const samples = Math.min(total, 36);
    const diameters = [];
    const midpoints = [];

    for (let i = 0; i < samples; i++) {
        const idx1 = Math.floor((i / samples) * total);
        const idx2 = (idx1 + oppositeOffset) % total;
        if (idx1 === idx2) continue;

        const p1 = points[idx1];
        const p2 = points[idx2];
        const diameter = distance2D(p1, p2);

        diameters.push(diameter);
        midpoints.push({
            x: (p1.x + p2.x) / 2,
            y: (p1.y + p2.y) / 2
        });
    }

    if (diameters.length === 0) {
        return { isCircle: false, reason: 'diameter-sampling-failed' };
    }

    const averageDiameter = diameters.reduce((sum, d) => sum + d, 0) / diameters.length;

    if (averageDiameter < MIN_CIRCLE_DIAMETER) {
        return { isCircle: false, reason: 'diameter-too-small', averageDiameter };
    }

    const maxDeviation = Math.max(...diameters.map((d) => Math.abs(d - averageDiameter)));
    const diameterRelativeDeviation = maxDeviation / averageDiameter;

    if (diameterRelativeDeviation > MAX_DIAMETER_REL_DEVIATION) {
        return {
            isCircle: false,
            reason: 'diameter-variance',
            deviation: diameterRelativeDeviation,
            averageDiameter
        };
    }

    const center = midpoints.reduce((acc, mp) => {
        acc.x += mp.x;
        acc.y += mp.y;
        return acc;
    }, { x: 0, y: 0 });

    center.x /= midpoints.length;
    center.y /= midpoints.length;

    const radius = averageDiameter / 2;

    const radialDeviations = points.map((pt) => Math.abs(distance2D(pt, center) - radius) / radius);
    radialDeviations.sort((a, b) => a - b);

    const percentileIndex = Math.min(
        radialDeviations.length - 1,
        Math.max(0, Math.floor((radialDeviations.length - 1) * RADIAL_DEVIATION_PERCENTILE))
    );

    const radialRelativeDeviation = radialDeviations[percentileIndex];
    const maxRadialRelativeDeviation = radialDeviations[radialDeviations.length - 1];

    if (radialRelativeDeviation > MAX_RADIAL_REL_DEVIATION) {
        return {
            isCircle: false,
            reason: 'radial-variance',
            radialRelativeDeviation,
            maxRadialRelativeDeviation,
            radius
        };
    }

    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    const width = Math.max(...xs) - Math.min(...xs);
    const height = Math.max(...ys) - Math.min(...ys);
    const aspectDeviation = Math.abs(width - height) / Math.max(width, height);

    if (aspectDeviation > MAX_ASPECT_RATIO_DEVIATION) {
        return {
            isCircle: false,
            reason: 'aspect-ratio',
            aspectDeviation
        };
    }

    const closureDistance = distance2D(points[0], points[points.length - 1]);

    if (closureDistance > averageDiameter * MAX_CLOSURE_REL_DISTANCE) {
        return {
            isCircle: false,
            reason: 'not-closed',
            closureRatio: closureDistance / averageDiameter
        };
    }

    return {
        isCircle: true,
        averageDiameter,
        diameterDeviation: diameterRelativeDeviation,
        radius,
        center,
        aspectDeviation,
        radialRelativeDeviation,
        maxRadialRelativeDeviation
    };
}

function analyzeTriangle(points) {
    if (!Array.isArray(points) || points.length < MIN_TRIANGLE_POINTS) {
        return { isTriangle: false, reason: 'insufficient-points' };
    }

    const pathLength = computePathLength(points);
    if (!isFinite(pathLength) || pathLength <= 0) {
        return { isTriangle: false, reason: 'sides-too-short' };
    }

    const start = points[0];
    const end = points[points.length - 1];
    const closureDistance = distance2D(start, end);
    const averageCandidateSide = pathLength / 3;

    if (averageCandidateSide <= 0) {
        return { isTriangle: false, reason: 'sides-too-short' };
    }

    if (closureDistance > averageCandidateSide * MAX_TRIANGLE_CLOSURE_REL_DISTANCE) {
        return {
            isTriangle: false,
            reason: 'triangle-not-closed',
            closureRatio: closureDistance / averageCandidateSide
        };
    }

    const minSeparation = Math.max(2, Math.floor(points.length * MIN_TRIANGLE_CORNER_SEPARATION_RATIO));
    const candidateCorners = [];
    const lookAhead = Math.max(3, Math.floor(points.length * 0.05));

    for (let i = lookAhead; i < points.length - lookAhead; i++) {
        const prev = points[i - lookAhead];
        const curr = points[i];
        const next = points[i + lookAhead];

        const v1x = curr.x - prev.x;
        const v1y = curr.y - prev.y;
        const v2x = next.x - curr.x;
        const v2y = next.y - curr.y;

        const len1 = Math.hypot(v1x, v1y);
        const len2 = Math.hypot(v2x, v2y);
        if (len1 < 1e-4 || len2 < 1e-4) {
            continue;
        }

        const dot = clamp((v1x * v2x + v1y * v2y) / (len1 * len2), -1, 1);
        const turnAngle = Math.acos(dot);

        if (turnAngle < MIN_TRIANGLE_CORNER_ANGLE) {
            continue;
        }

        if (candidateCorners.length === 0) {
            candidateCorners.push({ index: i, angle: turnAngle });
            continue;
        }

        const lastCorner = candidateCorners[candidateCorners.length - 1];
        if (i - lastCorner.index < minSeparation) {
            if (turnAngle > lastCorner.angle) {
                lastCorner.index = i;
                lastCorner.angle = turnAngle;
            }
        } else {
            candidateCorners.push({ index: i, angle: turnAngle });
        }
    }

    if (candidateCorners.length < 3) {
        return { isTriangle: false, reason: 'corner-count', cornerCount: candidateCorners.length };
    }

    const selectedCorners = selectTriangleCorners(candidateCorners, points.length, minSeparation);

    if (selectedCorners.length !== 3) {
        return {
            isTriangle: false,
            reason: 'corner-spacing',
            cornerCount: candidateCorners.length
        };
    }

    selectedCorners.sort((a, b) => a.index - b.index);
    const cornerPoints = selectedCorners.map((corner) => points[corner.index]);

    const sideLengths = [
        distance2D(cornerPoints[0], cornerPoints[1]),
        distance2D(cornerPoints[1], cornerPoints[2]),
        distance2D(cornerPoints[2], cornerPoints[0])
    ];

    const minSide = Math.min(...sideLengths);
    const maxSide = Math.max(...sideLengths);

    if (!isFinite(minSide) || minSide <= 0) {
        return { isTriangle: false, reason: 'sides-too-short' };
    }

    if (minSide < MIN_TRIANGLE_SIDE) {
        return { isTriangle: false, reason: 'sides-too-short', minSide };
    }

    if (maxSide / minSide > MAX_TRIANGLE_SIDE_RATIO) {
        return {
            isTriangle: false,
            reason: 'side-length-variance',
            minSide,
            maxSide
        };
    }

    const area = polygonArea(cornerPoints);

    if (!isFinite(area) || area < MIN_TRIANGLE_AREA) {
        return {
            isTriangle: false,
            reason: 'area-too-small',
            area
        };
    }

    const cornerAngles = selectedCorners.map((corner) => corner.angle);

    return {
        isTriangle: true,
        corners: cornerPoints,
        cornerIndices: selectedCorners.map((corner) => corner.index),
        cornerAngles,
        sideLengths,
        averageSide: (sideLengths[0] + sideLengths[1] + sideLengths[2]) / 3,
        area,
        closureRatio: closureDistance / averageCandidateSide
    };
}

function selectTriangleCorners(candidates, totalPoints, minSeparation) {
    if (!Array.isArray(candidates) || candidates.length === 0) return [];

    const sorted = [...candidates].sort((a, b) => b.angle - a.angle);
    const chosen = [];

    for (const corner of sorted) {
        const tooClose = chosen.some((existing) =>
            cyclicIndexDistance(existing.index, corner.index, totalPoints) < minSeparation
        );

        if (tooClose) {
            continue;
        }

        chosen.push({ ...corner });
        if (chosen.length === 3) {
            break;
        }
    }

    if (chosen.length < 3) {
        return [];
    }

    return chosen;
}

function cyclicIndexDistance(a, b, total) {
    const diff = Math.abs(a - b);
    return Math.min(diff, total - diff);
}

function computePathLength(points) {
    let length = 0;
    for (let i = 1; i < points.length; i++) {
        length += distance2D(points[i - 1], points[i]);
    }
    return length;
}

function polygonArea(points) {
    let area = 0;
    for (let i = 0; i < points.length; i++) {
        const j = (i + 1) % points.length;
        area += points[i].x * points[j].y - points[j].x * points[i].y;
    }
    return Math.abs(area) / 2;
}

function getLastStrokeDrawingPoints(hand) {
    if (!hand) return [];

    const stroke = [];
    let collecting = false;

    for (let i = drawingPoints.length - 1; i >= 0; i--) {
        const dot = drawingPoints[i];

        if (dot.hand !== hand) {
            if (collecting) break;
            continue;
        }

        collecting = true;
        stroke.unshift(dot);

        if (dot.breakBefore) {
            break;
        }
    }

    return stroke;
}

function removeStrokePointsAndRedraw(strokePoints) {
    if (!Array.isArray(strokePoints) || strokePoints.length === 0) return;

    const removalSet = new Set(strokePoints);
    if (removalSet.size === 0) return;

    drawingPoints = drawingPoints.filter((pt) => !removalSet.has(pt));
    redrawDrawingCanvas();
}

function redrawDrawingCanvas() {
    if (!drawingCtx || !drawingCanvas) return;

    drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);

    const lastPointByHand = {};

    for (const point of drawingPoints) {
        const prev = lastPointByHand[point.hand];
        const shouldConnect = prev && !point.breakBefore;

        if (shouldConnect) {
            drawingCtx.strokeStyle = 'rgba(0, 255, 255, 0.85)';
            drawingCtx.lineWidth = 3;
            drawingCtx.lineJoin = 'round';
            drawingCtx.lineCap = 'round';
            drawingCtx.shadowColor = '#00ffff';
            drawingCtx.shadowBlur = 6;
            drawingCtx.beginPath();
            drawingCtx.moveTo(prev.x, prev.y);
            drawingCtx.lineTo(point.x, point.y);
            drawingCtx.stroke();
        }

        drawingCtx.fillStyle = '#00ffff';
        drawingCtx.shadowColor = '#00ffff';
        drawingCtx.shadowBlur = 4;
        drawingCtx.beginPath();
        drawingCtx.arc(point.x, point.y, 2, 0, 2 * Math.PI);
        drawingCtx.fill();

        lastPointByHand[point.hand] = point;
    }

    drawingCtx.shadowBlur = 0;
}

function triggerStrokeExplosion(hand, options = {}) {
    if (!effectsCanvas || !effectsCtx) return;

    const strokePoints = getLastStrokeDrawingPoints(hand);
    if (strokePoints.length === 0) return;

    const {
        hueBase = 178,
        hueRange = 30,
        saturation = 100,
        lightness = 60,
        shadowLightness = 70,
        alpha = 0.9,
        speedMin = EXPLOSION_SPEED_MIN,
        speedMax = EXPLOSION_SPEED_MAX,
        radiusGrow = EXPLOSION_RADIUS_GROW,
        duration = EXPLOSION_DURATION_MS
    } = options;

    const particles = strokePoints.map((point) => {
        const angle = Math.random() * Math.PI * 2;
        const speed = speedMin + Math.random() * Math.max(0, speedMax - speedMin);
        const growth = radiusGrow * (0.6 + Math.random() * 0.6);
        const baseRadius = 2 + Math.random() * 2.5;
        const hue = hueBase + (Math.random() - 0.5) * hueRange;
        return {
            x: point.x,
            y: point.y,
            dx: Math.cos(angle) * speed,
            dy: Math.sin(angle) * speed,
            baseRadius,
            growth,
            hue,
            saturation,
            lightness,
            shadowLightness,
            alpha
        };
    });

    if (particles.length === 0) return;

    activeExplosions.push({
        startTime: performance.now(),
        duration,
        particles
    });

    removeStrokePointsAndRedraw(strokePoints);
}

function updateExplosions(timestamp = performance.now()) {
    if (!effectsCtx || !effectsCanvas) return;

    if (activeExplosions.length === 0) {
        effectsCtx.clearRect(0, 0, effectsCanvas.width, effectsCanvas.height);
        return;
    }

    effectsCtx.clearRect(0, 0, effectsCanvas.width, effectsCanvas.height);

    const now = timestamp;
    activeExplosions = activeExplosions.filter((explosion) => {
        const progress = (now - explosion.startTime) / explosion.duration;

        if (progress >= 1) {
            return false;
        }

        const eased = easeOutCubic(progress);
        const fade = Math.max(0, 1 - progress);

        for (const particle of explosion.particles) {
            const px = particle.x + particle.dx * eased;
            const py = particle.y + particle.dy * eased;
            const radius = particle.baseRadius + particle.growth * eased;
            const { hue, saturation, lightness, shadowLightness, alpha } = particle;

            effectsCtx.save();
            effectsCtx.globalAlpha = fade * alpha;
            effectsCtx.fillStyle = `hsla(${hue}, ${saturation}%, ${lightness}%, 1)`;
            effectsCtx.shadowColor = `hsla(${hue}, ${saturation}%, ${shadowLightness}%, 1)`;
            effectsCtx.shadowBlur = 14 * (1 - progress) + 6;
            effectsCtx.beginPath();
            effectsCtx.arc(px, py, radius, 0, Math.PI * 2);
            effectsCtx.fill();
            effectsCtx.restore();
        }

        return true;
    });
}

function easeOutCubic(t) {
    const clamped = Math.min(1, Math.max(0, t));
    return 1 - Math.pow(1 - clamped, 3);
}

function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
}

function distance2D(a, b) {
    const dx = (a.x ?? 0) - (b.x ?? 0);
    const dy = (a.y ?? 0) - (b.y ?? 0);
    return Math.sqrt(dx * dx + dy * dy);
}

function checkAutoClear(currentTime = performance.now()) {
    if (drawingPoints.length === 0) return;
    if (lastDrawTime === 0) return;

    if (currentTime - lastDrawTime >= CLEAR_TIMEOUT_MS) {
        finalizeCurrentStroke('timeout');
        clearDrawingInternal('timeout');
    }
}

function clearDrawingInternal(reason = 'manual') {
    drawingPoints = [];
    calculationPoints = [];
    lastDrawTimestamp = 0;
    lastCalculationTimestamp = 0;
    lastDrawTime = 0;
    isDrawing = false;
    currentStrokeCalcPoints = [];
    newStrokePending = true;

    if (drawingCtx && drawingCanvas) {
        drawingCtx.clearRect(0, 0, drawingCanvas.width, drawingCanvas.height);
    }

    setShapeFeedback('left', '', 'info');
    setShapeFeedback('right', '', 'info');

    if (reason === 'timeout') {
        console.log('🧹 Drawing cleared after 10s of inactivity');
    } else {
        console.log('Drawing cleared');
    }
}

window.getDrawingPoints = () => [...drawingPoints];
window.getCalculationPoints = () => [...calculationPoints];
window.getGestureActive = () => isFingersTogetherActive();
window.clearDrawing = () => {
    finalizeCurrentStroke('manual-clear');
    clearDrawingInternal('manual');
};
window.getDetectedShapes = () => [...detectedShapes];
window.exportDrawing = () => {
    const data = {
        points: drawingPoints,
        calculationPoints,
        totalPoints: drawingPoints.length,
        totalCalculationPoints: calculationPoints.length,
    detectedShapes: [...detectedShapes],
        duration: drawingPoints.length > 0 
            ? drawingPoints[drawingPoints.length - 1].timestamp - drawingPoints[0].timestamp 
            : 0
    };
    console.log('Drawing data:', data);
    return data;
};
