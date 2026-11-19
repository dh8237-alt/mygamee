
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

let W, H;

function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
}
window.addEventListener("resize", resize);
resize();

let running = false;
let paused = false;
let gameOver = false;

let speed = 0;
let score = 0;
let distance = 0;
let lives = 3;

let playerX = 0;
let roadOffset = 0;
let traffic = [];
let spawnTimer = 0;
let collisionCooldown = 0;
let shake = 0;

let keys = {};

let best = Number(localStorage.getItem("highwayBest") || 0);

const player = {
    width: 48,
    height: 88
};

const colors = [
    "#e53935",
    "#2196f3",
    "#fdd835",
    "#eeeeee",
    "#8e44ad",
    "#222222",
    "#ff7f27"
];

function roadWidth() {
    return Math.min(W * 0.82, 850);
}

function roadBounds() {
    const rw = roadWidth();
    return {
        left: (W - rw) / 2,
        right: (W + rw) / 2
    };
}

function startGame() {
    document.getElementById("startScreen").classList.add("hidden");
    document.getElementById("gameOverScreen").classList.add("hidden");

    running = true;
    paused = false;
    gameOver = false;

    speed = 0;
    score = 0;
    distance = 0;
    lives = 3;
    playerX = 0;
    roadOffset = 0;
    traffic = [];
    spawnTimer = 0;
    collisionCooldown = 0;
    shake = 0;

    updateHUD();
    requestAnimationFrame(loop);
}

function restartGame() {
    startGame();
}

function goHome() {
    running = false;
    paused = false;
    gameOver = false;

    document.getElementById("gameOverScreen").classList.add("hidden");
    document.getElementById("pauseScreen").classList.add("hidden");
    document.getElementById("startScreen").classList.remove("hidden");
}

function togglePause() {
    if (!running || gameOver) return;

    paused = !paused;

    document.getElementById("pauseScreen")
        .classList.toggle("hidden", !paused);

    if (!paused) {
        requestAnimationFrame(loop);
    }
}

function updateHUD() {
    document.getElementById("speed").textContent = Math.round(speed);
    document.getElementById("score").textContent = Math.floor(score);
    document.getElementById("distance").textContent = distance.toFixed(2);
    document.getElementById("lives").textContent =
        "❤️".repeat(lives) + "🖤".repeat(3 - lives);
}

function drawBackground() {
    // Sky
    let sky = ctx.createLinearGradient(0, 0, 0, H * 0.65);
    sky.addColorStop(0, "#387db4");
    sky.addColorStop(1, "#c2d6e5");

    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    // Sun
    ctx.fillStyle = "#ffe8a0";
    ctx.beginPath();
    ctx.arc(W * 0.78, H * 0.17, 40, 0, Math.PI * 2);
    ctx.fill();

    // Distant mountains
    ctx.fillStyle = "#536c6b";
    ctx.beginPath();
    ctx.moveTo(0, H * 0.45);
    for (let x = 0; x <= W; x += 100) {
        ctx.lineTo(x, H * (0.30 + Math.sin(x * 0.01) * 0.06));
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.fill();

    // Grass
    ctx.fillStyle = "#397a35";
    ctx.fillRect(0, H * 0.43, W, H);

    // Roadside trees
    for (let i = 0; i < 14; i++) {
        let y = ((i * 110 + roadOffset * 1.2) % (H + 100));
        let scale = 0.3 + y / H * 0.8;
        let left = W / 2 - roadWidth() / 2 - 35 * scale;
        let right = W / 2 + roadWidth() / 2 + 35 * scale;

        drawTree(left - 25 * scale, y, scale);
        drawTree(right + 25 * scale, y, scale);
    }
}

function drawTree(x, y, s) {
    ctx.fillStyle = "#50351f";
    ctx.fillRect(x - 4 * s, y - 35 * s, 8 * s, 40 * s);

    ctx.fillStyle = "#174b20";
    ctx.beginPath();
    ctx.arc(x, y - 45 * s, 20 * s, 0, Math.PI * 2);
    ctx.fill();
}

function roadPerspective() {
    const bounds = roadBounds();
    const horizon = H * 0.43;
    const bottom = H;

    // Road surface
    ctx.fillStyle = "#34383d";
    ctx.beginPath();
    ctx.moveTo(W / 2 - 10, horizon);
    ctx.lineTo(W / 2 + 10, horizon);
    ctx.lineTo(bounds.right, bottom);
    ctx.lineTo(bounds.left, bottom);
    ctx.fill();

    // Road edges
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(W / 2 - 10, horizon);
    ctx.lineTo(bounds.left, bottom);
    ctx.moveTo(W / 2 + 10, horizon);
    ctx.lineTo(bounds.right, bottom);
    ctx.stroke();

    // Lane markings
    const lanes = 4;

    for (let lane = 1; lane < lanes; lane++) {
        let ratio = lane / lanes;

        for (let i = 0; i < 14; i++) {
            let progress = ((i / 14 + roadOffset / 500) % 1);
            let perspective = progress * progress;

            let y = horizon + perspective * (bottom - horizon);
            let roadHalf = 10 + perspective * (roadWidth() / 2 - 10);
            let x = W / 2 - roadHalf + roadHalf * 2 * ratio;

            let lineHeight = 3 + perspective * 35;

            ctx.fillStyle = "#eeeeee";
            ctx.fillRect(x - 2, y, 4, lineHeight);
        }
    }

    // Shoulder stripes
    for (let i = 0; i < 18; i++) {
        let progress = ((i / 18 + roadOffset / 550) % 1);
        let p = progress * progress;
        let y = horizon + p * (bottom - horizon);
        let half = 10 + p * (roadWidth() / 2 - 10);
        let stripeHeight = 2 + p * 12;

        ctx.fillStyle = i % 2 ? "#eee" : "#d33";
        ctx.fillRect(W / 2 - half - 9, y, 8, stripeHeight);
        ctx.fillRect(W / 2 + half + 1, y, 8, stripeHeight);
    }
}

function drawCar(x, y, width, height, color, isPlayer = false) {
    ctx.save();
    ctx.translate(x, y);

    // Shadow
    ctx.fillStyle = "rgba(0,0,0,0.4)";
    ctx.beginPath();
    ctx.ellipse(0, height * 0.48, width * 0.7, height * 0.13, 0, 0, Math.PI * 2);
    ctx.fill();

    // Wheels
    ctx.fillStyle = "#101010";
    ctx.fillRect(-width * 0.57, -height * 0.3, width * 0.18, height * 0.3);
    ctx.fillRect(width * 0.39, -height * 0.3, width * 0.18, height * 0.3);
    ctx.fillRect(-width * 0.57, height * 0.18, width * 0.18, height * 0.3);
    ctx.fillRect(width * 0.39, height * 0.18, width * 0.18, height * 0.3);

    // Body
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-width * 0.42, -height * 0.5);
    ctx.lineTo(width * 0.42, -height * 0.5);
    ctx.lineTo(width * 0.52, -height * 0.25);
    ctx.lineTo(width * 0.52, height * 0.38);
    ctx.quadraticCurveTo(0, height * 0.55, -width * 0.52, height * 0.38);
    ctx.lineTo(-width * 0.52, -height * 0.25);
    ctx.closePath();
    ctx.fill();

    // Rear/Front window
    ctx.fillStyle = "#182b38";
    ctx.beginPath();
    ctx.moveTo(-width * 0.31, -height * 0.2);
    ctx.lineTo(width * 0.31, -height * 0.2);
    ctx.lineTo(width * 0.38, height * 0.12);
    ctx.lineTo(-width * 0.38, height * 0.12);
    ctx.closePath();
    ctx.fill();

    if (isPlayer) {
        // Rear lights
        ctx.fillStyle = "#ff1717";
        ctx.fillRect(-width * 0.43, height * 0.25, width * 0.19, height * 0.09);
        ctx.fillRect(width * 0.24, height * 0.25, width * 0.19, height * 0.09);

        // Spoiler
        ctx.fillStyle = "#111";
        ctx.fillRect(-width * 0.52, -height * 0.36, width * 1.04, height * 0.06);
    } else {
        // Headlights
        ctx.fillStyle = "#fff5b0";
        ctx.fillRect(-width * 0.4, -height * 0.43, width * 0.2, height * 0.08);
        ctx.fillRect(width * 0.2, -height * 0.43, width * 0.2, height * 0.08);
    }

    ctx.restore();
}

function drawTraffic() {
    traffic.forEach(car => {
        const x = car.x;
        const y = car.y;
        const scale = 0.25 + car.depth * 0.85;

        drawCar(
            x,
            y,
            34 * scale,
            62 * scale,
            car.color,
            false
        );
    });
}

function spawnTraffic() {
    const lanes = 4;
    const lane = Math.floor(Math.random() * lanes);
    const bounds = roadBounds();

    const laneWidth = roadWidth() / lanes;

    traffic.push({
        x: bounds.left + laneWidth * (lane + 0.5),
        y: H * 0.44,
        depth: 0.08,
        lane,
        color: colors[Math.floor(Math.random() * colors.length)],
        relativeSpeed: 0.45 + Math.random() * 0.65,
        passed: false
    });
}

function updateTraffic(dt) {
    const difficulty = 1 + distance / 10;

    spawnTimer += dt;

    if (spawnTimer > Math.max(0.35, 1.35 - difficulty * 0.04)) {
        spawnTraffic();
        spawnTimer = 0;
    }

    traffic.forEach(car => {
        let movement = (0.2 + speed / 250 * 1.2) * car.relativeSpeed;
        car.depth += movement * dt * 0.35;

        let p = car.depth;
        let horizon = H * 0.43;
        car.y = horizon + p * p * (H - horizon);

        let bounds = roadBounds();
        let laneWidth = roadWidth() / 4;

        car.x = bounds.left + laneWidth * (car.lane + 0.5);

        if (car.depth > 1.2 && !car.passed) {
            score += 100;
            car.passed = true;
        }
    });

    traffic = traffic.filter(car => car.depth < 1.2);
}

function checkCollision() {
    if (collisionCooldown > 0) return;

    const playerY = H * 0.83;
    const bounds = roadBounds();
    const laneWidth = roadWidth() / 4;

    const px = W / 2 + playerX * (roadWidth() / 2 - player.width);

    for (let car of traffic) {
        if (car.depth > 0.65 && car.depth < 1.0) {
            const cx = bounds.left + laneWidth * (car.lane + 0.5);

            const dx = Math.abs(px - cx);
            const dy = Math.abs(playerY - car.y);

            if (dx < 43 && dy < 65) {
                lives--;
                collisionCooldown = 1.8;
                shake = 12;
                car.depth = 1.3;

                if (lives <= 0) {
                    endGame();
                }

                updateHUD();
                break;
            }
        }
    }
}

function update(dt) {
    if (!running || paused || gameOver) return;

    // Acceleration and braking
    if (keys.ArrowUp) {
        speed += 90 * dt;
    } else {
        speed -= 12 * dt;
    }

    if (keys.ArrowDown || keys.Space) {
        speed -= 130 * dt;
    }

    speed = Math.max(0, Math.min(250, speed));

    // Steering
    let steering = 1.8 * dt;

    if (keys.ArrowLeft) playerX -= steering;
    if (keys.ArrowRight) playerX += steering;

    playerX = Math.max(-0.9, Math.min(0.9, playerX));

    // Road movement
    roadOffset += speed * dt * 1.7;

    // Distance and score
    let travel = speed * dt / 3600;
    distance += travel;
    score += travel * 100;

    // Traffic
    updateTraffic(dt);
    checkCollision();

    collisionCooldown = Math.max(0, collisionCooldown - dt);
    shake = Math.max(0, shake - dt * 25);

    updateHUD();
}

function draw() {
    ctx.save();

    if (shake > 0) {
        ctx.translate(
            (Math.random() - 0.5) * shake,
            (Math.random() - 0.5) * shake
        );
    }

    drawBackground();
    roadPerspective();
    drawTraffic();

    // Player vehicle
    const playerY = H * 0.83;
    const playerScreenX = W / 2 + playerX * (roadWidth() / 2 - player.width);

    if (collisionCooldown <= 0 || Math.floor(Date.now() / 100) % 2 === 0) {
        drawCar(
            playerScreenX,
            playerY,
            player.width,
            player.height,
            "#e10600",
            true
        );
    }

    // Speed blur at high speed
    if (speed > 160) {
        ctx.strokeStyle = "rgba(255,255,255,0.15)";
        ctx.lineWidth = 2;

        for (let i = 0; i < 12; i++) {
            let x = Math.random() * W;
            let y = Math.random() * H;

            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x, y + 20 + speed / 5);
            ctx.stroke();
        }
    }

    ctx.restore();
}

let lastTime = 0;

function loop(timestamp) {
    if (!running || paused || gameOver) return;

    let dt = lastTime ? Math.min((timestamp - lastTime) / 1000, 0.04) : 0;
    lastTime = timestamp;

    update(dt);
    draw();

    requestAnimationFrame(loop);
}

function endGame() {
    running = false;
    gameOver = true;

    let final = Math.floor(score);

    if (final > best) {
        best = final;
        localStorage.setItem("highwayBest", best);
    }

    document.getElementById("finalScore").textContent = final;
    document.getElementById("bestScore").textContent = "BEST: " + best;

    document.getElementById("gameOverScreen").classList.remove("hidden");
}

// Keyboard controls
window.addEventListener("keydown", e => {
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(e.key)) {
        e.preventDefault();
    }

    keys[e.key === " " ? "Space" : e.key] = true;
});

window.addEventListener("keyup", e => {
    keys[e.key === " " ? "Space" : e.key] = false;
});

// Mobile controls
function bindButton(id, key) {
    const btn = document.getElementById(id);

    btn.addEventListener("pointerdown", e => {
        e.preventDefault();
        keys[key] = true;
        btn.setPointerCapture(e.pointerId);
    });

    function release(e) {
        e.preventDefault();
        keys[key] = false;
    }

    btn.addEventListener("pointerup", release);
    btn.addEventListener("pointercancel", release);
    btn.addEventListener("lostpointercapture", () => {
        keys[key] = false;
    });
}

bindButton("leftBtn", "ArrowLeft");
bindButton("rightBtn", "ArrowRight");
bindButton("gasBtn", "ArrowUp");
bindButton("brakeBtn", "ArrowDown");

// Initial scene
drawBackground();
roadPerspective();
drawCar(W / 2, H * 0.83, player.width, player.height, "#e10600", true);
