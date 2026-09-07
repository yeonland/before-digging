const ALLOWED_LAYERS = new Set([
    'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun'
]);

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

    const layers = String(req.query.layers || '');

    if (!ALLOWED_LAYERS.has(layers)) {
        return res.status(400).json({ message: '허용되지 않은 지도 레이어입니다.' });
    }

    const width = Number(req.query.width);
    const height = Number(req.query.height);

    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1 ||
        width > 1024 ||
        height > 1024
    ) {
        return res.status(400).json({ message: '잘못된 지도 크기입니다.' });
    }

    const allowedParams = [
        'service',
        'request',
        'version',
        'layers',
        'styles',
        'format',
        'transparent',
        'width',
        'height',
        'crs',
        'srs',
        'bbox'
    ];

    const params = new URLSearchParams();

    allowedParams.forEach((name) => {
        const value = req.query[name];

        if (typeof value === 'string') {
            params.set(name, value);
        }
    });

    params.set('key', apiKey);
    params.set('domain', registeredDomain);

    try {
        const response = await fetch(
            `https://api.vworld.kr/req/wms?${params.toString()}`
        );

        const contentType = response.headers.get('content-type') || '';

        if (!response.ok || !contentType.startsWith('image/')) {
            const message = await response.text();
            console.error('VWorld 응답 오류:', response.status, message.slice(0, 300));

            return res.status(502).json({
                message: '지적도 데이터를 불러오지 못했습니다.'
            });
        }

        const image = Buffer.from(await response.arrayBuffer());

        res.setHeader('Content-Type', contentType);
        res.setHeader(
            'Cache-Control',
            'public, s-maxage=86400, stale-while-revalidate=604800'
        );

        return res.status(200).send(image);
    } catch (error) {
        console.error('VWorld 연결 오류:', error);

        return res.status(502).json({
            message: '지적도 서버 연결 중 오류가 발생했습니다.'
        });
    }
};
