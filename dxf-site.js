// 도면(DXF) 파일에서 사업부지 경계를 읽어 지도 좌표(경위도)로 바꾸는 규칙
// - 도면은 브라우저 안에서만 읽고 서버로 보내지 않음 (경계 좌표만 보냄)
// - DXF에는 좌표계 정보가 없어서, 후보 좌표계마다 위치를 계산해 사용자가 고르게 함
// 필요한 라이브러리: DxfParser(dxf-parser), proj4
(function () {
    // 우리나라 측량 도면에 쓰는 좌표계 (EPSG 번호, 이름, proj4 정의)
    // 같은 숫자 좌표라도 원점(기준 경도)에 따라 수백 km 떨어진 곳이 되므로 모두 후보로 계산
    const CRS_LIST = [
        { code: 5186, name: '중부원점', note: 'GRS80, 2010년 이후 기준', def: '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs' },
        { code: 5187, name: '동부원점', note: 'GRS80, 2010년 이후 기준', def: '+proj=tmerc +lat_0=38 +lon_0=129 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs' },
        { code: 5185, name: '서부원점', note: 'GRS80, 2010년 이후 기준', def: '+proj=tmerc +lat_0=38 +lon_0=125 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs' },
        { code: 5188, name: '동해원점', note: 'GRS80, 2010년 이후 기준', def: '+proj=tmerc +lat_0=38 +lon_0=131 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs' },
        { code: 5181, name: '중부원점 (북쪽 가산 50만)', note: 'GRS80, 2002년 기준', def: '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs' },
        { code: 5183, name: '동부원점 (북쪽 가산 50만)', note: 'GRS80, 2002년 기준', def: '+proj=tmerc +lat_0=38 +lon_0=129 +k=1 +x_0=200000 +y_0=500000 +ellps=GRS80 +units=m +no_defs' },
        { code: 5174, name: '중부원점 (베셀)', note: '옛 지적도 기준', def: '+proj=tmerc +lat_0=38 +lon_0=127.002890277778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-145.907,505.034,685.756,-1.162,2.347,1.592,6.342 +units=m +no_defs' },
        { code: 5176, name: '동부원점 (베셀)', note: '옛 지적도 기준', def: '+proj=tmerc +lat_0=38 +lon_0=129.002890277778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-145.907,505.034,685.756,-1.162,2.347,1.592,6.342 +units=m +no_defs' },
        { code: 5173, name: '서부원점 (베셀)', note: '옛 지적도 기준', def: '+proj=tmerc +lat_0=38 +lon_0=125.002890277778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel +towgs84=-145.907,505.034,685.756,-1.162,2.347,1.592,6.342 +units=m +no_defs' },
        { code: 5179, name: 'UTM-K', note: '전국 하나의 좌표계 (네이버·국토지리정보원 일부)', def: '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs' }
    ];

    // 좌표가 이보다 크면 mm 단위로 그린 도면으로 보고 1000으로 나눔 (m 단위 측량 좌표는 최대 수백만)
    const MM_THRESHOLD = 5000000;

    // 닫힌 선으로 볼 때 처음과 끝 점의 허용 거리 (도면 단위)
    const CLOSE_TOLERANCE = 0.01;

    function inKorea([lng, lat]) {
        return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
    }

    // 파일 내용을 글자로: 2007 이후 DXF는 UTF-8, 그 전 한글 도면은 EUC-KR(코드페이지 949)
    function decodeDxf(buffer) {
        const utf8 = new TextDecoder('utf-8').decode(buffer);
        if (!utf8.includes('�')) return utf8;
        try {
            return new TextDecoder('euc-kr').decode(buffer);
        } catch (error) {
            return utf8;
        }
    }

    // 다각형 넓이 (도면 단위, 신발끈 공식)
    function ringArea(ring) {
        let sum = 0;
        for (let i = 0; i < ring.length; i++) {
            const [x1, y1] = ring[i];
            const [x2, y2] = ring[(i + 1) % ring.length];
            sum += x1 * y2 - x2 * y1;
        }
        return Math.abs(sum) / 2;
    }

    // ---------------------------------------------------------------
    // 표고(지반 해발) 읽기: 측량 현황도의 표고점 글자, 높이 값이 있는 점·블록·등고선
    // ---------------------------------------------------------------
    // 표고가 들어 있을 만한 레이어 이름
    const ELEVATION_LAYER = /표고|지반|레벨|높이|등고|level|elev|spot|height|contour|topo|^el$|^gl$|^fh$|[-_ ](el|gl|fh)$|^(el|gl|fh)[-_ ]/i;
    // 글자 자체에 표고 표시가 붙은 경우 (EL 35.20, GL=35.2, 표고 35.20, ▽35.20)
    const ELEVATION_PREFIX = /^(?:EL|GL|FH|FL|H|표고|지반고|▽|▼)\s*[=:.+]?\s*(-?\d{1,4}(?:\.\d{1,3})?)\s*m?$/i;
    const PLAIN_NUMBER = /^[+]?(-?\d{1,4}\.\d{1,3})$/;
    // 우리나라 지반 해발로 볼 수 있는 범위 (m)
    const ELEVATION_RANGE = [-20, 2000];

    function inElevationRange(value) {
        return Number.isFinite(value) && value >= ELEVATION_RANGE[0] && value <= ELEVATION_RANGE[1];
    }

    // MTEXT 서식 코드(\P 줄바꿈, \fArial; 같은 글꼴 지정 등)와 중괄호를 뺀 글자
    function plainText(text) {
        return String(text || '')
            .replace(/\\[A-OQ-Za-z][^;\\]*;/g, '')
            .replace(/\\P/g, ' ')
            .replace(/[{}]/g, '')
            .trim();
    }

    function textElevation(text, layer) {
        const clean = plainText(text);
        const prefixed = clean.match(ELEVATION_PREFIX);
        if (prefixed) return Number(prefixed[1]);
        const plain = clean.match(PLAIN_NUMBER);
        // 숫자만 있는 글자는 치수·지번일 수도 있어서 표고 레이어에 있을 때만
        if (plain && ELEVATION_LAYER.test(layer || '')) return Number(plain[1]);
        return null;
    }

    // 도면 전체에서 표고 후보를 모음: { x, y, z, kind: 'text' | 'point' | 'contour' }
    function readElevations(dxf) {
        const found = [];
        // 높이 범위는 단위(mm)를 맞춘 뒤 siteElevation에서 확인
        const add = (x, y, z, kind) => {
            if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z) && z !== 0) found.push({ x, y, z, kind });
        };

        (dxf.entities || []).forEach((entity) => {
            const layer = entity.layer || '';
            if (['TEXT', 'MTEXT', 'ATTRIB'].includes(entity.type)) {
                const position = entity.startPoint || entity.position || {};
                const value = textElevation(entity.text, layer);
                if (value !== null) add(position.x, position.y, value, 'text');
            } else if (entity.type === 'POINT' || entity.type === 'INSERT') {
                // 표고점 블록은 높이(z) 값을 가진 위치에 놓는 경우가 많음
                const position = entity.position || {};
                add(position.x, position.y, position.z, 'point');
            } else if (entity.type === 'LWPOLYLINE' && Number.isFinite(entity.elevation)) {
                // 등고선: 선 전체가 한 높이
                (entity.vertices || []).forEach((vertex) => add(vertex.x, vertex.y, entity.elevation, 'contour'));
            } else if (entity.type === 'POLYLINE' || entity.type === 'LINE') {
                (entity.vertices || []).forEach((vertex) => add(vertex.x, vertex.y, vertex.z, 'contour'));
            }
        });
        return found;
    }

    // 고른 경계 안의 표고로 대표값(중간값)을 정함
    // 표고점 글자가 있으면 그것만 쓰고, 없으면 점·등고선 높이를 씀
    function siteElevation(layer, elevations) {
        if (!elevations || elevations.length === 0) return null;
        const outers = layer.polygons.map(({ ring }) => ring);
        const inside = elevations.filter(({ x, y }) => outers.some((ring) => pointInRing([x, y], ring)));
        const texts = inside.filter((item) => item.kind === 'text');
        const used = texts.length > 0 ? texts : inside;
        if (used.length === 0) return null;

        // mm 단위 도면은 높이 좌표도 mm일 수 있음 (글자로 쓴 표고는 m)
        const values = used
            .map((item) => (item.kind !== 'text' && layer.scale !== 1 ? item.z * layer.scale : item.z))
            .filter(inElevationRange)
            .sort((a, b) => a - b);
        if (values.length === 0) return null;

        const round = (value) => Math.round(value * 100) / 100;
        const middle = Math.floor(values.length / 2);
        const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
        return {
            count: values.length,
            source: texts.length > 0 ? 'text' : 'height',
            min: round(values[0]),
            max: round(values[values.length - 1]),
            median: round(median)
        };
    }

    // DXF에서 닫힌 폴리라인을 레이어별로 모음 (+ 표고 후보)
    function readBoundaries(text) {
        const parser = new window.DxfParser();
        const dxf = parser.parseSync(text);
        const byLayer = new Map();

        (dxf.entities || []).forEach((entity) => {
            if (!['LWPOLYLINE', 'POLYLINE'].includes(entity.type)) return;
            const points = (entity.vertices || [])
                .filter((vertex) => Number.isFinite(vertex.x) && Number.isFinite(vertex.y))
                .map((vertex) => [vertex.x, vertex.y]);
            if (points.length < 3) return;

            const [first, last] = [points[0], points[points.length - 1]];
            const touching = Math.hypot(first[0] - last[0], first[1] - last[1]) <= CLOSE_TOLERANCE;
            if (!entity.shape && !touching) return; // 열린 선(도로 중심선 등)은 경계가 아님

            const ring = touching ? points.slice(0, -1) : points;
            if (ring.length < 3 || ringArea(ring) === 0) return;

            const layer = entity.layer || '0';
            if (!byLayer.has(layer)) byLayer.set(layer, []);
            byLayer.get(layer).push(ring);
        });

        const layers = [...byLayer.entries()].map(([name, rings]) => {
            const maxCoordinate = Math.max(...rings.flat().map(([x, y]) => Math.max(Math.abs(x), Math.abs(y))));
            const scale = maxCoordinate > MM_THRESHOLD ? 0.001 : 1;
            const polygons = nestRings(rings);
            const drawingArea = polygons.reduce((sum, { ring, holes }) =>
                sum + ringArea(ring) - holes.reduce((holeSum, hole) => holeSum + ringArea(hole), 0), 0);
            return { name, rings, polygons, scale, area: drawingArea * scale * scale };
        }).sort((a, b) => b.area - a.area);

        return { layers, elevations: readElevations(dxf) };
    }

    function layerCenter(layer) {
        const points = layer.rings.flat();
        const xs = points.map(([x]) => x * layer.scale);
        const ys = points.map(([, y]) => y * layer.scale);
        return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    }

    // 좌표계마다 레이어 중심이 어디가 되는지 계산 (우리나라 밖이면 뺌)
    function crsCandidates(layer) {
        const center = layerCenter(layer);
        return CRS_LIST
            .map((crs) => ({ ...crs, center: window.proj4(crs.def, 'EPSG:4326', center) }))
            .filter((crs) => inKorea(crs.center));
    }

    // 고른 좌표계로 레이어의 경계를 경위도 GeoJSON(MultiPolygon)으로 바꿈
    function toGeometry(layer, crsCode) {
        const crs = CRS_LIST.find((item) => item.code === crsCode);
        const convert = ([x, y]) => {
            const [lng, lat] = window.proj4(crs.def, 'EPSG:4326', [x * layer.scale, y * layer.scale]);
            return [Math.round(lng * 1e7) / 1e7, Math.round(lat * 1e7) / 1e7];
        };
        const close = (ring) => {
            const converted = ring.map(convert);
            return [...converted, converted[0]];
        };

        return {
            type: 'MultiPolygon',
            coordinates: layer.polygons.map(({ ring, holes }) => [close(ring), ...holes.map(close)])
        };
    }

    // 큰 경계부터 놓고, 다른 경계 안에 들어 있는 경계는 그 경계의 구멍(제외 구역)으로 봄
    function nestRings(rings) {
        const polygons = [];
        [...rings].sort((a, b) => ringArea(b) - ringArea(a)).forEach((ring) => {
            const outer = polygons.find((polygon) => pointInRing(ring[0], polygon.ring));
            if (outer) outer.holes.push(ring);
            else polygons.push({ ring, holes: [] });
        });
        return polygons;
    }

    function pointInRing([x, y], ring) {
        let inside = false;
        for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
            const [xi, yi] = ring[i];
            const [xj, yj] = ring[j];
            if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
        }
        return inside;
    }

    window.dxfSite = { CRS_LIST, decodeDxf, readBoundaries, crsCandidates, toGeometry, siteElevation };
})();
