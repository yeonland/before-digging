// 국가유산 공간정보서비스(gis-heritage.go.kr) WFS 공통 모듈 (문화유적분포지도, 국가유산조사구역)
// 공식 안내(checkKey.do)는 WMS 이미지용이라, 도형 데이터는 연결된 내부 서비스 주소로 직접 요청
const SERVICE_URL = 'https://gis-heritage.go.kr/o2mapweb_i/services';
const SITE_LAYER = 'CHL_UNGR_AS'; // 문화유적분포지도 (안내 페이지 코드 TB_SHOV_MID)

// 국가유산조사구역 (안내 페이지 코드 TB_ERHT_MID) - 속성으로 보아 아래와 같이 나뉨
const SURVEY_LAYERS = [
    { layer: 'CHL_EXCA_AS', kind: 'excavation', nameKey: 'EXCA_NM', reportKey: 'BOOK_NM' }, // 발굴·시굴·입회조사
    { layer: 'CHL_REPO_AS', kind: 'surface', nameKey: 'REPO_NM', reportKey: 'BOOK_NM' }, // 지표조사
    { layer: 'CHL_REHE_AS', kind: 'surfaceSite', nameKey: 'REHE_NM', reportKey: 'REF_BK' } // 지표조사로 확인된 유적
];

// bbox: [서쪽 경도, 남쪽 위도, 동쪽 경도, 북쪽 위도]
async function fetchLayer(layer, bbox, maxFeatures) {
    const params = new URLSearchParams({
        service: 'WFS',
        version: '1.1.0',
        request: 'GetFeature',
        typeName: layer,
        srsName: 'EPSG:4326',
        bbox: bbox.join(','),
        outputFormat: 'application/json',
        maxFeatures: String(maxFeatures)
    });

    const response = await fetch(`${SERVICE_URL}?${params.toString()}`);

    if (!response.ok) {
        throw new Error(`국가유산 공간정보 응답 오류(${layer}): ${response.status}`);
    }

    const data = await response.json();

    return data.features.map((feature) => ({
        geometry: {
            type: feature.geometry.type,
            coordinates: roundCoordinates(feature.geometry.coordinates)
        },
        properties: feature.properties
    }));
}

async function fetchSites(bbox, maxFeatures) {
    const features = await fetchLayer(SITE_LAYER, bbox, maxFeatures);

    return features.map((feature) => ({
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
            id: feature.properties.GID,
            name: feature.properties.UNGR_NM,
            area: feature.properties.AREA_NM,
            mapNo: feature.properties.UGMAP_NO
        }
    }));
}

// 보고서 이름("기관, 연도, 제목")과 조사명에서 조사 종류와 연도를 뽑음
function parseReport(report, kind, name) {
    const text = (report || '').trim();
    const yearMatch = text.match(/,\s*((?:19|20)\d{2})\s*년?\s*,/);
    const source = `${text} ${name || ''}`;
    let method;

    if (kind !== 'excavation') {
        method = kind === 'surface' ? '지표조사' : '지표조사 확인 유적';
    } else if (/정밀\s*발굴/.test(source)) {
        method = '정밀발굴조사';
    } else if (/발\s*\(\s*시\s*\)\s*굴/.test(source)) {
        method = '발굴·시굴조사';
    } else if (/시굴/.test(source)) {
        method = '시굴조사';
    } else if (/표본/.test(source)) {
        method = '표본조사';
    } else if (/입회/.test(source)) {
        method = '입회조사';
    } else {
        method = '발굴조사';
    }

    return { method, year: yearMatch ? Number(yearMatch[1]) : null, report: text };
}

// 지표조사 구역의 유적 유무(EXIST_YN): Y 있음, N 없음, 그 밖(H 등)은 뜻이 확인되지 않아 null
function parseSiteFound(value) {
    if (value === 'Y') return true;
    if (value === 'N') return false;
    return null;
}

// 세 조사구역 레이어를 한 번에 받아 공통 형태로 반환 (레이어 하나가 실패하면 전체 실패로 봄)
async function fetchSurveys(bbox, maxFeatures) {
    const results = await Promise.all(
        SURVEY_LAYERS.map(async ({ layer, kind, nameKey, reportKey }) => {
            const features = await fetchLayer(layer, bbox, maxFeatures);
            return features.map((feature) => ({
                kind,
                name: (feature.properties[nameKey] || '').trim(),
                ...parseReport(feature.properties[reportKey], kind, feature.properties[nameKey]),
                ...(kind === 'surface' ? { siteFound: parseSiteFound(feature.properties.EXIST_YN) } : {}),
                geometry: feature.geometry
            }));
        })
    );

    return results.flat();
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

module.exports = { fetchSites, fetchSurveys, isPointInGeometry };
