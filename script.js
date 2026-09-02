// 캔버스와 2D 그리기 도구를 가져옵니다.
const canvas = document.getElementById("game-board");
const context = canvas.getContext("2d");
const nextCanvas = document.getElementById("next-piece");
const nextContext = nextCanvas.getContext("2d");
const scoreElement = document.getElementById("score");
const levelElement = document.getElementById("level");
const gameStatusElement = document.getElementById("game-status");
const restartButton = document.getElementById("restart-button");
const mobileControlButtons = document.querySelectorAll(
  ".mobile-controls [data-action]",
);

// 테트리스 보드는 가로 10칸, 세로 20칸으로 구성합니다.
const BOARD_COLUMNS = 10;
const BOARD_ROWS = 20;
const INITIAL_DROP_INTERVAL = 500;
const DROP_SPEED_UP_PER_LEVEL = 50;
const MINIMUM_DROP_INTERVAL = 100;
const SCORE_PER_LEVEL = 500;
const SCORE_BY_CLEARED_LINES = [0, 100, 300, 500, 800];

// 300 × 600 캔버스에서는 한 칸이 30px입니다.
// 캔버스 너비가 바뀌어도 가로 10칸에 맞춰 크기를 계산합니다.
const CELL_SIZE = canvas.width / BOARD_COLUMNS;

// null은 아직 블록이 놓이지 않은 빈 칸을 뜻합니다.
// 추후 블록이 고정되면 해당 칸에 테트로미노 종류를 저장할 수 있습니다.
const board = Array.from({ length: BOARD_ROWS }, () =>
  Array(BOARD_COLUMNS).fill(null),
);

// 7가지 테트로미노의 모양과 색입니다.
// shape의 1은 블록이 있는 칸, 0은 비어 있는 칸을 의미합니다.
const TETROMINOES = {
  I: { color: "#00e5ff", shape: [[1, 1, 1, 1]] },
  O: {
    color: "#ffeb3b",
    shape: [
      [1, 1],
      [1, 1],
    ],
  },
  T: {
    color: "#ab47bc",
    shape: [
      [0, 1, 0],
      [1, 1, 1],
    ],
  },
  S: {
    color: "#66bb6a",
    shape: [
      [0, 1, 1],
      [1, 1, 0],
    ],
  },
  Z: {
    color: "#ef5350",
    shape: [
      [1, 1, 0],
      [0, 1, 1],
    ],
  },
  J: {
    color: "#42a5f5",
    shape: [
      [1, 0, 0],
      [1, 1, 1],
    ],
  },
  L: {
    color: "#ff9800",
    shape: [
      [0, 0, 1],
      [1, 1, 1],
    ],
  },
};

/**
 * 7가지 테트로미노 중 하나를 무작위로 골라 보드 위쪽 중앙에 생성합니다.
 */
function createPiece() {
  const pieceTypes = Object.keys(TETROMINOES);
  const type = pieceTypes[Math.floor(Math.random() * pieceTypes.length)];
  const { shape, color } = TETROMINOES[type];

  return {
    type,
    shape,
    color,
    // 블록의 모양 배열 너비를 기준으로 시작 열을 계산합니다.
    x: Math.floor((BOARD_COLUMNS - shape[0].length) / 2),
    y: 0,
  };
}

let currentPiece;
let nextPiece;
let isGameOver = false;
let dropTimerId;
let score = 0;
let level = 1;

/**
 * 테트로미노를 지정한 거리만큼 옮겼을 때 충돌하는지 판정합니다.
 *
 * @param {object} piece 검사할 테트로미노
 * @param {number} offsetX 현재 위치에서 가로로 이동할 칸 수
 * @param {number} offsetY 현재 위치에서 세로로 이동할 칸 수
 * @returns {boolean} 경계 또는 고정 블록과 충돌하면 true
 */
function hasCollision(piece, offsetX = 0, offsetY = 0) {
  for (let row = 0; row < piece.shape.length; row += 1) {
    for (let column = 0; column < piece.shape[row].length; column += 1) {
      // 모양 배열의 빈 칸은 충돌 검사에서 제외합니다.
      if (piece.shape[row][column] === 0) {
        continue;
      }

      const boardColumn = piece.x + column + offsetX;
      const boardRow = piece.y + row + offsetY;

      // 블록의 실제 칸 하나라도 보드 밖으로 나가면 경계 충돌입니다.
      const isOutsideBoard =
        boardColumn < 0 ||
        boardColumn >= BOARD_COLUMNS ||
        boardRow < 0 ||
        boardRow >= BOARD_ROWS;

      if (isOutsideBoard) {
        return true;
      }

      // 이동할 위치에 이미 고정된 블록이 있으면 블록 간 충돌입니다.
      if (board[boardRow][boardColumn] !== null) {
        return true;
      }
    }
  }

  return false;
}

/**
 * 현재 테트로미노의 칸들을 보드 배열에 기록해 움직이지 않게 고정합니다.
 */
function lockCurrentPiece() {
  currentPiece.shape.forEach((shapeRow, row) => {
    shapeRow.forEach((cell, column) => {
      if (cell === 1) {
        board[currentPiece.y + row][currentPiece.x + column] =
          currentPiece.type;
      }
    });
  });
}

/**
 * 가득 찬 모든 줄을 아래에서 위로 확인해 한 번에 제거합니다.
 *
 * 줄을 제거한 자리에는 맨 위에서 빈 줄을 추가합니다. 따라서 기존의
 * 위쪽 블록들은 제거된 줄 수만큼 자연스럽게 아래로 내려옵니다.
 *
 * @returns {number} 동시에 제거한 줄 수
 */
function clearCompletedLines() {
  let clearedLineCount = 0;

  for (let row = BOARD_ROWS - 1; row >= 0; row -= 1) {
    const isCompletedLine = board[row].every((cell) => cell !== null);

    if (!isCompletedLine) {
      continue;
    }

    // 완성된 줄을 제거하고 같은 길이의 빈 줄을 보드 맨 위에 넣습니다.
    board.splice(row, 1);
    board.unshift(Array(BOARD_COLUMNS).fill(null));
    clearedLineCount += 1;

    // 위의 줄이 현재 인덱스로 내려왔으므로 같은 위치를 다시 검사합니다.
    row += 1;
  }

  return clearedLineCount;
}

/**
 * 제거한 줄 수에 맞는 점수를 더하고 우측 점수 영역을 즉시 갱신합니다.
 */
function addLineClearScore(clearedLineCount) {
  const previousLevel = level;

  score += SCORE_BY_CLEARED_LINES[clearedLineCount] ?? 0;
  level = Math.floor(score / SCORE_PER_LEVEL) + 1;
  scoreElement.textContent = String(score);
  levelElement.textContent = String(level);

  // 레벨이 오른 순간부터 새 낙하 속도를 적용합니다.
  if (level !== previousLevel) {
    startDropTimer();
  }
}

/**
 * 다음 테트로미노를 생성합니다.
 * 시작 위치부터 충돌한다면 보드가 가득 찬 상태이므로 낙하를 중단합니다.
 */
function spawnNextPiece() {
  // 미리 보여 준 블록을 현재 블록으로 옮기고 새로운 NEXT 블록을 준비합니다.
  currentPiece = nextPiece ?? createPiece();
  currentPiece.x = Math.floor(
    (BOARD_COLUMNS - currentPiece.shape[0].length) / 2,
  );
  currentPiece.y = 0;
  nextPiece = createPiece();
  drawNextPiece();

  if (hasCollision(currentPiece)) {
    endGame();
  }
}

/**
 * 새 블록이 등장할 수 없을 때 게임을 끝내고 자동 낙하를 멈춥니다.
 */
function endGame() {
  isGameOver = true;
  clearInterval(dropTimerId);
  dropTimerId = undefined;
  gameStatusElement.hidden = false;
}

/**
 * 착지한 블록을 고정하고 줄 삭제와 점수 계산을 마친 뒤 다음 블록을 만듭니다.
 */
function finishCurrentPiece() {
  lockCurrentPiece();

  const clearedLineCount = clearCompletedLines();
  if (clearedLineCount > 0) {
    addLineClearScore(clearedLineCount);
  }

  spawnNextPiece();
}

/**
 * 보드의 한 칸을 지정한 색으로 그립니다.
 * 얇은 테두리를 함께 그려 블록 각각의 경계가 보이게 합니다.
 */
function drawCell(column, row, color) {
  context.fillStyle = color;
  context.fillRect(
    column * CELL_SIZE,
    row * CELL_SIZE,
    CELL_SIZE,
    CELL_SIZE,
  );

  context.strokeStyle = "rgba(255, 255, 255, 0.25)";
  context.lineWidth = 1;
  context.strokeRect(
    column * CELL_SIZE + 0.5,
    row * CELL_SIZE + 0.5,
    CELL_SIZE - 1,
    CELL_SIZE - 1,
  );
}

/**
 * NEXT 캔버스의 중앙에 다음 테트로미노를 미리 그립니다.
 */
function drawNextPiece() {
  nextContext.fillStyle = "#000000";
  nextContext.fillRect(0, 0, nextCanvas.width, nextCanvas.height);

  if (!nextPiece) {
    return;
  }

  const previewCellSize = 24;
  const shapeWidth = nextPiece.shape[0].length * previewCellSize;
  const shapeHeight = nextPiece.shape.length * previewCellSize;
  const offsetX = (nextCanvas.width - shapeWidth) / 2;
  const offsetY = (nextCanvas.height - shapeHeight) / 2;

  nextPiece.shape.forEach((shapeRow, row) => {
    shapeRow.forEach((cell, column) => {
      if (cell === 0) {
        return;
      }

      const x = offsetX + column * previewCellSize;
      const y = offsetY + row * previewCellSize;

      nextContext.fillStyle = nextPiece.color;
      nextContext.fillRect(x, y, previewCellSize, previewCellSize);
      nextContext.strokeStyle = "rgba(255, 255, 255, 0.25)";
      nextContext.lineWidth = 1;
      nextContext.strokeRect(
        x + 0.5,
        y + 0.5,
        previewCellSize - 1,
        previewCellSize - 1,
      );
    });
  });
}

/** 빈 보드의 격자와 보드에 저장된 블록을 그립니다. */
function drawBoard() {
  for (let row = 0; row < BOARD_ROWS; row += 1) {
    for (let column = 0; column < BOARD_COLUMNS; column += 1) {
      const savedPieceType = board[row][column];

      if (savedPieceType) {
        drawCell(column, row, TETROMINOES[savedPieceType].color);
        continue;
      }

      // 빈 칸은 검은색으로 채우고 어두운 격자선을 표시합니다.
      context.fillStyle = "#000000";
      context.fillRect(
        column * CELL_SIZE,
        row * CELL_SIZE,
        CELL_SIZE,
        CELL_SIZE,
      );
      context.strokeStyle = "#242424";
      context.lineWidth = 1;
      context.strokeRect(
        column * CELL_SIZE + 0.5,
        row * CELL_SIZE + 0.5,
        CELL_SIZE - 1,
        CELL_SIZE - 1,
      );
    }
  }
}

/**
 * 현재 떨어지는 테트로미노를 모양 배열에 맞춰 그립니다.
 */
function drawCurrentPiece() {
  // 게임 종료 시 겹친 새 블록은 그리지 않고 고정된 보드만 보여 줍니다.
  if (isGameOver) {
    return;
  }

  currentPiece.shape.forEach((shapeRow, row) => {
    shapeRow.forEach((cell, column) => {
      if (cell === 1) {
        drawCell(
          currentPiece.x + column,
          currentPiece.y + row,
          currentPiece.color,
        );
      }
    });
  });
}

/**
 * 게임 종료 상태를 보드 중앙에도 알아보기 쉽게 표시합니다.
 */
function drawGameOverOverlay() {
  if (!isGameOver) {
    return;
  }

  context.fillStyle = "rgba(0, 0, 0, 0.72)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "#ff5252";
  context.font = "700 32px Arial, sans-serif";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText("게임 오버", canvas.width / 2, canvas.height / 2);
}

/**
 * 한 화면을 새로 그리는 함수입니다.
 * 이전 화면을 지운 뒤 보드와 현재 블록을 순서대로 렌더링합니다.
 */
function draw() {
  context.clearRect(0, 0, canvas.width, canvas.height);
  drawBoard();
  drawCurrentPiece();
  drawGameOverOverlay();
}

/**
 * 0.5초마다 호출되어 현재 블록을 한 칸 아래로 이동합니다.
 * 아래쪽이 막혀 있다면 현재 위치에 고정한 뒤 새 블록을 생성합니다.
 */
function dropPiece() {
  if (isGameOver) {
    return;
  }

  if (hasCollision(currentPiece, 0, 1)) {
    finishCurrentPiece();
  } else {
    currentPiece.y += 1;
  }

  draw();
}

/**
 * 현재 블록을 가로로 한 칸 이동합니다.
 * 이동할 위치가 벽 또는 다른 블록과 충돌하면 현재 위치를 유지합니다.
 */
function moveCurrentPiece(direction) {
  if (!hasCollision(currentPiece, direction, 0)) {
    currentPiece.x += direction;
  }

  draw();
}

/**
 * 2차원 모양 배열을 시계방향으로 90도 회전한 새 배열을 반환합니다.
 * 원본 배열은 변경하지 않아 충돌 시 회전을 안전하게 취소할 수 있습니다.
 */
function rotateShapeClockwise(shape) {
  return shape[0].map((_, column) =>
    shape.map((row) => row[column]).reverse(),
  );
}

/**
 * 현재 블록의 시계방향 회전을 시도합니다.
 * 회전 결과를 임시 블록으로 충돌 검사한 뒤, 안전할 때만 실제 모양에 반영합니다.
 */
function rotateCurrentPiece() {
  const rotatedShape = rotateShapeClockwise(currentPiece.shape);
  const rotatedPiece = {
    ...currentPiece,
    shape: rotatedShape,
  };

  // 벽이나 고정된 블록에 막혔다면 currentPiece를 바꾸지 않아 회전이 취소됩니다.
  if (!hasCollision(rotatedPiece)) {
    currentPiece.shape = rotatedShape;
  }

  draw();
}

/**
 * 현재 블록을 충돌 직전까지 한 번에 내린 뒤 즉시 보드에 고정합니다.
 */
function hardDropCurrentPiece() {
  while (!hasCollision(currentPiece, 0, 1)) {
    currentPiece.y += 1;
  }

  finishCurrentPiece();
  draw();
}

/**
 * 키보드와 모바일 버튼이 공통으로 사용하는 게임 조작 함수입니다.
 */
function performPlayerAction(action) {
  if (isGameOver) {
    return;
  }

  switch (action) {
    case "left":
      moveCurrentPiece(-1);
      break;
    case "right":
      moveCurrentPiece(1);
      break;
    case "soft-drop":
      dropPiece();
      break;
    case "rotate":
      rotateCurrentPiece();
      break;
    case "hard-drop":
      hardDropCurrentPiece();
      break;
  }
}

/**
 * 방향키와 스페이스바 입력을 테트리스 조작으로 처리합니다.
 */
function handleKeyDown(event) {
  const controlKeys = ["ArrowLeft", "ArrowRight", "ArrowDown", "ArrowUp"];
  const isSpaceKey = event.code === "Space";

  // 게임 조작과 관계없는 키는 브라우저의 기본 동작을 그대로 둡니다.
  if (!controlKeys.includes(event.key) && !isSpaceKey) {
    return;
  }

  // 버튼에 포커스가 있을 때는 버튼 자체의 키보드 동작을 우선합니다.
  if (event.target?.closest?.("button")) {
    return;
  }

  // 방향키 스크롤과 스페이스바의 페이지 이동을 막습니다.
  event.preventDefault();

  switch (event.key) {
    case "ArrowLeft":
      performPlayerAction("left");
      break;
    case "ArrowRight":
      performPlayerAction("right");
      break;
    case "ArrowDown":
      // 아래 방향키를 누를 때마다 자동 낙하를 기다리지 않고 한 칸 내립니다.
      performPlayerAction("soft-drop");
      break;
    case "ArrowUp":
      performPlayerAction("rotate");
      break;
    default:
      // 스페이스바를 길게 눌렀을 때 여러 블록이 연속 낙하하는 것을 방지합니다.
      if (!event.repeat) {
        performPlayerAction("hard-drop");
      }
  }
}

/**
 * 모바일 조작 버튼의 data-action 값을 공통 조작 함수에 전달합니다.
 */
function handleMobileControl(event) {
  event.preventDefault();
  performPlayerAction(event.currentTarget.dataset.action);
}

/**
 * 기존 타이머를 정리하고 자동 낙하 타이머를 새로 시작합니다.
 */
function startDropTimer() {
  clearInterval(dropTimerId);

  // 레벨마다 50ms씩 빨라지며, 조작 가능한 최소 간격은 100ms로 제한합니다.
  const dropInterval = Math.max(
    MINIMUM_DROP_INTERVAL,
    INITIAL_DROP_INTERVAL - (level - 1) * DROP_SPEED_UP_PER_LEVEL,
  );
  dropTimerId = setInterval(dropPiece, dropInterval);
}

/**
 * 보드, 점수, 종료 상태를 초기화하고 새로운 게임을 시작합니다.
 */
function restartGame() {
  // 기존 행 배열은 유지하면서 모든 칸을 빈 상태로 되돌립니다.
  board.forEach((row) => row.fill(null));

  score = 0;
  level = 1;
  scoreElement.textContent = "0";
  levelElement.textContent = "1";
  isGameOver = false;
  gameStatusElement.hidden = true;
  nextPiece = createPiece();
  spawnNextPiece();

  startDropTimer();
  draw();
}

// 첫 게임을 시작하고 키보드 및 다시 시작 버튼 입력을 연결합니다.
restartGame();
document.addEventListener("keydown", handleKeyDown);
restartButton.addEventListener("click", restartGame);
mobileControlButtons.forEach((button) => {
  button.addEventListener("click", handleMobileControl);
});
