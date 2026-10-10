// 도면(DXF)으로 올린 사업부지 진단
// - GET  ?points=경도,위도|경도,위도…  : 좌표계 후보마다 그 지점의 필지 주소 (좌표계 고르기 화면용)
// - POST { geometry }                 : 사업부지 경계(WGS84 Polygon/MultiPolygon) 전체 진단 + 걸친 필지별 진단
// 국가유산 자료는 부지 전체 범위로 한 번만 받아서 부지와 각 필지에 재사용함
const { area } = require('@turf/area');
const { feature } = require('@turf/helpers');
const {
    EDGE_OVERLAP_AREA,
    fetchVworldFeatures,
    fetchAreaData,
    analyze,
    clipAreaData,
    getBbox,
    getOverlap,
    roundArea
} = require('./_lib/analyze');

// 너무 넓은 부지는 외부 자료 요청이 많아져 거절 (서비스 기준)
const MAX_SITE_AREA = 2000000; // 2㎢
const MAX_PARCELS = 300;
const MAX_POINTS = 30; // 좌표계 13개 × 두 가지 좌표 순서

function inKorea([lng, lat]) {
    return Number.isFinite(lng) && Number.isFinite(lat) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

function isValidGeometry(geometry) {
    if (!geometry || !['Polygon', 'MultiPolygon'].includes(geometry.type) || !Array.isArray(geometry.coordinates)) {
        return false;
    }
    const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.length > 0 && polygons.every((rings) =>
        Array.isArray(rings) && rings.length > 0 && rings.every((ring) =>
            Array.isArray(ring) && ring.length >= 4 && ring.every((point) => Array.isArray(point) && inKorea(point))
        )
    );
}

// 좌표계 후보 지점마다 필지 주소를 찾음 (지적도에 없으면 null)
async function locate(req, res, apiKey, registeredDomain) {
    const points = String(req.query.points || '')
        .split('|')
        .filter(Boolean)
        .slice(0, MAX_POINTS)
        .map((text) => text.split(',').map(Number));

    const results = await Promise.all(points.map(async (point) => {
        if (!inKorea(point)) return null;
        try {
            const parcels = await fetchVworldFeatures('LP_PA_CBND_BUBUN', `POINT(${point[0]} ${point[1]})`, apiKey, registeredDomain);
            return parcels[0] ? parcels[0].properties.addr : null;
        } catch (error) {
            console.error('후보 지점 필지 조회 오류:', error);
            return null;
        }
    }));

    return res.status(200).json({ addresses: results });
}

module.exports = async function handler(req, res) {
    const apiKey = process.env.VWORLD_API_KEY;
    const registeredDomain =
        process.env.VWORLD_DOMAIN || `https://${req.headers.host}`;

    if (!apiKey) {
        return res.status(500).json({ message: 'VWorld API 키가 설정되지 않았습니다.' });
    }

    if (req.method === 'GET') {
        return locate(req, res, apiKey, registeredDomain);
    }

    if (req.method !== 'POST') {
        res.setHeader('Allow', 'GET, POST');
        return res.status(405).json({ message: 'GET 또는 POST 요청만 사용할 수 있습니다.' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const geometry = body.geometry;

    if (!isValidGeometry(geometry)) {
        return res.status(400).json({ message: '사업부지 경계가 올바르지 않습니다.' });
    }

    const siteFeature = feature(geometry);
    const siteArea = area(siteFeature);

    if (siteArea > MAX_SITE_AREA) {
        return res.status(400).json({
            message: `사업부지가 너무 넓어요 (${Math.round(siteArea).toLocaleString('ko-KR')}㎡). ${MAX_SITE_AREA.toLocaleString('ko-KR')}㎡ 이하로 나눠서 올려 주세요.`
        });
    }

    const bbox = getBbox(geometry);

    // 부지 범위의 필지를 받아 부지와 실제로 겹치는 것만 남김
    let parcels;
    try {
        parcels = await fetchVworldFeatures(
            'LP_PA_CBND_BUBUN',
            `BOX(${bbox.join(',')})`,
            apiKey,
            registeredDomain,
            { size: 1000, maxPages: 3 }
        );
    } catch (error) {
        console.error('부지 필지 조회 오류:', error);
        return res.status(502).json({ message: '필지 정보를 불러오지 못했습니다.' });
    }

    const inSite = parcels
        .map((parcel) => {
            const parcelFeature = feature(parcel.geometry);
            const overlap = getOverlap(siteFeature, parcel.geometry);
            return { parcel, parcelFeature, inSiteArea: overlap ? area(overlap) : 0 };
        })
        .filter((item) => item.inSiteArea >= EDGE_OVERLAP_AREA)
        .sort((a, b) => b.inSiteArea - a.inSiteArea);

    if (inSite.length > MAX_PARCELS) {
        return res.status(400).json({
            message: `부지에 걸친 필지가 너무 많아요 (${inSite.length}필지). ${MAX_PARCELS}필지 이하로 나눠서 올려 주세요.`
        });
    }

    // 자료는 부지와 걸친 필지 전체를 덮는 범위로 한 번만 받음 (필지가 부지 밖으로 삐져나와도 포함)
    const parcelBoxes = inSite.map((item) => getBbox(item.parcel.geometry));
    const dataBbox = [
        Math.min(bbox[0], ...parcelBoxes.map((box) => box[0])),
        Math.min(bbox[1], ...parcelBoxes.map((box) => box[1])),
        Math.max(bbox[2], ...parcelBoxes.map((box) => box[2])),
        Math.max(bbox[3], ...parcelBoxes.map((box) => box[3]))
    ];
    const data = clipAreaData(await fetchAreaData(dataBbox, apiKey, registeredDomain, { wide: true }), dataBbox);

    const siteResult = await analyze(siteFeature, data);
    const parcelResults = [];
    for (const item of inSite) {
        const result = await analyze(item.parcelFeature, data);
        parcelResults.push({
            parcel: {
                pnu: item.parcel.properties.pnu,
                address: item.parcel.properties.addr,
                jibun: item.parcel.properties.jibun,
                area: roundArea(area(item.parcelFeature)),
                inSiteArea: roundArea(item.inSiteArea),
                geometry: item.parcelFeature.geometry
            },
            ...result
        });
    }

    return res.status(200).json({
        site: {
            area: roundArea(siteArea),
            parcelCount: parcelResults.length,
            parcelsTruncated: Boolean(parcels.truncated),
            geometry
        },
        result: siteResult,
        parcels: parcelResults
    });
};
