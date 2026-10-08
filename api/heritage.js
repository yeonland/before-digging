// 클릭한 위치가 포함된 국가유산 지정/보호구역(VWorld lt_c_uo301)을 조회
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

    try {
        const response = await fetch(
            `https://api.vworld.kr/req/data?${params.toString()}`
        );
        const data = await response.json();
        const status = data.response && data.response.status;

        if (status === 'NOT_FOUND') {
            return res.status(200).json({ zones: [] });
        }

        if (!response.ok || status !== 'OK') {
            console.error('VWorld 데이터 응답 오류:', response.status, status);

            return res.status(502).json({
                message: '국가유산 구역 데이터를 불러오지 못했습니다.'
            });
        }

        const features = data.response.result.featureCollection.features;
        const zones = features.map((feature) => ({
            type: feature.properties.uname,
            name: feature.properties.remark || feature.properties.alias || '',
            sido: feature.properties.sido_name,
            sigungu: feature.properties.sigg_name
        }));

        res.setHeader(
            'Cache-Control',
            'public, s-maxage=86400, stale-while-revalidate=604800'
        );

        return res.status(200).json({ zones });
    } catch (error) {
        console.error('VWorld 연결 오류:', error);

        return res.status(502).json({
            message: '국가유산 구역 서버 연결 중 오류가 발생했습니다.'
        });
    }
};
