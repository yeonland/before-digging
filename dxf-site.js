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

    // DXF에서 닫힌 폴리라인을 레이어별로 모음
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

        return { layers };
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

    window.dxfSite = { CRS_LIST, decodeDxf, readBoundaries, crsCandidates, toGeometry };
})();
