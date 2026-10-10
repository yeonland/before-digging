// 주변 시추공의 지반 고도 (국토교통부 지반정보 시추공, scripts/update-boreholes.mjs로 만든 data/boreholes.bin.gz)
// - 굴착 깊이 계산의 지반 해발 참고값. 측량값이 아니고 시추 당시 지반이라 그 뒤 성토·절토로 달라졌을 수 있음
// - 파일은 함수가 처음 불릴 때 한 번만 읽어 둠 (약 3MB, 32만 곳)
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { isPointInGeometry } = require('./_heritage-gis');
const meta = require('../data/boreholes-meta.json');

// scripts/update-boreholes.mjs와 같은 값
const CELL = 0.01;
const COORD_SCALE = 1e6;
const VALUE_SCALE = 100;

const BOREHOLE_RADIUS = 300; // 이 거리(m) 안의 시추공만
const BOREHOLE_LIMIT = 5;

let index = null;

// 칸(약 1km) → 그 칸 시추공의 [시작, 끝] 위치. 파일이 칸 순서로 정렬돼 있음
function load() {
    if (index) return index;
    const buffer = zlib.gunzipSync(fs.readFileSync(path.join(__dirname, '..', 'data', 'boreholes.bin.gz')));
    const data = new Int32Array(buffer.buffer, buffer.byteOffset, buffer.byteLength / 4);
    const cells = new Map();
    for (let i = 0; i < data.length; i += 4) {
        const key = `${Math.floor(data[i + 1] / COORD_SCALE / CELL)},${Math.floor(data[i] / COORD_SCALE / CELL)}`;
        const range = cells.get(key);
        if (range) range[1] = i + 4;
        else cells.set(key, [i, i + 4]);
    }
    index = { data, cells };
    return index;
}

function getRings(geometry) {
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.flat(1);
}

// 시추공(점)에서 경계까지 거리(m). 경계 안이면 0
function distanceToGeometry(lng, lat, geometry) {
    if (isPointInGeometry(lng, lat, geometry)) return 0;
    const kx = 111320 * Math.cos((lat * Math.PI) / 180);
    const ky = 110540;
    let min = Infinity;
    for (const ring of getRings(geometry)) {
        for (let i = 1; i < ring.length; i++) {
            const ax = (ring[i - 1][0] - lng) * kx;
            const ay = (ring[i - 1][1] - lat) * ky;
            const bx = (ring[i][0] - lng) * kx;
            const by = (ring[i][1] - lat) * ky;
            const dx = bx - ax;
            const dy = by - ay;
            const lengthSquared = dx * dx + dy * dy;
            const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, -(ax * dx + ay * dy) / lengthSquared));
            min = Math.min(min, Math.hypot(ax + t * dx, ay + t * dy));
        }
    }
    return min;
}

// 경계(필지·사업부지)에서 가까운 시추공. 자료를 못 읽으면 null
function nearbyBoreholes(geometry) {
    try {
        const { data, cells } = load();
        const points = getRings(geometry).flat();
        const lngs = points.map(([lng]) => lng);
        const lats = points.map(([, lat]) => lat);
        const latPad = BOREHOLE_RADIUS / 110540;
        const lngPad = BOREHOLE_RADIUS / (111320 * Math.cos((Math.min(...lats) * Math.PI) / 180));
        const [minX, maxX] = [Math.floor((Math.min(...lngs) - lngPad) / CELL), Math.floor((Math.max(...lngs) + lngPad) / CELL)];
        const [minY, maxY] = [Math.floor((Math.min(...lats) - latPad) / CELL), Math.floor((Math.max(...lats) + latPad) / CELL)];

        const found = [];
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                const range = cells.get(`${y},${x}`);
                if (!range) continue;
                for (let i = range[0]; i < range[1]; i += 4) {
                    const lng = data[i] / COORD_SCALE;
                    const lat = data[i + 1] / COORD_SCALE;
                    const distance = distanceToGeometry(lng, lat, geometry);
                    if (distance <= BOREHOLE_RADIUS) {
                        found.push({
                            distance: Math.round(distance),
                            elevation: data[i + 2] / VALUE_SCALE,
                            depth: data[i + 3] / VALUE_SCALE
                        });
                    }
                }
            }
        }

        return {
            radius: BOREHOLE_RADIUS,
            baseDate: meta.modified,
            items: found.sort((a, b) => a.distance - b.distance).slice(0, BOREHOLE_LIMIT)
        };
    } catch (error) {
        console.error('시추공 자료 읽기 오류:', error);
        return null;
    }
}

module.exports = { nearbyBoreholes };
