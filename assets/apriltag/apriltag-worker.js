'use strict';

importScripts('apriltag_wasm.js');

let detectorPromise;

function loadDetector() {
    if (detectorPromise) {
        return detectorPromise;
    }

    detectorPromise = AprilTagWasm().then(Module => {
        const initialize = Module.cwrap('atagjs_init', 'number', []);
        const setDetectorOptions = Module.cwrap(
            'atagjs_set_detector_options',
            'number',
            ['number', 'number', 'number', 'number', 'number', 'number', 'number']
        );
        const setImageBuffer = Module.cwrap(
            'atagjs_set_img_buffer',
            'number',
            ['number', 'number', 'number']
        );
        const detect = Module.cwrap('atagjs_detect', 'number', []);

        initialize();
        setDetectorOptions(
            1.5, // Preserve small tags while keeping mobile detection responsive.
            0,
            1,
            1,
            1,
            0,
            0
        );

        return { Module, setImageBuffer, detect };
    });

    return detectorPromise;
}

async function detectAprilTag(pixelBuffer, width, height) {
    const detector = await loadDetector();
    const pixels = new Uint8Array(pixelBuffer);
    const expectedLength = width * height;

    if (!Number.isInteger(width) || !Number.isInteger(height) || expectedLength <= 0) {
        throw new Error('Invalid image dimensions.');
    }
    if (pixels.length !== expectedLength) {
        throw new Error('Grayscale image size does not match its dimensions.');
    }

    const imagePointer = detector.setImageBuffer(width, height, width);
    detector.Module.HEAPU8.set(pixels, imagePointer);

    const resultPointer = detector.detect();
    if (!resultPointer) {
        return [];
    }

    const jsonLength = detector.Module.getValue(resultPointer, 'i32');
    if (!jsonLength) {
        return [];
    }

    const jsonPointer = detector.Module.getValue(resultPointer + 4, 'i32');
    const jsonBytes = new Uint8Array(detector.Module.HEAPU8.buffer, jsonPointer, jsonLength);
    return JSON.parse(new TextDecoder().decode(jsonBytes));
}

self.addEventListener('message', async event => {
    if (event.data?.type !== 'detect') {
        return;
    }

    const requestId = event.data.requestId;
    try {
        const detections = await detectAprilTag(
            event.data.pixelBuffer,
            Number(event.data.width),
            Number(event.data.height)
        );
        self.postMessage({ type: 'result', requestId, detections });
    } catch (error) {
        self.postMessage({
            type: 'result',
            requestId,
            detections: [],
            error: error?.message || String(error)
        });
    }
});

loadDetector()
    .then(() => self.postMessage({ type: 'ready' }))
    .catch(error => self.postMessage({
        type: 'ready',
        error: error?.message || String(error)
    }));
