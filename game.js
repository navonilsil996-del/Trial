const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const groundHeight = 100;

// Player object - inverted isosceles trapezoid (wide top, narrow bottom)
const player = {
  x: 150,
  topWidth: 60,     // wide side (top width)
  bottomWidth: 30,  // narrow side (bottom width)
  height: 50,       // trapezoid height
  y: 0,
  dy: 0,
  gravity: 1.2,
  jumpForce: -25,
  isCrouching: false
};

// Game state
let obstacles = [];
let score = 0;
let bestscore=0;
let gameOver = false;

// Speed
const START_SPEED = 5;
const MAX_SPEED = 10;
let speed = START_SPEED;

// Spawning
const BASE_SPAWN_INTERVAL = 90;
const SPAWN_INCREASE_PER_SPEED = 6;
let spawnTimer;

// Resize canvas and reset player position
function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  player.y = canvas.height - player.height - groundHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// Compute obstacle spawn interval
function computeSpawnInterval() {
  const interval = Math.round(
    BASE_SPAWN_INTERVAL - (speed - START_SPEED) * SPAWN_INCREASE_PER_SPEED
  );
  const jitter = Math.floor(Math.random() * 10) - 10;
  return Math.max(20, interval + jitter);
}

// Spawn obstacle (ground or lifted, with rare variations)
function spawnObstacle() {
  const w = 50, h = 50;

  const veryHighLifted = Math.random() < 0.01; // ~1% chance
  const lifted = veryHighLifted || Math.random() < 0.10;

  let y;
  if (veryHighLifted) {
    y = canvas.height - groundHeight - h - 50; 
  } else if (lifted) {
    y = canvas.height - groundHeight - h - 40;
  } else {
    y = canvas.height - groundHeight - h;
  }

  obstacles.push({
    x: canvas.width + 10,
    y,
    width: w,
    height: h,
    passed: false
  });

  if (Math.random() < 0.05) { // ~5% chance double obstacle
    const offset = 30 + Math.random() * 40;
    obstacles.push({
      x: canvas.width + 10 + offset,
      y,
      width: w,
      height: h,
      passed: false
    });
  }
}

// Reset game
function resetGame() {
  obstacles = [];
  score = 0;
  gameOver = false;
  speed = START_SPEED;
  spawnTimer = computeSpawnInterval();
  player.y = canvas.height - player.height - groundHeight;
  player.dy = 0;
  player.isCrouching = false;
  requestAnimationFrame(loop);
}

// Draw Game Over overlay
function drawGameOver() {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  ctx.fillStyle = '#fff';
  ctx.textAlign = 'center';
  ctx.font = '48px Arial';
  ctx.fillText('Game Over', canvas.width / 2, canvas.height / 2 - 20);

  ctx.font = '30px Arial';
  ctx.fillText('Score: ' + score, canvas.width / 2, canvas.height / 2 + 20);

  ctx.font = '22px Arial';
  ctx.fillText('Best Score: ' + bestscore, canvas.width / 2, canvas.height / 2 + 58);

  ctx.font = '18px Arial';
  ctx.fillText('Press W / Swipe Up / Tap Jump to restart', canvas.width / 2, canvas.height / 2 + 96);
  ctx.restore();
}

// Player actions
function jump() {
  if (gameOver) { resetGame(); return; }
  if (player.y >= canvas.height - player.height - groundHeight - 0.5) {
    player.dy = player.jumpForce;
  }
}

function crouch() {
  if (gameOver) { resetGame(); return; }
  if (player.isCrouching) return;
  player.isCrouching = true;

  // shorter trapezoid for duck
  player.height = 35;
  player.y = canvas.height - player.height - groundHeight;

  setTimeout(() => {
    player.height = 50;
    player.y = canvas.height - player.height - groundHeight;
    player.isCrouching = false;
  }, 600);
}

// Keyboard controls (W/S)
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyW') jump();
  else if (e.code === 'KeyS') crouch();
});

// Swipe controls (mobile)
let touchStartY = null;
canvas.addEventListener('touchstart', (e) => {
  touchStartY = e.touches[0].clientY;
}, { passive: true });

canvas.addEventListener('touchend', (e) => {
  if (touchStartY === null) return;
  const touchEndY = e.changedTouches[0].clientY;
  const diffY = touchStartY - touchEndY;

  if (Math.abs(diffY) > 50) {
    if (diffY > 0) jump();
    else crouch();
  }
  touchStartY = null;
}, { passive: true });

// Speed scaling
function updateSpeedFromScore() {
  const speedGain = Math.min(Math.floor(score / 3), MAX_SPEED - START_SPEED);
  speed = START_SPEED + speedGain;
  if (score > 30) {
    speed = Math.min(MAX_SPEED, speed + Math.floor((score - 30) / 10));
  }
}

// --------- Collision helpers (SAT polygon vs rect) ---------

function getPlayerPolygon(p) {
  const topY = p.y;
  const bottomY = p.y + p.height;
  const offset = (p.topWidth - p.bottomWidth) / 2;

  // Inverted trapezoid: top is wide, bottom is narrow
  return [
    [p.x, topY],                          // top-left
    [p.x + p.topWidth, topY],             // top-right
    [p.x + p.topWidth - offset, bottomY], // bottom-right (narrower)
    [p.x + offset, bottomY]               // bottom-left (narrower)
  ];
}

function projectPolygon(axis, polygon) {
  let min = Infinity, max = -Infinity;
  for (const [x, y] of polygon) {
    const proj = x * axis[0] + y * axis[1];
    if (proj < min) min = proj;
    if (proj > max) max = proj;
  }
  return {min, max};
}

function overlap(proj1, proj2) {
  return proj1.max >= proj2.min && proj2.max >= proj1.min;
}

function polygonRectCollision(polygon, rect) {
  const rectPoints = [
    [rect.x, rect.y],
    [rect.x + rect.width, rect.y],
    [rect.x + rect.width, rect.y + rect.height],
    [rect.x, rect.y + rect.height]
  ];

  const polygons = [polygon, rectPoints];
  for (let shape of polygons) {
    for (let i = 0; i < shape.length; i++) {
      const j = (i + 1) % shape.length;
      const edge = [shape[j][0] - shape[i][0], shape[j][1] - shape[i][1]];
      const axis = [-edge[1], edge[0]]; // perpendicular

      const proj1 = projectPolygon(axis, polygon);
      const proj2 = projectPolygon(axis, rectPoints);
      if (!overlap(proj1, proj2)) return false;
    }
  }
  return true;
}

// Main loop
function loop() {
  if (gameOver) {
    drawScene();
    drawGameOver();
    return;
  }

  updateSpeedFromScore();

  if (spawnTimer <= 0) {
    spawnObstacle();
    spawnTimer = computeSpawnInterval();
  } else {
    spawnTimer--;
  }

  // Player physics
  player.dy += player.gravity;
  player.y += player.dy;

  const groundY = canvas.height - groundHeight;
  if (player.y + player.height > groundY) {
    player.y = groundY - player.height;
    player.dy = 0;
  }

  // Obstacles
  const playerPoly = getPlayerPolygon(player);
  for (let i = obstacles.length - 1; i >= 0; i--) {
    const obs = obstacles[i];
    obs.x -= speed;

    if (polygonRectCollision(playerPoly, obs)) {
      gameOver = true;
    }

    if (!obs.passed && (obs.x + obs.width) < player.x) {
      obs.passed = true;
      score += 1;
    }

    if (obs.x + obs.width < -120) {
      obstacles.splice(i, 1);
    }
  }

  drawScene();
  requestAnimationFrame(loop);
}

// Draw everything
function drawScene() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Ground
  ctx.fillStyle = '#228B22';
  ctx.fillRect(0, canvas.height - groundHeight, canvas.width, groundHeight);

  // Player (inverted trapezoid)
  const poly = getPlayerPolygon(player);
  ctx.fillStyle = '#007bff';
  ctx.beginPath();
  ctx.moveTo(poly[0][0], poly[0][1]);
  for (let i = 1; i < poly.length; i++) {
    ctx.lineTo(poly[i][0], poly[i][1]);
  }
  ctx.closePath();
  ctx.fill();

  // Obstacles
  ctx.fillStyle = '#ff2e2e';
  obstacles.forEach(obs => {
    ctx.fillRect(Math.round(obs.x), Math.round(obs.y), obs.width, obs.height);
  });

  // HUD
  ctx.fillStyle = '#000';
  ctx.font = '26px Arial';
  ctx.textAlign = 'left';
  ctx.fillText('Best Score: ' + bestscore, 18, 40);
  ctx.font = '22px Arial';
  ctx.fillText('Score: ' + score, 18, 68);
  ctx.font = '18px Arial';
  ctx.fillText('Speed: ' + Math.round(speed), 18, 86);
}

// Start game
spawnTimer = computeSpawnInterval();
requestAnimationFrame(loop);

// On-screen button controls (only these lines added)
document.getElementById("btnJump").addEventListener("click", () => {
  jump();
});

document.getElementById("btnCrouch").addEventListener("click", () => {
  crouch();
});