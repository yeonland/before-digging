// 클릭한 위치가 포함된 국가유산 구역과 문화유적 분포 범위를 조회
// - zones: VWorld 국가유산 지정/보호구역(lt_c_uo301)
// - sites: 국가유산청 문화유적분포지도
const { fetchSites, isPointInGeometry } = require('./_lib/heritage-gis');
const { CACHE_ONE_DAY, allowMethods, vworldAuth, inKorea } = require('./_lib/http');

async function fetchZones(lat, lng, apiKey, registeredDomain) {
    const params = new URLSearchParams({
        service: 'data',
        request: 'GetFeature',
        data: 'LT_C_UO301',
        key: apiKey,
        domain: registeredDomain,
        format: 'json',
        geometry: 'false',
        attribute: 'true',
        crs: 'EPSG:4326',
        size: '100',
        geomFilter: `POINT(${lng} ${lat})`
    });

    const response = await fetch(
        `https://api.vworld.kr/req/data?${params.toString()}`
    );
    const data = await response.json();
    const status = data.response && data.response.status;

    if (status === 'NOT_FOUND') {
        return [];
    }

    if (!response.ok || status !== 'OK') {
        throw new Error(`VWorld 데이터 응답 오류: ${response.status} ${status}`);
    }

    return data.response.result.featureCollection.features.map((feature) => ({
        type: feature.properties.uname,
        name: feature.properties.remark || feature.properties.alias || '',
        sido: feature.properties.sido_name,
        sigungu: feature.properties.sigg_name
    }));
}

async function fetchSitesAt(lat, lng) {
    // 클릭 지점 주변 약 1m 범위로 후보를 받은 뒤 실제 포함 여부를 다시 확인
    const d = 0.00001;
    const features = await fetchSites([lng - d, lat - d, lng + d, lat + d], 50);

    return features
        .filter((feature) => isPointInGeometry(lng, lat, feature.geometry))
        .map((feature) => feature.properties);
}

module.exports = async function handler(req, res) {
    if (!allowMethods(req, res)) return;
    const auth = vworldAuth(req, res);
    if (!auth) return;
    const { apiKey, registeredDomain } = auth;

    const lat = Number(req.query.lat);
    const lng = Number(req.query.lng);
    if (!inKorea(lng, lat)) {
        return res.status(400).json({ message: '잘못된 좌표입니다.' });
    }

    const [zonesResult, sitesResult] = await Promise.allSettled([
        fetchZones(lat, lng, apiKey, registeredDomain),
        fetchSitesAt(lat, lng)
    ]);

    if (zonesResult.status === 'rejected') {
        console.error('국가유산 구역 조회 오류:', zonesResult.reason);
    }
    if (sitesResult.status === 'rejected') {
        console.error('문화유적분포지도 조회 오류:', sitesResult.reason);
    }

    // 두 곳 모두 실패하면 판정할 수 없음
    if (zonesResult.status === 'rejected' && sitesResult.status === 'rejected') {
        return res.status(502).json({
            message: '국가유산 데이터를 불러오지 못했습니다.'
        });
    }

    // 한쪽이라도 실패했으면 결과를 캐시하지 않음
    if (zonesResult.status === 'fulfilled' && sitesResult.status === 'fulfilled') {
        res.setHeader('Cache-Control', CACHE_ONE_DAY);
    }

    return res.status(200).json({
        zones: zonesResult.status === 'fulfilled' ? zonesResult.value : null,
        sites: sitesResult.status === 'fulfilled' ? sitesResult.value : null
    });
};
