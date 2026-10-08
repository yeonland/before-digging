// 주소·장소 검색 (VWorld 검색 API)
// 지번·도로명 주소를 먼저 찾고, 없으면 장소 이름으로 찾음
const MAX_RESULTS = 5;

async function searchVworld(query, type, category, apiKey, registeredDomain) {
    const params = new URLSearchParams({
        service: 'search',
        request: 'search',
        version: '2.0',
        crs: 'EPSG:4326',
        size: String(MAX_RESULTS),
        page: '1',
        query,
        type,
        format: 'json',
        errorformat: 'json',
        key: apiKey,
        domain: registeredDomain
    });
    if (category) params.set('category', category);

    const response = await fetch(`https://api.vworld.kr/req/search?${params.toString()}`);
    const body = await response.json();
    const status = body.response && body.response.status;

    if (status === 'NOT_FOUND') {
        return [];
    }

    if (!response.ok || status !== 'OK') {
        throw new Error(`VWorld 검색 응답 오류(${type} ${category}): ${response.status} ${status}`);
    }

    return body.response.result.items.map((item) => {
        const address = item.address || {};
        const isPlace = type === 'place';
        const label = isPlace
            ? item.title
            : category === 'parcel' ? address.parcel : address.road;
        const sub = isPlace
            ? address.road || address.parcel || ''
            : category === 'parcel'
                ? [address.road, address.bldnm].filter(Boolean).join(' · ')
                : [address.parcel, address.bldnm].filter(Boolean).join(' · ');

        return {
            label: label || '',
            sub,
            lat: Number(item.point.y),
            lng: Number(item.point.x)
        };
    });
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
        return res.status(500).json({ message: 'VWorld API 키가 설정되지 않았습니다.' });
    }

    const query = String(req.query.query || '').trim();

    if (query.length < 2 || query.length > 100) {
        return res.status(400).json({ message: '검색어는 2~100자로 입력해 주세요.' });
    }

    const searchAddress = async () => {
        const [parcels, roads] = await Promise.all([
            searchVworld(query, 'address', 'parcel', apiKey, registeredDomain),
            searchVworld(query, 'address', 'road', apiKey, registeredDomain)
        ]);
        return [...parcels, ...roads];
    };
    const searchPlace = () => searchVworld(query, 'place', '', apiKey, registeredDomain);

    try {
        // 숫자가 있으면 주소(지번·도로명)로 먼저, 없으면 장소 이름으로 먼저 찾음
        // (도로명 검색은 건물 이름도 찾아서 "종묘"가 "종묘배양장"으로 잡히는 일을 막음)
        const [first, second] = /\d/.test(query)
            ? [searchAddress, searchPlace]
            : [searchPlace, searchAddress];
        let results = await first();

        if (results.length === 0) {
            results = await second();
        }

        res.setHeader('Cache-Control', 'public, s-maxage=86400');

        return res.status(200).json({
            results: results
                .filter((result) => Number.isFinite(result.lat) && Number.isFinite(result.lng))
                .slice(0, MAX_RESULTS)
        });
    } catch (error) {
        console.error('주소 검색 오류:', error);

        return res.status(502).json({ message: '주소 검색에 실패했습니다.' });
    }
};
