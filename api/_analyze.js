// 경계(필지 하나, 또는 도면으로 올린 사업부지) 하나를 진단하는 공용 모듈
// - fetchAreaData: 경계 주변의 국가유산 자료를 한 번에 받음 (사업부지면 부지 전체 범위로 한 번만 받아 필지마다 재사용)
// - analyze: 받은 자료로 경계와 겹치는 구역·유적·조사 이력·허용기준·세계유산을 계산
// 자료 출처
// - zones: VWorld 국가유산 지정/보호구역(lt_c_uo301)
// - sites: 국가유산청 문화유적분포지도
// - surveys: 국가유산청 국가유산조사구역 (주변 발굴·시굴·지표조사 이력)
// - allowance: 국가유산청 현상변경 허용기준 (경계에 걸친 구역과 그 구역의 기준)
// - worldHeritage: 국가유산청 세계유산 구역·완충구역·세계유산지구
const { area } = require('@turf/area');
const { feature, featureCollection } = require('@turf/helpers');
const { intersect } = require('@turf/intersect');
const { union } = require('@turf/union');
const {
    fetchSites,
    fetchSurveys,
    fetchAllowanceZones,
    fetchDesignated,
    fetchAllowanceCriteria,
    fetchWorldHeritage,
    isPointInGeometry
} = require('./_heritage-gis');
const { findAgency } = require('./_agencies');
const { nearbyBoreholes } = require('./_boreholes');

// 이보다 작은 겹침은 무시 (㎡)
const MIN_OVERLAP_AREA = 1;
// 이보다 작은 겹침은 경계에만 걸친 것으로 표시하고 전체 면적에서 뺌 (지적도와 구역도의 도면 오차 고려, ㎡)
const EDGE_OVERLAP_AREA = 10;
// 주변 문화유적을 찾는 반경과 최대 표시 개수 (법적 기준이 아닌 참고용)
const NEARBY_RADIUS = 500;
const NEARBY_LIMIT = 5;
// 주변 조사 이력 최대 표시 개수
const SURVEY_LIMIT = 10;
// 허용기준 주인을 찾을 때 열어 볼 주변 지정유산 최대 개수 (가까운 순, 한 번에 몇 개씩)
const ALLOWANCE_CANDIDATES = 15;
const ALLOWANCE_BATCH = 5;
const ALLOWANCE_RETRY_MS = 10 * 60 * 1000;
// VWorld는 한 번에 최대 1000건까지 주므로, 넓은 범위는 쪽(page)을 넘겨 가며 받음
const VWORLD_PAGE_SIZE = 1000;
const VWORLD_MAX_PAGES = 5;

// 허용기준 묶음 번호 → 기준을 찾는 중이거나 찾은 결과 (같은 묶음을 동시에·다시 찾지 않도록)
const allowanceCache = new Map();

// 좁은 범위라 평면으로 근사해 미터 단위 좌표로 바꿈
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

async function fetchVworldPage(data, geomFilter, apiKey, registeredDomain, page, size) {
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
        size: String(size),
        page: String(page),
        geomFilter
    });

    const response = await fetch(
        `https://api.vworld.kr/req/data?${params.toString()}`
    );
    const body = await response.json();
    const status = body.response && body.response.status;

    if (status === 'NOT_FOUND') {
        return { features: [], totalPages: 0 };
    }

    if (!response.ok || status !== 'OK') {
        const error = (body.response && body.response.error) || {};
        throw new Error(`VWorld 데이터 응답 오류(${data}): ${response.status} ${status} ${error.code || ''} ${error.text || ''}`.trim());
    }

    return {
        features: body.response.result.featureCollection.features,
        totalPages: Number(body.response.page && body.response.page.total) || 1
    };
}

// 한 지점·작은 범위는 한 쪽만, 넓은 범위(사업부지)는 여러 쪽을 받아 합침
async function fetchVworldFeatures(data, geomFilter, apiKey, registeredDomain, options = {}) {
    const size = options.size || 100;
    const maxPages = options.maxPages || 1;
    const first = await fetchVworldPage(data, geomFilter, apiKey, registeredDomain, 1, size);
    const pages = Math.min(first.totalPages, maxPages);
    const rest = await Promise.all(
        Array.from({ length: Math.max(0, pages - 1) }, (_, index) =>
            fetchVworldPage(data, geomFilter, apiKey, registeredDomain, index + 2, size)
        )
    );

    const features = [first, ...rest].flatMap((page) => page.features);
    features.truncated = first.totalPages > maxPages;
    return features;
}

function getBbox(geometry) {
    const polygons =
        geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
    const points = polygons.flat(2);
    const lngs = points.map((point) => point[0]);
    const lats = points.map((point) => point[1]);

    return [Math.min(...lngs), Math.min(...lats), Math.max(...lngs), Math.max(...lats)];
}

// 범위를 미터 단위로 넓힘
function padBbox([minLng, minLat, maxLng, maxLat], meters) {
    const latPad = meters / 110540;
    const lngPad = meters / (111320 * Math.cos((minLat * Math.PI) / 180));
    return [minLng - lngPad, minLat - latPad, maxLng + lngPad, maxLat + latPad];
}

// 두 범위 사이 거리가 이만큼(m)보다 멀면 true (정확한 거리 계산 전에 먼 것을 빨리 걸러냄)
function bboxFarther(boxA, boxB, meters) {
    const padded = padBbox(boxA, meters);
    return boxB[2] < padded[0] || boxB[0] > padded[2] || boxB[3] < padded[1] || boxB[1] > padded[3];
}

// 경계와 겹치는 부분의 도형 (없으면 null)
function getOverlap(targetFeature, geometry) {
    try {
        return intersect(featureCollection([targetFeature, feature(geometry)]));
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

function bboxPolygon([minLng, minLat, maxLng, maxLat]) {
    return feature({
        type: 'Polygon',
        coordinates: [[[minLng, minLat], [maxLng, minLat], [maxLng, maxLat], [minLng, maxLat], [minLng, minLat]]]
    });
}

function roundArea(value) {
    return Math.round(value * 10) / 10;
}

function getCenter(geometry) {
    const [minLng, minLat, maxLng, maxLat] = getBbox(geometry);
    return [(minLng + maxLng) / 2, (minLat + maxLat) / 2];
}

// 허용기준 구역 도형으로 그 기준의 주인(지정유산)과 기준 내용을 찾음
// 구역 묶음은 지정유산을 둘러싸므로, 묶음 전체 범위(조금 넓혀서) 안의 지정유산을 경계에서 가까운 순으로 열어 봄
// (경주 시내처럼 여러 유산이 한 묶음을 같이 쓰는 경우가 있어, 경계에서 가까운 유산 이름을 보여줌)
function resolveAllowance(zone, targetCenter) {
    const seid = zone.properties.seid;
    if (!allowanceCache.has(seid)) {
        // 못 찾았거나 실패하면 10분 뒤에 다시 시도 (사업부지의 필지마다 같은 실패를 되풀이하지 않도록)
        const forgetLater = () => setTimeout(() => allowanceCache.delete(seid), ALLOWANCE_RETRY_MS).unref();
        const pending = findAllowance(zone, targetCenter).then((found) => {
            if (!found) forgetLater();
            return found;
        }, (error) => {
            console.error('허용기준 내용 조회 오류:', error);
            forgetLater();
            return null;
        });
        allowanceCache.set(seid, pending);
    }
    return allowanceCache.get(seid);
}

async function findAllowance(zone, targetCenter) {
    const seid = zone.properties.seid;

    // 묶음 전체를 받는 요청은 구역이 아주 크면(경주 시내 등) 끊길 수 있어, 실패하면 이 구역 범위만 씀
    const set = await fetchAllowanceZones(null, 50, seid).catch((error) => {
        console.error('허용기준 묶음 조회 오류:', error.message);
        return [];
    });
    const boxes = (set.length > 0 ? set : [zone]).map((item) => getBbox(item.geometry));
    const pad = 0.002; // 약 200m
    const setBbox = [
        Math.min(...boxes.map((box) => box[0])) - pad,
        Math.min(...boxes.map((box) => box[1])) - pad,
        Math.max(...boxes.map((box) => box[2])) + pad,
        Math.max(...boxes.map((box) => box[3])) + pad
    ];
    const candidates = (await fetchDesignated(setBbox, 300))
        .map((item) => {
            const [lng, lat] = getCenter(item.geometry);
            return { ...item, distance: Math.hypot(lng - targetCenter[0], lat - targetCenter[1]) };
        })
        .sort((a, b) => a.distance - b.distance)
        .filter((item, index, list) => list.findIndex((other) => other.code === item.code) === index)
        .slice(0, ALLOWANCE_CANDIDATES);

    for (let i = 0; i < candidates.length; i += ALLOWANCE_BATCH) {
        const batch = candidates.slice(i, i + ALLOWANCE_BATCH);
        const results = await Promise.allSettled(batch.map((item) => fetchAllowanceCriteria(item.code)));
        const index = results.findIndex((result) =>
            result.status === 'fulfilled' && result.value && result.value.seid === seid
        );
        if (index >= 0) {
            return { heritage: batch[index].name, ...results[index].value };
        }
    }

    return null;
}

// 각 구역과의 겹침을 계산해 겹치는 것만 남김 (경계 범위와 멀리 떨어진 것은 계산 전에 뺌)
function measureOverlaps(targetFeature, items) {
    const box = getBbox(targetFeature.geometry);
    return items
        .filter((item) => !bboxFarther(box, getBbox(item.geometry), 1))
        .map((item) => ({ ...item, overlap: getOverlap(targetFeature, item.geometry) }))
        .filter((item) => item.overlap && area(item.overlap) >= MIN_OVERLAP_AREA);
}

// 경계 범위(bbox) 주변의 국가유산 자료를 한 번에 받음. 실패한 자료는 null
async function fetchAreaData(bbox, apiKey, registeredDomain, options = {}) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    // 문화유적·조사 이력·세계유산은 주변 거리 안내를 위해 반경만큼 넓힌 범위로 조회
    const nearbyBbox = padBbox(bbox, NEARBY_RADIUS);
    const wide = Boolean(options.wide);

    const results = await Promise.allSettled([
        fetchVworldFeatures(
            'LT_C_UO301',
            `BOX(${minLng},${minLat},${maxLng},${maxLat})`,
            apiKey,
            registeredDomain,
            wide ? { size: VWORLD_PAGE_SIZE, maxPages: VWORLD_MAX_PAGES } : {}
        ),
        fetchSites(nearbyBbox, wide ? 3000 : 1000),
        fetchSurveys(nearbyBbox, wide ? 3000 : 1000),
        fetchAllowanceZones(bbox, wide ? 500 : 100),
        fetchWorldHeritage(nearbyBbox, 100)
    ]);

    const labels = ['국가유산 구역', '문화유적분포지도', '국가유산조사구역', '현상변경 허용기준', '세계유산'];
    results.forEach((result, index) => {
        if (result.status === 'rejected') {
            console.error(`${labels[index]} 조회 오류:`, result.reason);
        }
    });

    const value = (index) => (results[index].status === 'fulfilled' ? results[index].value : null);
    return {
        zones: value(0),
        sites: value(1),
        surveys: value(2),
        allowance: value(3),
        world: value(4)
    };
}

// 꼭짓점이 많은 큰 도형(시내 전체를 덮는 허용기준 구역, 세계유산 구역, 긴 관로 조사 범위 등)을
// 사업부지 주변(반경 + 여유)만 남기고 잘라 둠. 필지마다 하는 겹침 계산이 훨씬 빨라짐
// (반경 밖 부분은 거리·겹침 결과에 영향이 없음)
const CLIP_MIN_VERTICES = 200;

function clipAreaData(data, bbox) {
    const clipBox = bboxPolygon(padBbox(bbox, NEARBY_RADIUS + 100));
    const vertexCount = (geometry) => getRings(geometry).reduce((sum, ring) => sum + ring.length, 0);
    const clip = (items) => items && items
        .map((item) => {
            if (vertexCount(item.geometry) < CLIP_MIN_VERTICES) return item;
            const clipped = getOverlap(clipBox, item.geometry);
            return clipped ? { ...item, geometry: clipped.geometry } : null;
        })
        .filter(Boolean);

    return {
        zones: clip(data.zones),
        sites: clip(data.sites),
        surveys: clip(data.surveys),
        allowance: clip(data.allowance),
        world: clip(data.world)
    };
}

// 경계 하나를 진단. data는 fetchAreaData 결과 (경계가 그 범위 안에 있어야 함)
async function analyze(targetFeature, data) {
    const targetArea = area(targetFeature);
    const box = getBbox(targetFeature.geometry);
    const [minLng, minLat] = box;

    const zones = data.zones
        ? measureOverlaps(
            targetFeature,
            data.zones.map((zone) => ({
                type: zone.properties.uname,
                name: zone.properties.remark || zone.properties.alias || '',
                geometry: zone.geometry
            }))
        )
        : null;

    // 경계와 도형 사이 거리(m). 한쪽이 다른 쪽에 걸치거나 품으면 0, 반경보다 확실히 멀면 Infinity
    const origin = [minLng, minLat];
    const distanceToTarget = (geometry) => {
        if (bboxFarther(box, getBbox(geometry), NEARBY_RADIUS)) return Infinity;
        return containsAnyVertex(targetFeature.geometry, geometry) ||
            containsAnyVertex(geometry, targetFeature.geometry)
            ? 0
            : getDistance(targetFeature.geometry, geometry, origin);
    };

    // 문화유적마다 경계까지 거리를 재서, 닿는 것(0m)은 겹침 계산으로, 나머지는 주변 유적으로 나눔
    const measuredSites = data.sites
        ? data.sites.map((site) => ({
            name: site.properties.name,
            mapNo: site.properties.mapNo,
            geometry: site.geometry,
            distance: distanceToTarget(site.geometry)
        }))
        : null;

    const sites = measuredSites
        ? measureOverlaps(targetFeature, measuredSites.filter((site) => site.distance < 1))
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
    let surveyStats = null;
    if (data.surveys) {
        const byKey = new Map();
        data.surveys
            .map((survey) => ({ ...survey, distance: distanceToTarget(survey.geometry) }))
            .filter((survey) => survey.distance <= NEARBY_RADIUS)
            .forEach((survey) => {
                const key = `${survey.kind}|${survey.name}`;
                const prev = byKey.get(key);
                if (!prev || survey.distance < prev.distance) byKey.set(key, survey);
            });
        const uniqueSurveys = [...byKey.values()];

        // 위험도 등급용: 목록을 10건으로 자르기 전에 반경별 발굴·시굴조사 건수를 셈
        const countExcavations = (radius) => uniqueSurveys
            .filter((survey) => survey.kind === 'excavation' && survey.distance <= radius).length;
        surveyStats = {
            excavationsWithin200: countExcavations(200),
            excavationsWithin500: countExcavations(NEARBY_RADIUS)
        };

        // 경계에 걸친 지표조사 확인 유적마다, 같은 범위에서 그 뒤에 한 표본·시굴·발굴조사를 찾음
        // (보고서의 조사 의견을 직접 읽을 수 없어서, 실제로 다음 단계 조사로 이어졌는지로 보여줌)
        // 상수도 관로처럼 길고 꼭짓점이 수천 개인 유적 범위는 겹침 계산이 매우 느려서,
        // 경계 주변(500m)만 잘라 낸 뒤 비교함. 사업부지에서는 같은 유적을 필지마다 다시 계산하지 않도록 기억
        const excavations = data.surveys.filter((survey) => survey.kind === 'excavation');
        if (!data.followUpCache) data.followUpCache = new Map();
        const findFollowUps = (site) => {
            const cacheKey = site.name;
            if (data.followUpCache.has(cacheKey)) return data.followUpCache.get(cacheKey);

            const nearTarget = getOverlap(bboxPolygon(padBbox(box, NEARBY_RADIUS)), site.geometry);
            if (!nearTarget) return [];
            const siteBox = getBbox(nearTarget.geometry);
            const seen = new Set();
            const followUps = excavations
                .filter((excavation) => !site.year || !excavation.year || excavation.year >= site.year)
                .filter((excavation) => !bboxFarther(siteBox, getBbox(excavation.geometry), 1))
                .filter((excavation) => {
                    const overlap = getOverlap(nearTarget, excavation.geometry);
                    return overlap && area(overlap) >= EDGE_OVERLAP_AREA;
                })
                .filter((excavation) => !seen.has(excavation.name) && seen.add(excavation.name))
                .sort((a, b) => (a.year || 0) - (b.year || 0))
                .map(({ name, method, year, report }) => ({ name, method, year, report, agency: findAgency(report) }));
            data.followUpCache.set(cacheKey, followUps);
            return followUps;
        };

        surveys = uniqueSurveys
            .sort((a, b) => a.distance - b.distance)
            .slice(0, SURVEY_LIMIT)
            .map(({ geometry, distance, ...survey }) => ({
                ...survey,
                agency: findAgency(survey.report),
                ...(survey.kind === 'surfaceSite' && distance < 1 ? { followUps: findFollowUps({ ...survey, geometry }) } : {}),
                distance: distance < 1 ? 0 : Math.round(distance)
            }));
    }

    // 현상변경 허용기준: 경계에 10㎡ 이상 걸친 구역마다 그 구역의 기준을 붙임
    // (기준을 못 찾은 구역은 rule: null로 두고 화면에서 국가유산청 확인을 안내)
    let allowance = null;
    if (data.allowance) {
        const overlapped = measureOverlaps(
            targetFeature,
            data.allowance.map((zone) => ({ zone, geometry: zone.geometry }))
        ).filter((item) => area(item.overlap) >= EDGE_OVERLAP_AREA);

        allowance = await Promise.all(overlapped.map(async ({ zone, overlap }) => {
            let criteria = null;
            try {
                criteria = await resolveAllowance(zone, getCenter(targetFeature.geometry));
            } catch (error) {
                console.error('허용기준 내용 조회 오류:', error);
            }
            const rule = criteria && (
                criteria.zones.find((item) => item.ids.includes(zone.properties.id)) ||
                criteria.zones.find((item) => item.zone === zone.properties.zone)
            );
            return {
                heritage: criteria ? criteria.heritage : null,
                zone: zone.properties.zone,
                overlapArea: roundArea(area(overlap)),
                overlapRatio: roundArea((area(overlap) / targetArea) * 100),
                rule: rule ? { flat: rule.flat, slope: rule.slope } : null,
                common: criteria ? criteria.common : []
            };
        }));
    }

    // 세계유산: 경계에 걸친 지구·구역·완충구역, 걸치지 않으면 500m 안의 가장 가까운 세계유산 구역
    let worldHeritage = null;
    if (data.world) {
        const overlapping = measureOverlaps(
            targetFeature,
            data.world.map((item) => ({ ...item.properties, geometry: item.geometry }))
        ).filter((item) => area(item.overlap) >= EDGE_OVERLAP_AREA);
        const namesOf = (kind) => [...new Set(overlapping.filter((item) => item.kind === kind).map((item) => item.name))];

        const nearestCore = data.world
            .filter((item) => item.properties.kind !== 'buffer')
            .map((item) => ({ name: item.properties.name, distance: distanceToTarget(item.geometry) }))
            .filter((item) => item.distance >= 1 && item.distance <= NEARBY_RADIUS)
            .sort((a, b) => a.distance - b.distance)[0];

        worldHeritage = {
            district: namesOf('district'),
            core: namesOf('core'),
            buffer: namesOf('buffer'),
            nearest: overlapping.length === 0 && nearestCore
                ? { name: nearestCore.name, distance: Math.round(nearestCore.distance) }
                : null
        };
    }

    // 응답에는 도형 대신 겹친 면적만 넣음
    const toResult = (items) => items && items.map(({ geometry, overlap, ...rest }) => ({
        ...rest,
        overlapArea: roundArea(area(overlap)),
        overlapRatio: roundArea((area(overlap) / targetArea) * 100),
        edgeOnly: area(overlap) < EDGE_OVERLAP_AREA
    }));

    const isRealOverlap = (item) => area(item.overlap) >= EDGE_OVERLAP_AREA;
    const allOverlaps = [...(zones || []), ...(sites || [])]
        .filter(isRealOverlap)
        .map((item) => item.overlap);
    const siteOverlaps = (sites || []).filter(isRealOverlap).map((item) => item.overlap);
    const totalArea = getUnionArea(allOverlaps);
    const siteArea = getUnionArea(siteOverlaps);

    return {
        zones: toResult(zones),
        sites: toResult(sites),
        nearbySites,
        surveys,
        surveyStats,
        allowance,
        worldHeritage,
        boreholes: nearbyBoreholes(targetFeature.geometry),
        overlap: {
            area: roundArea(totalArea),
            ratio: roundArea((totalArea / targetArea) * 100),
            siteArea: roundArea(siteArea),
            siteRatio: roundArea((siteArea / targetArea) * 100)
        }
    };
}

module.exports = {
    EDGE_OVERLAP_AREA,
    fetchVworldFeatures,
    fetchAreaData,
    analyze,
    clipAreaData,
    getBbox,
    getOverlap,
    roundArea
};
