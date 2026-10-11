// 클릭한 위치의 필지를 찾아, 필지와 겹치는 국가유산 구역·문화유적 분포 범위 등을 진단
// - parcel: VWorld 연속지적도(LP_PA_CBND_BUBUN)
// - 진단 내용과 자료 출처는 _lib/analyze.js 참고
// - landUse: 토지이용계획(용도지역·개발제한구역 등 다른 토지 규제, _lib/land-use.js)
const { area } = require('@turf/area');
const { feature } = require('@turf/helpers');
const { fetchVworldFeatures, fetchAreaData, analyze, getBbox, roundArea } = require('./_lib/analyze');
const { fetchLandUse } = require('./_lib/land-use');
const { CACHE_ONE_DAY, allowMethods, vworldAuth, inKorea } = require('./_lib/http');

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
    const pnu = parcels[0].properties.pnu;
    // 토지 규제는 국가유산 진단과 함께 받음 (실패하면 null)
    const landUsePromise = fetchLandUse(pnu, apiKey, registeredDomain).catch((error) => {
        console.error('토지이용계획 조회 오류:', error);
        return null;
    });
    const data = await fetchAreaData(getBbox(parcelFeature.geometry), apiKey, registeredDomain);
    const result = await analyze(parcelFeature, data);
    const landUse = await landUsePromise;

    // 하나라도 실패했으면 결과를 캐시하지 않음
    if (result.zones && result.sites && landUse) {
        res.setHeader('Cache-Control', CACHE_ONE_DAY);
    }

    return res.status(200).json({
        parcel: {
            pnu,
            address: parcels[0].properties.addr,
            jibun: parcels[0].properties.jibun,
            area: roundArea(area(parcelFeature)),
            geometry: parcelFeature.geometry
        },
        ...result,
        landUse
    });
};
