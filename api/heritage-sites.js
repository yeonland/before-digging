// 지도 타일(줌 15) 한 칸 범위의 국가유산청 도형을 GeoJSON으로 반환
// - layer 없음: 문화유적분포지도
// - layer=allowance: 현상변경 허용기준 구역
// - layer=world: 세계유산 구역·완충구역·세계유산지구
const { fetchSites, fetchAllowanceZones, fetchWorldHeritage } = require('./_lib/heritage-gis');

const LAYERS = {
    allowance: fetchAllowanceZones,
    world: fetchWorldHeritage
};

const TILE_ZOOM = 15;

function tileToLng(x) {
    return (x / 2 ** TILE_ZOOM) * 360 - 180;
}

function tileToLat(y) {
    const n = Math.PI - (2 * Math.PI * y) / 2 ** TILE_ZOOM;
    return (180 / Math.PI) * Math.atan(Math.sinh(n));
}

module.exports = async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).json({ message: 'GET 요청만 사용할 수 있습니다.' });
    }

    const x = Number(req.query.x);
    const y = Number(req.query.y);
    const bbox = [tileToLng(x), tileToLat(y + 1), tileToLng(x + 1), tileToLat(y)];

    // 대한민국 범위 밖 타일은 거절
    if (
        !Number.isInteger(x) ||
        !Number.isInteger(y) ||
        bbox[0] < 124 || bbox[2] > 132 ||
        bbox[1] < 33 || bbox[3] > 39
    ) {
        return res.status(400).json({ message: '잘못된 타일 좌표입니다.' });
    }

    try {
        const fetchFeatures = LAYERS[req.query.layer] || fetchSites;
        const features = await fetchFeatures(bbox, 1000);

        res.setHeader(
            'Cache-Control',
            'public, s-maxage=86400, stale-while-revalidate=604800'
        );

        return res.status(200).json({ type: 'FeatureCollection', features });
    } catch (error) {
        console.error('국가유산청 도형 조회 오류:', error);

        return res.status(502).json({
            message: '국가유산청 도형을 불러오지 못했습니다.'
        });
    }
};
