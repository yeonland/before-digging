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
// where: { 속성 이름: 값 } (주면 bbox 대신 속성이 같은 것만 받음)
async function fetchLayer(layer, bbox, maxFeatures, where) {
    const params = new URLSearchParams({
        service: 'WFS',
        version: '1.1.0',
        request: 'GetFeature',
        typeName: layer,
        srsName: 'EPSG:4326',
        outputFormat: 'application/json',
        maxFeatures: String(maxFeatures)
    });
    if (where) {
        const [[name, value]] = Object.entries(where);
        params.set('filter', `<Filter xmlns="http://www.opengis.net/ogc"><PropertyIsEqualTo><PropertyName>${name}</PropertyName><Literal>${value}</Literal></PropertyIsEqualTo></Filter>`);
    } else {
        params.set('bbox', bbox.join(','));
    }

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

// ---------------------------------------------------------------
// 현상변경 허용기준 (안내 페이지 코드 TB_HRNR_MID)
// 구역 도형(CHL_PMPG_AS)에는 구역 이름(1구역, 2-1구역 등)과 허용기준 묶음 번호(PMPG_SEID)만 있고
// 어느 국가유산의 기준인지, 기준 내용은 없음. 기준 내용은 국가유산 코드로 여는 팝업 페이지에만 있어서
// 주변 지정유산을 찾아 팝업을 열어 보고, 묶음 번호가 같은 것을 고름
// ---------------------------------------------------------------
const ALLOWANCE_LAYER = 'CHL_PMPG_AS';
const DESIGNATED_LAYERS = ['CHL_SPCN_AS', 'CHL_SPCL_AS', 'CHL_REGS_AS', 'CHL_REGL_AS']; // 국가지정, 시도지정, 국가등록, 시도등록
const CRITERIA_URL = 'https://gis-heritage.go.kr/user/gischa/NewGisChaSecGAcceptanceCriteria.do';

// bbox 안의 허용기준 구역, 또는 seid를 주면 그 묶음의 구역 전체
async function fetchAllowanceZones(bbox, maxFeatures, seid) {
    const features = await fetchLayer(ALLOWANCE_LAYER, bbox, maxFeatures, seid ? { PMPG_SEID: seid } : null);

    return features.map((feature) => ({
        type: 'Feature',
        geometry: feature.geometry,
        properties: {
            id: feature.properties.GID,
            seid: feature.properties.PMPG_SEID,
            zoneCode: feature.properties.ZON_CD,
            zone: feature.properties.ZON_NM
        }
    }));
}

async function fetchDesignated(bbox, maxFeatures) {
    const results = await Promise.all(
        DESIGNATED_LAYERS.map((layer) => fetchLayer(layer, bbox, maxFeatures))
    );

    return results.flat().map((feature) => ({
        code: feature.properties.CP_CD,
        name: feature.properties.CPH_FULL_NM || feature.properties.CPH_NM,
        geometry: feature.geometry
    }));
}

// 팝업 HTML의 칸 내용을 글자로 (ㅇ 표시와 줄바꿈 정리)
function cellText(html) {
    return html
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .split('\n')
        .map((line) => line.replace(/^\s*[ㅇ∘○·]\s*/, '').trim())
        .filter(Boolean);
}

// 국가유산 코드로 허용기준 팝업을 열어 구역별 기준과 공통 기준을 읽음 (기준이 없으면 null)
async function fetchAllowanceCriteria(code) {
    const response = await fetch(CRITERIA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ cpCd: code }).toString()
    });

    if (!response.ok) {
        throw new Error(`허용기준 응답 오류: ${response.status}`);
    }

    const html = await response.text();
    const seidMatch = html.match(/id="hidden_pmpgSeid"\s+value="([^"]+)"/);
    const tbody = (html.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1];
    if (!seidMatch || !tbody) return null;

    const zones = [];
    let common = [];
    for (const [, row] of tbody.matchAll(/<tr>([\s\S]*?)<\/tr>/g)) {
        const cells = [...row.matchAll(/<td([^>]*)>([\s\S]*?)<\/td>/g)];
        if (cells.length === 0) continue;
        const label = cellText(cells[0][2]).join(' ');

        if (label === '공통') {
            common = cellText(cells[2] ? cells[2][2] : '');
            continue;
        }

        // 칸: 구역, 범례, (평슬라브, 경사지붕 | 두 칸 합친 기준), 이동 버튼(구역 도형 번호)
        const ruleCells = cells.slice(2).filter(([, , inner]) => !/markerbox/.test(inner));
        const ids = [...row.matchAll(/mapMove\('CHL_PMPG_AS','gid','(\d+)'\)/g)].map((match) => Number(match[1]));
        const flat = cellText(ruleCells[0] ? ruleCells[0][2] : '');
        const merged = ruleCells[0] && /colspan="2"/.test(ruleCells[0][1]);
        const slope = merged ? flat : cellText(ruleCells[1] ? ruleCells[1][2] : '');

        zones.push({ zone: label, ids, flat, slope });
    }

    return { seid: seidMatch[1], zones, common };
}

// ---------------------------------------------------------------
// 세계유산 (국가유산공간정보서비스 세계유산지구 메뉴)
// - CHL_WORM_AS: 등재 때 정한 세계유산 구역(core)과 완충구역(buffer)
// - CHL_WORS_AS: 세계유산법 제10조로 고시된 세계유산지구 (2026년 기준 종묘만 있음)
// ---------------------------------------------------------------
// 원본 자료의 오타 바로잡기
const WORLD_NAMES = { 경사역사유적지구: '경주역사유적지구' };
const worldName = (name) => WORLD_NAMES[name] || name;

async function fetchWorldHeritage(bbox, maxFeatures) {
    const [registered, districts] = await Promise.all([
        fetchLayer('CHL_WORM_AS', bbox, maxFeatures),
        fetchLayer('CHL_WORS_AS', bbox, maxFeatures)
    ]);

    return [
        ...registered.map((feature) => ({
            type: 'Feature',
            geometry: feature.geometry,
            properties: {
                id: `m${feature.properties.GID}`,
                name: worldName(feature.properties.WORM_NM),
                kind: feature.properties.WORM_TP === 'buffer' ? 'buffer' : 'core'
            }
        })),
        ...districts.map((feature) => ({
            type: 'Feature',
            geometry: feature.geometry,
            properties: {
                id: `s${feature.properties.GID}`,
                name: worldName(feature.properties.WORM_NM),
                kind: 'district'
            }
        }))
    ];
}

module.exports = {
    fetchSites,
    fetchWorldHeritage,
    fetchSurveys,
    fetchAllowanceZones,
    fetchDesignated,
    fetchAllowanceCriteria,
    isPointInGeometry
};
