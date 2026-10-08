// 클릭한 위치의 필지를 찾아, 필지와 겹치는 국가유산 구역·문화유적 분포 범위의 면적을 계산
// - parcel: VWorld 연속지적도(LP_PA_CBND_BUBUN)
// - zones: VWorld 국가유산 지정/보호구역(lt_c_uo301)
// - sites: 국가유산청 문화유적분포지도
// - surveys: 국가유산청 국가유산조사구역 (주변 발굴·시굴·지표조사 이력)
const { area } = require('@turf/area');
const { feature, featureCollection } = require('@turf/helpers');
const { intersect } = require('@turf/intersect');
const { union } = require('@turf/union');
const { fetchSites, fetchSurveys, isPointInGeometry } = require('./_heritage-gis');

// 이보다 작은 겹침은 무시 (㎡)
const MIN_OVERLAP_AREA = 1;
// 이보다 작은 겹침은 경계에만 걸친 것으로 표시하고 전체 면적에서 뺌 (지적도와 구역도의 도면 오차 고려, ㎡)
const EDGE_OVERLAP_AREA = 10;
// 주변 문화유적을 찾는 반경과 최대 표시 개수 (법적 기준이 아닌 참고용)
const NEARBY_RADIUS = 500;
const NEARBY_LIMIT = 5;
// 주변 조사 이력 최대 표시 개수
const SURVEY_LIMIT = 10;

// 필지 주변 좁은 범위라 평면으로 근사해 미터 단위 좌표로 바꿈
function toMeters([lng, lat], origin) {
    return [
        (lng - origin[0]) * 111320 * Math.cos((origin[1] * Math.PI) / 180),
        (lat - origin[1]) * 110540
    ];
}

function pointToSegmentDistance(p, a, b) {
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lengthSquared));
    return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

function getRings(geometry) {
    const polygons =
        geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    return polygons.flat(1);
}

// outer 안에 inner의 꼭짓점이 하나라도 있으면 true (한쪽이 다른 쪽을 품는 경우 감지)
function containsAnyVertex(outer, inner) {
    return getRings(inner).some((ring) =>
        ring.some(([lng, lat]) => isPointInGeometry(lng, lat, outer))
    );
}

// 두 다각형 경계 사이의 가장 짧은 거리(m). 겹치는 경우는 겹침 계산에서 따로 처리
function getDistance(geometryA, geometryB, origin) {
    const ringsA = getRings(geometryA).map((ring) => ring.map((point) => toMeters(point, origin)));
    const ringsB = getRings(geometryB).map((ring) => ring.map((point) => toMeters(point, origin)));
    let min = Infinity;

    const measure = (fromRings, toRings) => {
        for (const fromRing of fromRings) {
            for (const point of fromRing) {
                for (const ring of toRings) {
                    for (let i = 1; i < ring.length; i++) {
                        min = Math.min(min, pointToSegmentDistance(point, ring[i - 1], ring[i]));
                    }
                }
            }
        }
    };

    measure(ringsA, ringsB);
    measure(ringsB, ringsA);
    return min;
}

async function fetchVworldFeatures(data, geomFilter, apiKey, registeredDomain) {
    const params = new URLSearchParams({
        service: 'data',
        request: 'GetFeature',
        data,
        key: apiKey,
        domain: registeredDomain,
        format: 'json',
        geometry: 'true',
        attribute: 'true',
        crs: 'EPSG:4326',
        size: '100',
        geomFilter
    });

    const response = await fetch(
        `https://api.vworld.kr/req/data?${params.toString()}`
    );
    const body = await response.json();
    const status = body.response && body.response.status;

    if (status === 'NOT_FOUND') {
        return [];
    }

    if (!response.ok || status !== 'OK') {
        throw new Error(`VWorld 데이터 응답 오류(${data}): ${response.status} ${status}`);
    }

    return body.response.result.featureCollection.features;
}

function getBbox(geometry) {
    const polygons =
        geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const points = polygons.flat(2);
    const lngs = points.map((point) => point[0]);
    const lats = points.map((point) => point[1]);

    return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

// 필지와 겹치는 부분의 도형 (없으면 null)
function getOverlap(parcelFeature, geometry) {
    try {
        return intersect(featureCollection([parcelFeature, feature(geometry)]));
    } catch (error) {
        console.error('겹침 계산 오류:', error);
        return null;
    }
}

// 여러 겹침 도형을 합친 전체 면적 (서로 겹치는 부분은 한 번만 셈)
function getUnionArea(overlaps) {
    if (overlaps.length === 0) return 0;
    if (overlaps.length === 1) return area(overlaps[0]);

    try {
        return area(union(featureCollection(overlaps)));
    } catch (error) {
        console.error('겹침 합치기 오류:', error);
        return Math.max(...overlaps.map((overlap) => area(overlap)));
    }
}

function roundArea(value) {
    return Math.round(value * 10) / 10;
}

// 각 구역과의 겹침을 계산해 겹치는 것만 남김
function measureOverlaps(parcelFeature, items) {
    return items
        .map((item) => ({ ...item, overlap: getOverlap(parcelFeature, item.geometry) }))
        .filter((item) => item.overlap && area(item.overlap) >= MIN_OVERLAP_AREA);
}

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ message: 'GET 요청만 사용할 수 있습니다.' });
    }

    const apiKey = process.env.VWORLD_API_KEY;
    const registeredDomain =
        process.env.VWORLD_DOMAIN || `https://${req.headers.host}`;

    if (!apiKey) {
        return res.status(500).json({
            message: 'VWorld API 키가 설정되지 않았습니다.'
        });
    }

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);

    // 대한민국 범위 밖 좌표는 거절
    if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng) ||
        lat < 33 || lat > 39 ||
        lng < 124 || lng > 132
    ) {
        return res.status(400).json({ message: '잘못된 좌표입니다.' });
    }

    let parcels;

    try {
        parcels = await fetchVworldFeatures(
            'LP_PA_CBND_BUBUN',
            `POINT(${lng} ${lat})`,
            apiKey,
            registeredDomain
        );
    } catch (error) {
        console.error('필지 조회 오류:', error);

        return res.status(502).json({ message: '필지 정보를 불러오지 못했습니다.' });
    }

    // 지적도에 없는 곳(바다 등)
    if (parcels.length === 0) {
        return res.status(200).json({ parcel: null });
    }

    const parcelFeature = feature(parcels[0].geometry);
    const parcelArea = area(parcelFeature);
    const [minLng, minLat, maxLng, maxLat] = getBbox(parcelFeature.geometry);

    // 문화유적은 주변 거리 안내를 위해 필지에서 반경만큼 넓힌 범위로 조회
    const latPad = NEARBY_RADIUS / 110540;
    const lngPad = NEARBY_RADIUS / (111320 * Math.cos((minLat * Math.PI) / 180));

    const nearbyBbox = [minLng - lngPad, minLat - latPad, maxLng + lngPad, maxLat + latPad];

    const [zonesResult, sitesResult, surveysResult] = await Promise.allSettled([
        fetchVworldFeatures(
            'LT_C_UO301',
            `BOX(${minLng},${minLat},${maxLng},${maxLat})`,
            apiKey,
            registeredDomain
        ),
        fetchSites(nearbyBbox, 1000),
        fetchSurveys(nearbyBbox, 1000)
    ]);

    if (zonesResult.status === 'rejected') {
        console.error('국가유산 구역 조회 오류:', zonesResult.reason);
    }
    if (sitesResult.status === 'rejected') {
        console.error('문화유적분포지도 조회 오류:', sitesResult.reason);
    }
    if (surveysResult.status === 'rejected') {
        console.error('국가유산조사구역 조회 오류:', surveysResult.reason);
    }

    const zones = zonesResult.status === 'fulfilled'
        ? measureOverlaps(
            parcelFeature,
            zonesResult.value.map((zone) => ({
                type: zone.properties.uname,
                name: zone.properties.remark || zone.properties.alias || '',
                geometry: zone.geometry
            }))
        )
        : null;

    // 필지와 도형 사이 거리(m). 한쪽이 다른 쪽에 걸치거나 품으면 0
    const origin = [minLng, minLat];
    const distanceToParcel = (geometry) =>
        containsAnyVertex(parcelFeature.geometry, geometry) ||
        containsAnyVertex(geometry, parcelFeature.geometry)
            ? 0
            : getDistance(parcelFeature.geometry, geometry, origin);

    // 문화유적마다 필지까지 거리를 재서, 닿는 것(0m)은 겹침 계산으로, 나머지는 주변 유적으로 나눔
    const measuredSites = sitesResult.status === 'fulfilled'
        ? sitesResult.value.map((site) => ({
            name: site.properties.name,
            mapNo: site.properties.mapNo,
            geometry: site.geometry,
            distance: distanceToParcel(site.geometry)
        }))
        : null;

    const sites = measuredSites
        ? measureOverlaps(parcelFeature, measuredSites.filter((site) => site.distance < 1))
            .map(({ distance, ...site }) => site)
        : null;

    const overlappingNames = new Set((sites || []).map((site) => site.name));
    const nearbyByName = new Map();
    (measuredSites || [])
        .filter((site) => site.distance <= NEARBY_RADIUS && !overlappingNames.has(site.name))
        .forEach((site) => {
            const prev = nearbyByName.get(site.name);
            if (!prev || site.distance < prev.distance) nearbyByName.set(site.name, site);
        });
    const nearbySites = measuredSites
        ? [...nearbyByName.values()]
            .sort((a, b) => a.distance - b.distance)
            .slice(0, NEARBY_LIMIT)
            .map((site) => ({ name: site.name, mapNo: site.mapNo, distance: Math.round(site.distance) }))
        : null;

    // 주변 조사 이력: 500m 안의 조사구역을 가까운 순으로 (같은 이름·종류는 하나만)
    let surveys = null;
    if (surveysResult.status === 'fulfilled') {
        const byKey = new Map();
        surveysResult.value
            .map((survey) => ({ ...survey, distance: distanceToParcel(survey.geometry) }))
            .filter((survey) => survey.distance <= NEARBY_RADIUS)
            .forEach((survey) => {
                const key = `${survey.kind}|${survey.name}`;
                const prev = byKey.get(key);
                if (!prev || survey.distance < prev.distance) byKey.set(key, survey);
            });
        surveys = [...byKey.values()]
            .sort((a, b) => a.distance - b.distance)
            .slice(0, SURVEY_LIMIT)
            .map(({ geometry, distance, ...survey }) => ({
                ...survey,
                distance: distance < 1 ? 0 : Math.round(distance)
            }));
    }

    // 응답에는 도형 대신 겹친 면적만 넣음
    const toResult = (items) => items && items.map(({ geometry, overlap, ...rest }) => ({
        ...rest,
        overlapArea: roundArea(area(overlap)),
        overlapRatio: roundArea((area(overlap) / parcelArea) * 100),
        edgeOnly: area(overlap) < EDGE_OVERLAP_AREA
    }));

    const isRealOverlap = (item) => area(item.overlap) >= EDGE_OVERLAP_AREA;
    const allOverlaps = [...(zones || []), ...(sites || [])]
        .filter(isRealOverlap)
        .map((item) => item.overlap);
    const siteOverlaps = (sites || []).filter(isRealOverlap).map((item) => item.overlap);
    const totalArea = getUnionArea(allOverlaps);
    const siteArea = getUnionArea(siteOverlaps);

    // 한쪽이라도 실패했으면 결과를 캐시하지 않음
    if (zones && sites) {
        res.setHeader(
            'Cache-Control',
            'public, s-maxage=86400, stale-while-revalidate=604800'
        );
    }

    return res.status(200).json({
        parcel: {
            pnu: parcels[0].properties.pnu,
            address: parcels[0].properties.addr,
            jibun: parcels[0].properties.jibun,
            area: roundArea(parcelArea),
            geometry: parcelFeature.geometry
        },
        zones: toResult(zones),
        sites: toResult(sites),
        nearbySites,
        surveys,
        overlap: {
            area: roundArea(totalArea),
            ratio: roundArea((totalArea / parcelArea) * 100),
            siteArea: roundArea(siteArea),
            siteRatio: roundArea((siteArea / parcelArea) * 100)
        }
    });
};
