// 국가유산 공간정보서비스(gis-heritage.go.kr) 문화유적분포지도 WFS 공통 모듈
// 공식 안내(checkKey.do)는 WMS 이미지용이라, 도형 데이터는 연결된 내부 서비스 주소로 직접 요청
const SERVICE_URL = 'https://gis-heritage.go.kr/o2mapweb_i/services';
const SITE_LAYER = 'CHL_UNGR_AS'; // 문화유적분포지도 (안내 페이지 코드 TB_SHOV_MID)

// bbox: [서쪽 경도, 남쪽 위도, 동쪽 경도, 북쪽 위도]
async function fetchSites(bbox, maxFeatures) {
    const params = new URLSearchParams({
        service: 'WFS',
        version: '1.1.0',
        request: 'GetFeature',
        typeName: SITE_LAYER,
        srsName: 'EPSG:4326',
        bbox: bbox.join(','),
        outputFormat: 'application/json',
        maxFeatures: String(maxFeatures)
    });

    const response = await fetch(`${SERVICE_URL}?${params.toString()}`);

    if (!response.ok) {
        throw new Error(`국가유산 공간정보 응답 오류: ${response.status}`);
    }

    const data = await response.json();

    return data.features.map((feature) => ({
        type: 'Feature',
        geometry: {
            type: feature.geometry.type,
            coordinates: roundCoordinates(feature.geometry.coordinates)
        },
        properties: {
            id: feature.properties.GID,
            name: feature.properties.UNGR_NM,
            area: feature.properties.AREA_NM,
            mapNo: feature.properties.UGMAP_NO
        }
    }));
}

// 소수점 6자리(약 10cm)로 줄여 응답 크기 축소
function roundCoordinates(value) {
    if (typeof value === 'number') {
        return Math.round(value * 1e6) / 1e6;
    }
    return value.map(roundCoordinates);
}

function isPointInRing(lng, lat, ring) {
    let inside = false;

    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
        const [xi, yi] = ring[i];
        const [xj, yj] = ring[j];
        const crosses =
            (yi > lat) !== (yj > lat) &&
            lng < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;

        if (crosses) inside = !inside;
    }

    return inside;
}

// Polygon / MultiPolygon 안에 점이 있는지 (구멍 포함)
function isPointInGeometry(lng, lat, geometry) {
    const polygons =
        geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;

    return polygons.some(
        ([outer, ...holes]) =>
            isPointInRing(lng, lat, outer) &&
            !holes.some((hole) => isPointInRing(lng, lat, hole))
    );
}

module.exports = { fetchSites, isPointInGeometry };
