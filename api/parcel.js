// 클릭한 위치의 필지를 찾아, 필지와 겹치는 국가유산 구역·문화유적 분포 범위 등을 진단
// - parcel: VWorld 연속지적도(LP_PA_CBND_BUBUN)
// - 진단 내용과 자료 출처는 _analyze.js 참고
const { area } = require('@turf/area');
const { feature } = require('@turf/helpers');
const { fetchVworldFeatures, fetchAreaData, analyze, getBbox, roundArea } = require('./_lib/analyze');

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
    const data = await fetchAreaData(getBbox(parcelFeature.geometry), apiKey, registeredDomain);
    const result = await analyze(parcelFeature, data);

    // 한쪽이라도 실패했으면 결과를 캐시하지 않음
    if (result.zones && result.sites) {
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
            area: roundArea(area(parcelFeature)),
            geometry: parcelFeature.geometry
        },
        ...result
    });
};
