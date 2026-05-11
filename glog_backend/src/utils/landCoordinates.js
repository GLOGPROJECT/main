/**
 * 육지 위의 랜덤 좌표 생성
 * 육지 바운딩 박스 목록 기반 샘플링 (바다 비율 최소화)
 * 완벽한 해안선 정확도는 아니지만 MVP 수준에서 충분함
 */
const LAND_BOUNDING_BOXES = [
  // 북아메리카
  { latMin: 25, latMax: 72, lonMin: -168, lonMax: -52 },
  // 남아메리카
  { latMin: -56, latMax: 13, lonMin: -82, lonMax: -34 },
  // 유럽
  { latMin: 36, latMax: 71, lonMin: -10, lonMax: 40 },
  // 아프리카
  { latMin: -35, latMax: 37, lonMin: -18, lonMax: 52 },
  // 아시아 서부 + 중동
  { latMin: 12, latMax: 72, lonMin: 26, lonMax: 70 },
  // 아시아 동부
  { latMin: 18, latMax: 72, lonMin: 70, lonMax: 145 },
  // 동남아시아
  { latMin: -10, latMax: 28, lonMin: 95, lonMax: 145 },
  // 오세아니아
  { latMin: -45, latMax: -10, lonMin: 113, lonMax: 154 },
  // 그린란드
  { latMin: 59, latMax: 84, lonMin: -74, lonMax: -12 },
];

function getRandomLandCoordinates() {
  const box = LAND_BOUNDING_BOXES[Math.floor(Math.random() * LAND_BOUNDING_BOXES.length)];
  const lat = parseFloat((Math.random() * (box.latMax - box.latMin) + box.latMin).toFixed(6));
  const lon = parseFloat((Math.random() * (box.lonMax - box.lonMin) + box.lonMin).toFixed(6));
  return { lat, lon };
}

module.exports = { getRandomLandCoordinates };
