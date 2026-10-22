/**
 * Game of Life with a finite board. Typed-array buffers separate the current generation from the next; live cells share instanced geometry.
 */
import * as THREE from 'three';
import { OrbitControls } from '../../Lib/Three/OrbitControls.js';

// Conway's rules on a finite board: cells outside the grid are dead.
/**
 * Apply Conway rules to the input buffer without mutating it; outside cells count as dead.
 *
 * @param current - Read-only cell buffer for the current generation.
 * @param next - Writable cell buffer that receives the next generation without modifying current.
 * @param size - Number of rows and columns in the square cellular board.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function nextGeneration(current, next, size) {
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            let neighbors = 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = x + dx;
                    const ny = y + dy;
                    if (nx >= 0 && nx < size && ny >= 0 && ny < size) {
                        neighbors += current[ny * size + nx];
                    }
                }
            }
            const index = y * size + x;
            next[index] = Number(neighbors === 3 || (current[index] === 1 && neighbors === 2));
        }
    }
}

const container = document.getElementById('scene-container');
const panel = document.querySelector('.scene-info');
panel.innerHTML = `
    <h1>Game of Life V2</h1>
    <p>Build patterns. Watch them evolve.</p>
    <label for="life-speed">Speed <output id="speed-value">8 generations/s</output></label>
    <input id="life-speed" type="range" min="1" max="30" value="8">
    <label for="life-size">Grid size</label>
    <select id="life-size" class="custom-select custom-select-sm">
        <option value="20">20 × 20</option>
        <option value="40" selected>40 × 40</option>
        <option value="60">60 × 60</option>
        <option value="80">80 × 80</option>
        <option value="100">100 × 100</option>
    </select>
    <small>Changing grid size starts a new random board.</small>
    <div class="life-actions">
        <button id="life-play" class="btn btn-sm btn-success" type="button" aria-pressed="true">Pause</button>
        <button id="life-step" class="btn btn-sm btn-outline-light" type="button">Step</button>
        <button id="life-random" class="btn btn-sm btn-outline-light" type="button">Randomize</button>
        <button id="life-clear" class="btn btn-sm btn-outline-light" type="button">Clear</button>
    </div>
    <p class="life-stats">Generation: <output id="life-generation">0</output> · Alive: <output id="life-alive">0</output></p>
    <small>Space to play / pause.<br>Click a cell to toggle it and pause.<br>Drag to orbit · Scroll to zoom<br>Edges are fixed; outside cells are dead.</small>`;
const playButton = document.getElementById('life-play');
const generationOutput = document.getElementById('life-generation');
const aliveOutput = document.getElementById('life-alive');
let size = 40;
let speed = 8;
let running = true;
let generation = 0;
let accumulator = 0;
let cells;
let buffer;
let grid;
let instances;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1220);
const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000);
let renderer;
try {
    renderer = new THREE.WebGLRenderer({ antialias: true });
} catch (error) {
    const message = document.getElementById('scene-error');
    message.hidden = false;
    message.textContent = 'Unable to start the scene. Please enable WebGL in your browser.';
    throw error;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.domElement.setAttribute('aria-label', 'Interactive Game of Life grid');
container.appendChild(renderer.domElement);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxPolarAngle = Math.PI * 0.48;
controls.minDistance = 5;
controls.maxDistance = 400;
scene.add(new THREE.HemisphereLight(0xffffff, 0x263348, 2));
const sunlight = new THREE.DirectionalLight(0xffffff, 2);
sunlight.position.set(10, 40, 20);
scene.add(sunlight);
const geometry = new THREE.BoxGeometry(0.88, 0.3, 0.88);
const material = new THREE.MeshStandardMaterial({ color: 0x64e4b8, roughness: 0.55 });
const dummy = new THREE.Object3D();

/**
 * Pack live cells into the instance buffer and refresh population statistics.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function drawCells() {
    let alive = 0;
    for (let i = 0; i < cells.length; i++) {
        if (!cells[i]) continue;
        dummy.position.set(i % size - size / 2 + 0.5, 0.15, Math.floor(i / size) - size / 2 + 0.5);
        dummy.updateMatrix();
        instances.setMatrixAt(alive++, dummy.matrix);
    }
    instances.count = alive;
    instances.instanceMatrix.needsUpdate = true;
    generationOutput.value = generation;
    aliveOutput.value = alive;
}

/**
 * Seed a new board at the chosen density and reset the generation counter.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function randomize() {
    for (let i = 0; i < cells.length; i++) cells[i] = Number(Math.random() < 0.28);
    generation = 0;
    accumulator = 0;
    drawCells();
}

/**
 * Dispose old grid resources, allocate fresh buffers, and reset the view.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function rebuild() {
    if (grid) {
        scene.remove(grid);
        grid.geometry.dispose();
        grid.material.dispose();
        scene.remove(instances);
        instances.dispose();
    }
    cells = new Uint8Array(size * size);
    buffer = new Uint8Array(size * size);
    grid = new THREE.GridHelper(size, size, 0x547486, 0x24374a);
    scene.add(grid);
    instances = new THREE.InstancedMesh(geometry, material, size * size);
    instances.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instances.frustumCulled = false;
    scene.add(instances);
    controls.target.set(0, 0, 0);
    camera.position.set(0, size * 1.1, size * 0.65);
    camera.lookAt(controls.target);
    randomize();
}

/**
 * Compute one generation and swap the input/output buffers instead of copying the board.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function step() {
    nextGeneration(cells, buffer, size);
    [cells, buffer] = [buffer, cells];
    generation++;
    drawCells();
}

/**
 * Change playback state and reset accumulated time to avoid a catch-up burst.
 *
 * @param value - True to run automatic generations; false to pause.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function setRunning(value) {
    running = value;
    accumulator = 0;
    playButton.textContent = running ? 'Pause' : 'Play';
    playButton.setAttribute('aria-pressed', String(running));
}
playButton.addEventListener('click', () => setRunning(!running));
document.addEventListener('keydown', (event) => {
    if (event.code !== 'Space' || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    // Let form controls and editable text retain their native Space behavior.
    if (target instanceof Element && (target.closest('input, select, textarea, button, a, [role="button"]') || target.isContentEditable)) return;
    event.preventDefault();
    if (!event.repeat) setRunning(!running);
});
document.getElementById('life-step').addEventListener('click', () => { setRunning(false); step(); });
document.getElementById('life-random').addEventListener('click', randomize);
document.getElementById('life-clear').addEventListener('click', () => {
    setRunning(false);
    cells.fill(0);
    generation = 0;
    drawCells();
});
document.getElementById('life-speed').addEventListener('input', (event) => {
    speed = Number(event.target.value);
    accumulator = 0;
    document.getElementById('speed-value').value = `${speed} generations/s`;
});
document.getElementById('life-size').addEventListener('change', (event) => {
    size = Number(event.target.value);
    rebuild();
});

// Intersect the board plane so dead cells can be selected as well as live cells.
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const hit = new THREE.Vector3();
let pointerStart;
renderer.domElement.addEventListener('pointerdown', (event) => {
    pointerStart = event.isPrimary && event.button === 0 ? { x: event.clientX, y: event.clientY, id: event.pointerId } : null;
});
renderer.domElement.addEventListener('pointercancel', () => { pointerStart = null; });
renderer.domElement.addEventListener('pointerup', (event) => {
    const start = pointerStart;
    pointerStart = null;
    if (!start || start.id !== event.pointerId || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.set((event.clientX - rect.left) / rect.width * 2 - 1, -(event.clientY - rect.top) / rect.height * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    if (!raycaster.ray.intersectPlane(plane, hit)) return;
    const x = Math.floor(hit.x + size / 2);
    const y = Math.floor(hit.z + size / 2);
    if (x < 0 || y < 0 || x >= size || y >= size) return;
    setRunning(false);
    cells[y * size + x] ^= 1;
    drawCells();
});

/**
 * Synchronize renderer dimensions and camera projection with the available container size.
 *
 * Inputs: None; uses enclosing state where needed.
 * @returns No value is returned; updates the current state, scene, or interface.
 */
function resize() {
    const width = Math.max(container.clientWidth, 1);
    const panelHeight = window.matchMedia('(max-width: 767.98px)').matches ? panel.offsetHeight + 24 : 0;
    const height = Math.max(container.clientHeight - panelHeight, 1);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
}
// Recalculate view dimensions when the surrounding layout changes.
new ResizeObserver(resize).observe(container);
resize();
rebuild();
let lastTime;
document.addEventListener('visibilitychange', () => { lastTime = undefined; accumulator = 0; });
// Keep visual frames separate from the simulation's own update timing.
renderer.setAnimationLoop((time) => {
    const delta = lastTime === undefined ? 0 : Math.min((time - lastTime) / 1000, 0.1);
    lastTime = time;
    if (running && !document.hidden) {
        accumulator += delta;
        while (accumulator >= 1 / speed) {
            step();
            accumulator -= 1 / speed;
        }
    }
    controls.update();
    renderer.render(scene, camera);
});
