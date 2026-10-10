// 외부 데이터 장애 점검: 서비스가 쓰는 공공데이터를 자료가 확실히 있는 위치로 한 번씩 불러 봄
// - VWorld와 국가유산청 서버가 해외 접속을 막을 때가 있어 서울 리전의 이 함수에서 확인
// - scripts/check-health.mjs가 매일 불러서, 실패하면 GitHub 이슈를 만듦
// - 결과가 비어 있어도 실패로 봄 (응답 형식이나 레이어 이름이 바뀌면 빈 결과가 오기 쉬움)
const { fetchVworldFeatures } = require('./_lib/analyze');
const {
    fetchSites,
    fetchSurveys,
    fetchAllowanceZones,
    fetchDesignated,
    fetchAllowanceCriteria,
    fetchWorldHeritage
} = require('./_lib/heritage-gis');

const TIMEOUT_MS = 20000;

// 점검 위치: 자료가 확실히 있는 곳
const GYEONGBOKGUNG = { lat: 37.5786, lng: 126.977 }; // 경복궁 근정전 (국가유산 구역, 필지)
const JONGMYO = { lat: 37.5746, lng: 126.994 }; // 종묘 (세계유산)
const GYEONGJU_BBOX = [129.222, 35.83, 129.227, 35.835]; // 경주 월성 주변 (유적·조사 이력·허용기준)

const bboxAround = ({ lat, lng }, d) => [lng - d, lat - d, lng + d, lat + d];

function expectSome(items, what) {
    if (!items || items.length === 0) {
        throw new Error(`${what}이(가) 하나도 오지 않았습니다 (자료나 응답 형식이 바뀌었을 수 있음)`);
    }
    return `${items.length}건`;
}

// 지도 화면과 같은 좌표계(EPSG:3857)로 요청
function toWebMercatorBbox([minLng, minLat, maxLng, maxLat]) {
    const R = 6378137;
    const x = (lng) => (lng * Math.PI * R) / 180;
    const y = (lat) => R * Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360));
    return [x(minLng), y(minLat), x(maxLng), y(maxLat)];
}

async function checkWms(apiKey, domain) {
    const params = new URLSearchParams({
        service: 'WMS',
        request: 'GetMap',
        version: '1.3.0',
        layers: 'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun',
        styles: '',
        format: 'image/png',
        transparent: 'true',
        width: '256',
        height: '256',
        crs: 'EPSG:3857',
        bbox: toWebMercatorBbox(bboxAround(GYEONGBOKGUNG, 0.0005)).join(','),
        key: apiKey,
        domain
    });
    const response = await fetch(`https://api.vworld.kr/req/wms?${params}`);
    const contentType = response.headers.get('content-type') || '';

    if (!response.ok || !contentType.startsWith('image/')) {
        const text = (await response.text()).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        throw new Error(`이미지가 아닌 응답 (${response.status}, ${contentType}) ${text.slice(0, 150)}`);
    }
    return '이미지 정상';
}

async function checkSearch(apiKey, domain) {
    const params = new URLSearchParams({
        service: 'search',
        request: 'search',
        version: '2.0',
        crs: 'EPSG:4326',
        size: '1',
        page: '1',
        query: '종로구 세종로 1-1',
        type: 'address',
        category: 'parcel',
        format: 'json',
        errorformat: 'json',
        key: apiKey,
        domain
    });
    const response = await fetch(`https://api.vworld.kr/req/search?${params}`);
    const body = await response.json();
    const status = body.response && body.response.status;

    if (!response.ok || status !== 'OK') {
        throw new Error(`검색 응답 오류 (${response.status} ${status})`);
    }
    return expectSome(body.response.result.items, '검색 결과');
}

// 국가유산 지정 유산을 찾아 허용기준 팝업까지 열어 봄
async function checkAllowanceCriteria() {
    const designated = await fetchDesignated(bboxAround(GYEONGBOKGUNG, 0.001), 10);
    expectSome(designated, '경복궁 주변 지정유산');

    for (const { code } of designated) {
        const criteria = await fetchAllowanceCriteria(code);
        if (criteria && criteria.zones.length > 0) {
            return `구역 ${criteria.zones.length}개`;
        }
    }
    throw new Error('허용기준 팝업에서 기준표를 읽지 못했습니다 (페이지 구조가 바뀌었을 수 있음)');
}

function withTimeout(promise) {
    let timer;
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error(`${TIMEOUT_MS / 1000}초 안에 응답이 없습니다`)), TIMEOUT_MS);
        })
    ]).finally(() => clearTimeout(timer));
}

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ message: 'GET 요청만 사용할 수 있습니다.' });
    }

    const apiKey = process.env.VWORLD_API_KEY;
    const domain = process.env.VWORLD_DOMAIN || `https://${req.headers.host}`;
    const point = ({ lat, lng }) => `POINT(${lng} ${lat})`;

    const checks = [
        {
            id: 'vworld-parcel',
            name: 'VWorld 연속지적도 (필지 진단)',
            run: async () => expectSome(await fetchVworldFeatures('LP_PA_CBND_BUBUN', point(GYEONGBOKGUNG), apiKey, domain), '필지')
        },
        {
            id: 'vworld-zones',
            name: 'VWorld 국가유산 지정/보호구역',
            run: async () => expectSome(await fetchVworldFeatures('LT_C_UO301', point(GYEONGBOKGUNG), apiKey, domain), '국가유산 구역')
        },
        { id: 'vworld-wms', name: 'VWorld 지적도 이미지', run: () => checkWms(apiKey, domain) },
        { id: 'vworld-search', name: 'VWorld 주소 검색', run: () => checkSearch(apiKey, domain) },
        {
            id: 'heritage-sites',
            name: '국가유산청 문화유적분포지도',
            run: async () => expectSome(await fetchSites(GYEONGJU_BBOX, 50), '문화유적 분포 범위')
        },
        {
            id: 'heritage-surveys',
            name: '국가유산청 국가유산조사구역 (발굴·지표조사)',
            run: async () => expectSome(await fetchSurveys(GYEONGJU_BBOX, 50), '조사구역')
        },
        {
            id: 'heritage-allowance-zones',
            name: '국가유산청 현상변경 허용기준 구역',
            run: async () => expectSome(await fetchAllowanceZones(GYEONGJU_BBOX, 50), '허용기준 구역')
        },
        { id: 'heritage-allowance-criteria', name: '국가유산청 허용기준 내용 (팝업 페이지)', run: checkAllowanceCriteria },
        {
            id: 'heritage-world',
            name: '국가유산청 세계유산 구역',
            run: async () => expectSome(await fetchWorldHeritage(bboxAround(JONGMYO, 0.001), 10), '세계유산 구역')
        }
    ];

    if (!apiKey) {
        return res.status(500).json({ message: 'VWorld API 키가 설정되지 않았습니다.' });
    }

    const results = await Promise.all(
        checks.map(async ({ id, name, run }) => {
            const started = Date.now();
            try {
                const detail = await withTimeout(run());
                return { id, name, ok: true, ms: Date.now() - started, detail };
            } catch (error) {
                const message = String((error && error.message) || error).replaceAll(apiKey, '***');
                return { id, name, ok: false, ms: Date.now() - started, detail: message };
            }
        })
    );

    res.setHeader('Cache-Control', 'no-store');

    return res.status(200).json({
        ok: results.every((result) => result.ok),
        checkedAt: new Date().toISOString(),
        checks: results
    });
};
