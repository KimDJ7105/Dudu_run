// ====== 캔버스 & 기본 설정 ======
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const gameWrapEl = document.getElementById('game-wrap'); // 캔버스+두두 이미지를 함께 흔들 때 사용

// ====== 두두 스프라이트(실제 그림) ======
// 캔버스 안에서 drawImage로 그리는 대신, 캔버스 위에 <img>를 겹쳐놓고 좌표만 매 프레임 맞춰준다.
// (GIF는 캔버스에 그리면 특정 프레임을 골라 그릴 수 없어서, 브라우저가 자체 재생하는 <img> 그대로 사용)
const duduSpriteEl = document.getElementById('dudu-sprite');
const RUN_SPRITES = [
  'resource/sprite/Dudu/Dudu_run_1.gif',
  'resource/sprite/Dudu/Dudu_run_2.gif',
  'resource/sprite/Dudu/Dudu_run_3.gif',
];
const DUDU_SPRITE_HEIGHT = 120; // 화면에 보여줄 스프라이트 높이 (히트박스보다 크게 잡아 더 잘 보이게)
// 화면상 두두 이미지의 가로 중심(고정값). 히트박스 가로 위치/크기와 일부러 분리해뒀다.
// (히트박스를 꼬리 쪽만 잘라내도 화면에 보이는 두두가 덩달아 움직이지 않도록 하기 위함)
const DUDU_VISUAL_CENTER_X = 95;

// 게임 시작할 때마다 러닝 스프라이트 중 하나를 골라 그 판이 끝날 때까지 고정해서 쓴다.
function pickRandomDuduSprite() {
  const src = RUN_SPRITES[Math.floor(Math.random() * RUN_SPRITES.length)];
  duduSpriteEl.src = src;
}

// 두두의 히트박스(x, y, width, height) 기준으로 스프라이트 위치를 맞춘다.
// 발 위치(히트박스 하단)에 스프라이트 하단을 맞추고 가로 중앙 정렬, 숙이기는 CSS scaleY로 표현.
function syncDuduSprite() {
  const bottom = dudu.y + dudu.height;
  duduSpriteEl.style.height = `${DUDU_SPRITE_HEIGHT}px`;
  duduSpriteEl.style.top = `${bottom - DUDU_SPRITE_HEIGHT}px`;
  duduSpriteEl.style.left = `${DUDU_VISUAL_CENTER_X}px`;
  // scaleX(-1)로 좌우 반전해서 진행 방향(오른쪽)을 보고 달리게 한다.
  duduSpriteEl.style.transform = dudu.isDucking
    ? 'translateX(-50%) scaleX(-1) scaleY(0.6)'
    : 'translateX(-50%) scaleX(-1)';
}

// 두두가 프로젝트의 메인 캐릭터라 원본 공룡 게임보다 전체적으로 크게 잡은 크기값들
const GROUND_HEIGHT = 40;
const GROUND_Y = canvas.height - GROUND_HEIGHT; // 바닥선 y좌표

// ====== 배경(구름) ======
// 장애물(gameSpeed)보다 느리게 움직이는 구름을 띄워서 "더 멀리 있다"는 원근감(패럴랙스)을 만든다.
const CLOUD_COUNT = 4;
const CLOUD_SPEED_SCALE = 0.25; // 장애물 속도 대비 구름이 움직이는 비율
let clouds = [];

function createCloud(x) {
  return {
    x,
    y: 30 + Math.random() * 90,
    scale: 0.7 + Math.random() * 0.6,
  };
}

function initClouds() {
  clouds = [];
  for (let i = 0; i < CLOUD_COUNT; i++) {
    clouds.push(createCloud((canvas.width / CLOUD_COUNT) * i + Math.random() * 100));
  }
}

function updateClouds(deltaFactor) {
  const cloudSpeed = state.gameSpeed * CLOUD_SPEED_SCALE * deltaFactor;
  for (let i = 0; i < clouds.length; i++) {
    clouds[i].x -= cloudSpeed;
    // 화면 왼쪽으로 사라지면 오른쪽 바깥에서 다시 등장시킨다
    if (clouds[i].x < -60) {
      clouds[i] = createCloud(canvas.width + Math.random() * 100);
    }
  }
}

// 원 4개를 한 path 안에 겹쳐 그려서(겹치는 경계선 없이) 하나의 뭉게구름처럼 보이게 한다.
function drawCloud({ x, y, scale }) {
  const r = 16 * scale;
  const circles = [
    { dx: -1.4 * r, dy: 0.2 * r, radius: 0.7 * r },
    { dx: -0.5 * r, dy: -0.3 * r, radius: 0.9 * r },
    { dx: 0.5 * r, dy: -0.2 * r, radius: 0.85 * r },
    { dx: 1.3 * r, dy: 0.2 * r, radius: 0.65 * r },
  ];

  ctx.fillStyle = '#dcdcdc';
  ctx.beginPath();
  circles.forEach(({ dx, dy, radius }) => {
    ctx.moveTo(x + dx + radius, y + dy);
    ctx.arc(x + dx, y + dy, radius, 0, Math.PI * 2);
  });
  ctx.fill();
}

function drawClouds() {
  clouds.forEach(drawCloud);
}
// 이전 값(중력 1.3)은 "천장을 안 뚫는 것"만 기준으로 방어적으로 올렸던 값이라 점프가 너무
// 급하게 뜨고 떨어진다는 피드백이 있었다. 중력/초기 속도를 함께 낮춰서 "같은 높이라도 더 오래
// 떠 있는" 둥둥 뜨는 느낌으로 재조정했다 (탭 점프 ≈ 83px/0.6초, 꽉 누른 점프 ≈ 156px/0.87초).
const GRAVITY = 0.55;                // 중력 가속도
const JUMP_VELOCITY = -9.5;          // 점프 시 초기 상승 속도 (음수 = 위로)

// 점프 버튼을 누르고 있는 동안 중력을 약하게 적용해서 "길게 누르면 더 높이 뛰는" 효과를 만든다.
// 짧게 눌렀다 떼면 금방 정상 중력으로 돌아가 낮게 뛰고, 계속 누르고 있으면 최대 시간까지 둥둥 떠서 더 높이 올라간다.
const JUMP_HOLD_GRAVITY_SCALE = 0.35; // 홀드 중 적용할 중력 배율 (1보다 작을수록 더 둥둥 뜸)
const MAX_JUMP_HOLD_FRAMES = 15;      // 홀드 효과가 유지되는 최대 프레임 수

const INITIAL_GAME_SPEED = 7;        // 초기 장애물 이동 속도
const MAX_GAME_SPEED = 13;           // 속도는 여기까지만 올라가고 더는 빨라지지 않음 (원본처럼 계속 빨라지기만 하되 상한을 둠)
const SPEED_INCREASE_INTERVAL = 500; // 점수가 이만큼 오를 때마다 속도 증가
const SPEED_INCREASE_AMOUNT = 0.5;

// 화면에 보이는 점수(SCORE 표시값)는 state.score를 10으로 나눈 값이라, 화면 점수 100점마다
// 소리를 내려면 state.score 기준으로는 1000마다 울리면 된다.
const SCORE_SOUND_INTERVAL = 1000;

// 장애물 사이 최소/최대 간격(프레임 단위). 프레임 = 시간이므로, 속도가 빨라져도
// 다음 장애물까지 반응할 수 있는 시간은 항상 보장된다 (원본 게임은 "속도에 비례한 픽셀 간격"
// 공식으로 같은 효과를 내는데, 여기선 시간 기준으로 직접 보장하는 방식).
// 최소값은 "점프해서 착지하기까지 걸리는 시간"보다 충분히 길게 잡아야 항상 회피 가능하다.
const MIN_OBSTACLE_GAP_FRAMES = 70;
const MAX_OBSTACLE_GAP_FRAMES = 140;

const STANDING_HEIGHT = 80; // 서 있을 때 두두의 높이
const DUCK_HEIGHT = 45;     // 숙였을 때 두두의 높이 (낮을수록 숙이는 효과가 커짐)

// 두두 이미지는 거대한 꼬리 + 인간형 몸통으로 나뉘는데, 히트박스가 꼬리까지 포함하면
// 실제로는 피한 것처럼 보이는 장애물에도 충돌 판정이 나버린다. 그래서 히트박스 앞쪽(이동 방향,
// 몸통 쪽) 끝은 고정해두고, 뒤쪽(꼬리 쪽)만 잘라내서 몸통 부분만 판정에 쓰도록 좁혔다.
const HITBOX_FRONT_X = 130; // 히트박스 앞쪽 끝 x좌표 (이 값은 그대로 유지)
const HITBOX_WIDTH = 40;    // 기존 70에서 줄임 (꼬리 쪽을 잘라낸 너비)

// 선인장을 난이도 3단계로 나눈다. "넘을 수 있는지"는 높이가, "타이밍이 얼마나 빡빡한지"는
// 너비가 결정한다 — 너비가 넓을수록 장애물이 두두 밑을 지나가는 시간(통과 시간)이 길어지고,
// 점프로 그 높이 이상 떠 있는 시간(T_high)은 정해져 있으니 통과 시간이 길어질수록 타이밍이
// 빡빡해진다 (현재 점프 물리 기준: 높이 120px의 T_high ≈ 22프레임, 가장 느린 속도(7)에서
// 너비 60px의 통과 시간 ≈ 14프레임으로, 약 8프레임의 여유를 남겨 "어렵지만 막히진 않게" 맞췄다.
// 3단계는 속도가 빨라진 뒤(점수 800+)에만 등장하는데, 그 상태에서 체감이 너무 빡빡하다는
// 피드백을 받아 높이를 120~135 → 110~125로 살짝 낮춰 여유를 더 줬다).
const CACTUS_TIERS = [
  { minHeight: 40, maxHeight: 60, minWidth: 25, maxWidth: 45 },   // 1단계: 탭 점프로 여유 있게 클리어
  { minHeight: 90, maxHeight: 110, minWidth: 30, maxWidth: 70 },  // 2단계: 홀드 점프 필요, 타이밍은 널널함
  { minHeight: 110, maxHeight: 125, minWidth: 55, maxWidth: 70 }, // 3단계: 홀드 점프 + 타이밍을 맞춰야 함
];
const TALL_CACTUS_MIN_SCORE = 800; // 3단계는 이 점수를 넘긴 뒤부터만 등장 (초반 난이도 보호)

// 공중 장애물(새). 서 있으면 맞고, 숙이면 피할 수 있는 높이에 배치한다.
// (STANDING 상태 두두의 머리보다 낮고, DUCK 상태 두두의 머리보다는 높아야 "숙여야만 피할 수 있는" 장애물이 된다)
const FLYING_OBSTACLE_HEIGHT = 35;
const FLYING_OBSTACLE_WIDTH = 54; // 새 이미지 원본 비율(31:20)에 맞춘 너비
const FLYING_OBSTACLE_Y = GROUND_Y - 95;
const FLYING_OBSTACLE_MIN_SCORE = 300; // 이 점수를 넘기 전에는 등장하지 않음 (초반 난이도 완화)
const FLYING_OBSTACLE_CHANCE = 0.35;   // 등장 조건을 만족했을 때 공중 장애물이 뽑힐 확률

// 새 날갯짓 2프레임 이미지. 캔버스에 drawImage로 직접 그릴 수 있는 정적 PNG라
// (GIF와 달리) 별도 DOM 오버레이 없이 바로 사용할 수 있다.
const birdWingUpImage = new Image();
birdWingUpImage.src = 'resource/sprite/bird/bird_wing_up.png';
const birdWingDownImage = new Image();
birdWingDownImage.src = 'resource/sprite/bird/bird_wing_down.png';
const WING_FLAP_INTERVAL_FRAMES = 10; // 이 프레임 수마다 날개 위/아래 프레임을 번갈아 보여줌

// 게임 전체 상태를 하나의 객체로 관리 (ready -> running -> gameover)
const state = {
  status: 'ready',
  score: 0,
  gameSpeed: INITIAL_GAME_SPEED,
};

// 화면에 보이는 점수(state.score를 10으로 나눈 값)를 구하는 헬퍼
function getDisplayScore() {
  return Math.floor(state.score / 10);
}

// 최고 점수는 브라우저에 저장해뒀다가 다음에 다시 들어와도 유지되게 한다.
const HIGH_SCORE_STORAGE_KEY = 'duduRunHighScore';
let highScore = Number(localStorage.getItem(HIGH_SCORE_STORAGE_KEY)) || 0;

const SHOW_HITBOX = false; // true로 바꾸면 실제 충돌 판정 영역을 테두리로 확인 가능 (디버그용)

// ====== 두두(플레이어) ======
// 실제 모습은 캔버스 위에 겹친 <img>(duduSpriteEl)가 보여주고, 여기 dudu 객체는
// 물리/충돌 판정용 히트박스만 담당한다. draw()는 디버그용 테두리만 그린다.
const dudu = {
  x: HITBOX_FRONT_X - HITBOX_WIDTH,
  y: GROUND_Y - STANDING_HEIGHT,
  width: HITBOX_WIDTH,
  height: STANDING_HEIGHT,
  velocityY: 0,
  isJumping: false,
  isJumpHeld: false,   // 점프 버튼을 현재 누르고 있는 중인지
  jumpHoldFrames: 0,   // 홀드 중력 완화가 적용된 프레임 수 (MAX_JUMP_HOLD_FRAMES까지)
  isDucking: false,    // 숙이기 상태인지 (공중 장애물 회피용, 점프 중에는 불가능)

  // 매 프레임 두두의 위치/속도를 갱신하는 물리 로직.
  // deltaFactor: 이번 틱이 "60fps 기준 몇 프레임 분량의 시간"인지 (1 = 정상 프레임 한 번).
  update(deltaFactor) {
    if (this.isJumping) {
      // 버튼을 누르고 있고, 아직 상승 중이고, 홀드 허용 시간이 남아있으면 중력을 약하게 적용
      // -> 길게 누를수록 상승이 오래 유지되어 더 높이 올라간다.
      const isSustainingJump =
        this.isJumpHeld && this.velocityY < 0 && this.jumpHoldFrames < MAX_JUMP_HOLD_FRAMES;

      this.velocityY += (isSustainingJump ? GRAVITY * JUMP_HOLD_GRAVITY_SCALE : GRAVITY) * deltaFactor;
      if (isSustainingJump) this.jumpHoldFrames += deltaFactor;

      this.y += this.velocityY * deltaFactor;

      // 바닥에 닿으면 점프 종료, 바닥 위치로 보정
      if (this.y >= GROUND_Y - this.height) {
        this.y = GROUND_Y - this.height;
        this.velocityY = 0;
        this.isJumping = false;
        this.isJumpHeld = false;
        this.jumpHoldFrames = 0;
      }
    }
  },

  // 점프 시작 (이미 점프 중이면 무시 -> 2단 점프 방지)
  jump() {
    if (!this.isJumping) {
      this.isJumping = true;
      this.isJumpHeld = true;
      this.jumpHoldFrames = 0;
      this.velocityY = JUMP_VELOCITY;
    }
  },

  // 점프 버튼을 뗐을 때 호출. 홀드로 인한 둥둥 뜨기 효과를 바로 멈춰서 짧은 점프로 만든다.
  releaseJump() {
    this.isJumpHeld = false;
  },

  // 숙이기 시작. 공중에 떠 있는 동안은 숙일 수 없다 (점프와 숙이기가 동시에 적용되지 않도록).
  startDuck() {
    if (!this.isJumping && !this.isDucking) {
      this.isDucking = true;
      this.height = DUCK_HEIGHT;
      this.y = GROUND_Y - DUCK_HEIGHT;
    }
  },

  // 숙이기 종료, 원래 서 있는 높이로 복귀
  stopDuck() {
    if (this.isDucking) {
      this.isDucking = false;
      this.height = STANDING_HEIGHT;
      this.y = GROUND_Y - STANDING_HEIGHT;
    }
  },

  draw() {
    if (!SHOW_HITBOX) return;
    ctx.strokeStyle = '#ff0000';
    ctx.strokeRect(this.x, this.y, this.width, this.height);
  },
};

// ====== 장애물 ======
// 화면에 등장한 장애물들을 배열로 관리한다.
let obstacles = [];
let frameCount = 0;          // 전체 경과 프레임 수 (스폰 타이밍 계산용)
let nextObstacleFrame = 0;   // 다음 장애물이 등장할 프레임

// 새 장애물 하나를 생성해 배열에 추가. 일정 점수 이후부터는 공중 장애물(숙여서 회피)도 등장시킨다.
// 선인장 난이도 단계를 하나 고른다. 3단계(정밀 타이밍)는 TALL_CACTUS_MIN_SCORE를 넘긴 뒤에만
// 후보에 들어간다. 1단계가 제일 자주, 3단계가 제일 드물게 나오도록 가중치를 뒀다.
function pickCactusTier() {
  const canSpawnTall = state.score >= TALL_CACTUS_MIN_SCORE;
  const roll = Math.random();

  if (canSpawnTall && roll < 0.15) return CACTUS_TIERS[2];
  if (roll < 0.15 + 0.35) return CACTUS_TIERS[1];
  return CACTUS_TIERS[0];
}

function spawnObstacle() {
  const canSpawnFlying = state.score >= FLYING_OBSTACLE_MIN_SCORE;
  const isFlying = canSpawnFlying && Math.random() < FLYING_OBSTACLE_CHANCE;

  if (isFlying) {
    obstacles.push({
      type: 'flying',
      x: canvas.width,
      y: FLYING_OBSTACLE_Y,
      width: FLYING_OBSTACLE_WIDTH,
      height: FLYING_OBSTACLE_HEIGHT,
    });
  } else {
    const tier = pickCactusTier();
    const height = tier.minHeight + Math.random() * (tier.maxHeight - tier.minHeight);
    const width = tier.minWidth + Math.random() * (tier.maxWidth - tier.minWidth);

    obstacles.push({
      type: 'ground',
      x: canvas.width,
      y: GROUND_Y - height,
      width,
      height,
    });
  }

  // 다음 장애물 등장 시점을 랜덤 간격(프레임)으로 다시 설정 (항상 반응 가능한 최소 시간 보장)
  nextObstacleFrame =
    frameCount + MIN_OBSTACLE_GAP_FRAMES + Math.random() * (MAX_OBSTACLE_GAP_FRAMES - MIN_OBSTACLE_GAP_FRAMES);
}

// 장애물들의 위치를 갱신하고, 화면 밖으로 나간 것은 제거
function updateObstacles(deltaFactor) {
  if (frameCount >= nextObstacleFrame) {
    spawnObstacle();
  }

  const moveAmount = state.gameSpeed * deltaFactor;
  obstacles.forEach((obstacle) => {
    obstacle.x -= moveAmount;
  });

  // 왼쪽으로 완전히 빠져나간 장애물은 배열에서 제거 (메모리/연산 누적 방지)
  obstacles = obstacles.filter((obstacle) => obstacle.x + obstacle.width > 0);
}

// 점프로 피하는 장애물: 기둥(몸통) + 좌우 팔 두 개로 이루어진 선인장 실루엣 (회색 원톤)
// 선인장 하나를 주어진 영역(x, y, width, height) 안에 그린다.
function drawSingleCactus(x, y, width, height) {
  ctx.fillStyle = '#5a5a5a';

  const trunkWidth = width * 0.42;
  const trunkX = x + (width - trunkWidth) / 2;
  ctx.fillRect(trunkX, y, trunkWidth, height); // 몸통(중앙 기둥)

  const armWidth = width * 0.2;
  const armHeight = height * 0.4;
  const connectorHeight = armWidth * 0.8;

  // 왼쪽 팔: 기둥 중간 높이에서 옆으로 뻗어 위로 솟은 모양
  const leftArmY = y + height * 0.3;
  ctx.fillRect(x, leftArmY, armWidth, armHeight);
  ctx.fillRect(x, leftArmY + armHeight - connectorHeight, trunkX - x, connectorHeight);

  // 오른쪽 팔 (높이를 다르게 해서 좌우 비대칭으로 변화를 줌)
  const rightArmY = y + height * 0.15;
  ctx.fillRect(x + width - armWidth, rightArmY, armWidth, armHeight);
  ctx.fillRect(
    trunkX + trunkWidth,
    rightArmY + armHeight - connectorHeight,
    x + width - armWidth - (trunkX + trunkWidth),
    connectorHeight
  );
}

// 가로 폭이 넓은 장애물(주로 3단계)은 선인장 하나를 늘려서 그리면 뚱뚱해 보이므로,
// 판정 박스(obstacle.width/height)는 그대로 둔 채 그 안에 선인장 두 개를 나란히 붙여 그린다.
const WIDE_CACTUS_VISUAL_THRESHOLD = 48;
const WIDE_CACTUS_GAP = 2; // 두 선인장 사이 틈

function drawCactus({ x, y, width, height }) {
  if (width <= WIDE_CACTUS_VISUAL_THRESHOLD) {
    drawSingleCactus(x, y, width, height);
    return;
  }

  const halfWidth = (width - WIDE_CACTUS_GAP) / 2;
  drawSingleCactus(x, y, halfWidth, height);
  drawSingleCactus(x + halfWidth + WIDE_CACTUS_GAP, y, halfWidth, height);
}

// 숙여서 피하는 장애물: 날갯짓하는 새(이미지 2프레임을 번갈아 그림).
// frameCount(델타타임 기준으로 흐르는 "프레임 시간")를 WING_FLAP_INTERVAL_FRAMES로 나눠서
// 일정 주기로 두 프레임을 번갈아 보여준다. 회전/둥실거림/꼬리 같은 연출은 넣지 않고 담백하게 그린다.
function drawBird({ x, y, width, height }) {
  const isWingUp = Math.floor(frameCount / WING_FLAP_INTERVAL_FRAMES) % 2 === 0;
  const image = isWingUp ? birdWingUpImage : birdWingDownImage;

  if (image.complete) {
    ctx.drawImage(image, x, y, width, height);
  }
}

function drawObstacles() {
  obstacles.forEach((obstacle) => {
    if (obstacle.type === 'flying') {
      drawBird(obstacle);
    } else {
      drawCactus(obstacle);
    }
  });
}

// ====== 충돌 판정 ======
// 두 사각형(AABB)이 겹치는지 검사. 겹치면 충돌(게임오버) 처리.
function isColliding(rectA, rectB) {
  return (
    rectA.x < rectB.x + rectB.width &&
    rectA.x + rectA.width > rectB.x &&
    rectA.y < rectB.y + rectB.height &&
    rectA.y + rectA.height > rectB.y
  );
}

// 선인장(ground 타입)은 그려지는 모습보다 판정을 가로로 살짝 좁혀서 체감 난이도를 관대하게 한다.
// 높이는 그대로 둬서(세로 판정은 안 건드림) 점프 타이밍 자체의 난이도는 바뀌지 않는다.
const GROUND_OBSTACLE_HITBOX_WIDTH_RATIO = 0.8;

function getObstacleHitbox(obstacle) {
  if (obstacle.type !== 'ground') return obstacle;

  const hitboxWidth = obstacle.width * GROUND_OBSTACLE_HITBOX_WIDTH_RATIO;
  return {
    x: obstacle.x + (obstacle.width - hitboxWidth) / 2,
    y: obstacle.y,
    width: hitboxWidth,
    height: obstacle.height,
  };
}

function checkCollisions() {
  return obstacles.some((obstacle) => isColliding(dudu, getObstacleHitbox(obstacle)));
}

// ====== 배경(바닥선) ======
// 완전히 평평한 직선 대신, 흙길처럼 살짝 패이거나 볼록한 지점들이 있는 선으로 그린다.
// 매 프레임 랜덤하게 생성하면 덜덜 떨려 보이므로, 고정된 패턴 하나를 정해두고
// 장애물과 같은 속도(gameSpeed)로 스크롤만 시킨다.
const GROUND_BUMP_TILE_WIDTH = 150; // 이 패턴이 반복되는 한 구간의 길이
const GROUND_BUMPS_PER_TILE = [
  // offset: 타일 안에서의 x 위치, depth: 양수면 볼록(위로), 음수면 패임(아래로)
  { offset: 20, depth: 3 },
  { offset: 55, depth: -4 },
  { offset: 95, depth: 2 },
  { offset: 125, depth: -3 },
];
let groundScrollX = 0; // 누적 스크롤 거리

function drawGround() {
  ctx.strokeStyle = '#999';
  ctx.beginPath();
  ctx.moveTo(0, GROUND_Y);

  const scrollOffset = groundScrollX % GROUND_BUMP_TILE_WIDTH;
  const tileCount = Math.ceil(canvas.width / GROUND_BUMP_TILE_WIDTH) + 2;

  for (let tile = -1; tile < tileCount; tile++) {
    const tileStartX = tile * GROUND_BUMP_TILE_WIDTH - scrollOffset;
    GROUND_BUMPS_PER_TILE.forEach(({ offset, depth }) => {
      const bumpX = tileStartX + offset;
      if (bumpX < 0 || bumpX > canvas.width) return;
      ctx.lineTo(bumpX - 4, GROUND_Y);
      ctx.lineTo(bumpX, GROUND_Y - depth);
      ctx.lineTo(bumpX + 4, GROUND_Y);
    });
  }

  ctx.lineTo(canvas.width, GROUND_Y);
  ctx.stroke();
}

// ====== 두두 그림자 ======
// 서 있을 때/숙일 때도 바닥에 타원 그림자가 항상 보이고, 점프로 높이 올라갈수록
// 그림자가 작고 흐려지게 해서 입체감과 착지 타이밍을 가늠할 수 있게 한다.
function drawDuduShadow() {
  const standingTopY = GROUND_Y - STANDING_HEIGHT;
  const jumpProgress = Math.min(1, Math.max(0, (standingTopY - dudu.y) / 150)); // 0: 바닥 근처, 1: 최고 높이 근처
  const scale = 1 - jumpProgress * 0.5;
  const alpha = Math.max(0.08, 0.3 - jumpProgress * 0.18);

  ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
  ctx.beginPath();
  ctx.ellipse(DUDU_VISUAL_CENTER_X, GROUND_Y, 30 * scale, 7 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

// ====== 효과음 ======
// 음원 파일 없이, 브라우저의 Web Audio API로 짧은 "삐" 소리를 직접 합성해서 재생한다.
let audioCtx = null;

function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return audioCtx;
}

// 점수 100점을 넘길 때마다 울리는 알림음 (원본 공룡 게임의 점수 알림음과 같은 역할)
function playScoreMilestoneSound() {
  const ctx2 = getAudioContext();
  const oscillator = ctx2.createOscillator();
  const gainNode = ctx2.createGain();

  oscillator.type = 'square';
  oscillator.frequency.setValueAtTime(880, ctx2.currentTime);

  // 짧게 울렸다가 바로 잦아들도록 음량을 빠르게 줄인다
  gainNode.gain.setValueAtTime(0.15, ctx2.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx2.currentTime + 0.15);

  oscillator.connect(gainNode);
  gainNode.connect(ctx2.destination);
  oscillator.start();
  oscillator.stop(ctx2.currentTime + 0.15);
}

// 게임 오버 순간 울리는 짧은 "뚝 떨어지는" 효과음
function playGameOverSound() {
  const ctx2 = getAudioContext();
  const oscillator = ctx2.createOscillator();
  const gainNode = ctx2.createGain();

  oscillator.type = 'sawtooth';
  oscillator.frequency.setValueAtTime(220, ctx2.currentTime);
  oscillator.frequency.exponentialRampToValueAtTime(80, ctx2.currentTime + 0.3); // 음이 아래로 뚝 떨어지는 효과

  gainNode.gain.setValueAtTime(0.2, ctx2.currentTime);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, ctx2.currentTime + 0.3);

  oscillator.connect(gainNode);
  gainNode.connect(ctx2.destination);
  oscillator.start();
  oscillator.stop(ctx2.currentTime + 0.3);
}

// ====== 점수 ======
// 매 프레임 조금씩 점수를 올리고, 일정 점수마다 게임 속도를 높여 난이도를 조절.
// deltaFactor 때문에 점수가 정수가 아니라 소수 단위로 올라갈 수 있어서, "정확히 나누어떨어지는지"
// (% === 0) 대신 "이번 프레임에 그 경계를 넘었는지"로 판정한다 (넘는 순간 한 번만 실행됨).
function updateScore(deltaFactor) {
  const previousScore = state.score;
  state.score += deltaFactor;

  if (Math.floor(state.score / SCORE_SOUND_INTERVAL) > Math.floor(previousScore / SCORE_SOUND_INTERVAL)) {
    playScoreMilestoneSound();
  }

  // 속도는 점수가 오를 때마다 조금씩 증가하되, MAX_GAME_SPEED를 넘지 않는다 (느려지는 경우는 없음)
  if (
    Math.floor(state.score / SPEED_INCREASE_INTERVAL) > Math.floor(previousScore / SPEED_INCREASE_INTERVAL) &&
    state.gameSpeed < MAX_GAME_SPEED
  ) {
    state.gameSpeed = Math.min(MAX_GAME_SPEED, state.gameSpeed + SPEED_INCREASE_AMOUNT);
  }
}

function drawScore() {
  const displayScore = getDisplayScore();
  ctx.fillStyle = '#333';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(
    `HI ${String(highScore).padStart(5, '0')}   SCORE ${String(displayScore).padStart(5, '0')}`,
    canvas.width - 20,
    30
  );
  ctx.textAlign = 'left';
}

// ====== 상태 전환 ======
// ready -> running: 게임을 처음 시작
function startGame() {
  state.status = 'running';
  state.score = 0;
  state.gameSpeed = INITIAL_GAME_SPEED;
  pickRandomDuduSprite();
  // 오디오 컨텍스트는 브라우저 정책상 사용자 입력(키/클릭) 시점에 깨워둬야 나중에 소리가 제대로 난다
  getAudioContext().resume();
  obstacles = [];
  frameCount = 0;
  groundScrollX = 0;
  nextObstacleFrame = MIN_OBSTACLE_GAP_FRAMES;
  dudu.isDucking = false;
  dudu.height = STANDING_HEIGHT;
  dudu.y = GROUND_Y - STANDING_HEIGHT;
  dudu.velocityY = 0;
  dudu.isJumping = false;
  dudu.isJumpHeld = false;
  dudu.jumpHoldFrames = 0;
}

// running -> gameover: 충돌이 감지되었을 때
let gameOverFlashFrames = 0;
const GAME_OVER_FLASH_DURATION = 12; // 충돌 직후 화면이 붉게 번쩍이다 잦아드는 데 걸리는 프레임 수

function endGame() {
  state.status = 'gameover';
  gameOverFlashFrames = GAME_OVER_FLASH_DURATION;
  playGameOverSound();

  // CSS 애니메이션으로 캔버스+두두 이미지가 담긴 래퍼 전체를 짧게 흔든다.
  // 애니메이션이 끝나면 클래스를 지워서 다음 게임오버 때 다시 재생될 수 있게 한다.
  gameWrapEl.classList.remove('shake');
  void gameWrapEl.offsetWidth; // 리플로우를 강제해서 클래스를 다시 추가했을 때 애니메이션이 재시작되게 함
  gameWrapEl.classList.add('shake');

  const displayScore = getDisplayScore();
  if (displayScore > highScore) {
    highScore = displayScore;
    localStorage.setItem(HIGH_SCORE_STORAGE_KEY, String(highScore));
  }
}

// 충돌 순간의 피드백: 화면 전체에 붉은 틴트를 깔았다가 몇 프레임에 걸쳐 서서히 사라지게 한다.
function drawGameOverFlash(deltaFactor) {
  if (gameOverFlashFrames <= 0) return;

  const alpha = (gameOverFlashFrames / GAME_OVER_FLASH_DURATION) * 0.35;
  ctx.fillStyle = `rgba(220, 0, 0, ${alpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  gameOverFlashFrames -= deltaFactor;
}

function drawMessage(text) {
  ctx.fillStyle = '#333';
  ctx.font = '20px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  ctx.textAlign = 'left';
}

// ====== 입력 처리 ======
// 스페이스/↑ 키 하나로 "시작 / 점프 / 재시작"을 상태(status)에 따라 분기 처리
function handleJumpInput() {
  if (state.status === 'ready') {
    startGame();
  } else if (state.status === 'running') {
    dudu.jump();
  } else if (state.status === 'gameover') {
    startGame();
  }
}

// 점프: 스페이스바 / ↑ / W
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    e.preventDefault(); // 스페이스바의 기본 동작(페이지 스크롤) 방지
    handleJumpInput();
  }
});

// 버튼을 떼는 시점을 알아야 "짧게 누르면 낮게, 길게 누르면 높게" 점프가 동작한다.
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
    dudu.releaseJump();
  }
});

canvas.addEventListener('mousedown', handleJumpInput);
canvas.addEventListener('mouseup', () => dudu.releaseJump());

// 숙이기(공중 장애물 회피용): ↓ / S 를 누르고 있는 동안
window.addEventListener('keydown', (e) => {
  if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    e.preventDefault();
    dudu.startDuck();
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowDown' || e.code === 'KeyS') {
    dudu.stopDuck();
  }
});

// 모바일 화면 하단 터치 버튼. pointerdown/up으로 마우스/터치를 동일하게 처리한다.
const jumpButtonEl = document.getElementById('btn-jump');
const duckButtonEl = document.getElementById('btn-duck');

jumpButtonEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  handleJumpInput();
});
jumpButtonEl.addEventListener('pointerup', () => dudu.releaseJump());
jumpButtonEl.addEventListener('pointercancel', () => dudu.releaseJump());

duckButtonEl.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  dudu.startDuck();
});
duckButtonEl.addEventListener('pointerup', () => dudu.stopDuck());
duckButtonEl.addEventListener('pointercancel', () => dudu.stopDuck());

// ====== 메인 게임 루프 ======
// requestAnimationFrame은 "한 번 호출 = 정확히 1/60초"를 보장하지 않는다. 특히 모바일에서는
// 화면 주소창이 접히고 펴지는 등의 이유로 호출 간격이 불규칙해지는 경우가 있는데, 예전처럼
// "호출될 때마다 무조건 +1프레임"으로 계산하면 호출이 몰리는 순간 게임이 갑자기 빨라져 보인다.
// 그래서 실제 경과 시간을 재서 "60fps 기준 몇 프레임 분량의 시간이 지났는지(deltaFactor)"를
// 구하고, 모든 이동/점수/타이머가 프레임 횟수가 아니라 이 값을 기준으로 진행되게 한다.
const TARGET_FRAME_MS = 1000 / 60;
const MAX_DELTA_FACTOR = 3; // 탭 전환 등으로 오래 멈췄다 돌아와도 한 번에 너무 많이 진행되지 않도록 제한
let lastTimestamp = null;

// 매 프레임: 지우기 -> 상태 갱신 -> 다시 그리기 순으로 반복 (requestAnimationFrame)
function gameLoop(timestamp) {
  const deltaMs = lastTimestamp === null ? TARGET_FRAME_MS : timestamp - lastTimestamp;
  lastTimestamp = timestamp;
  const deltaFactor = Math.min(MAX_DELTA_FACTOR, Math.max(0, deltaMs / TARGET_FRAME_MS));

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawClouds();
  drawGround();

  if (state.status === 'running') {
    frameCount += deltaFactor;
    dudu.update(deltaFactor);
    updateObstacles(deltaFactor);
    updateClouds(deltaFactor);
    groundScrollX += state.gameSpeed * deltaFactor;
    updateScore(deltaFactor);

    if (checkCollisions()) {
      endGame();
    }
  }

  drawDuduShadow();
  dudu.draw();
  syncDuduSprite();
  drawObstacles();
  drawScore();

  if (state.status === 'ready') {
    drawMessage('스페이스바를 눌러 시작');
  } else if (state.status === 'gameover') {
    drawMessage('게임 오버! 다시 시작하려면 스페이스바');
  }

  drawGameOverFlash(deltaFactor);

  requestAnimationFrame(gameLoop);
}

pickRandomDuduSprite(); // 시작 화면에서도 두두가 보이도록 미리 하나 선택
initClouds();
requestAnimationFrame(gameLoop); // 첫 호출부터 timestamp를 받아야 하므로 직접 호출 대신 rAF로 시작
