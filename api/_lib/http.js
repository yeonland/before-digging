// 서버 함수들이 같이 쓰는 요청 확인·응답 도우미

// 공공데이터 응답은 CDN에 하루 캐시 (그 뒤 일주일은 옛 응답을 주면서 새로 받음)
const CACHE_ONE_DAY = 'public, s-maxage=86400, stale-while-revalidate=604800';

// 허용한 요청 방식이 아니면 405로 답하고 false
function allowMethods(req, res, methods = ['GET']) {
    if (methods.includes(req.method)) return true;
    res.setHeader('Allow', methods.join(', '));
    res.status(405).json({ message: `${methods.join(' 또는 ')} 요청만 사용할 수 있습니다.` });
    return false;
}

// VWorld 인증값. 키가 없으면 500으로 답하고 null
// 도메인은 접속 중인 배포 주소를 쓰고, 따로 정하고 싶을 때만 VWORLD_DOMAIN
function vworldAuth(req, res) {
    const apiKey = process.env.VWORLD_API_KEY;
    if (!apiKey) {
        res.status(500).json({ message: 'VWorld API 키가 설정되지 않았습니다.' });
        return null;
    }
    return { apiKey, registeredDomain: process.env.VWORLD_DOMAIN || `https://${req.headers.host}` };
}

// 대한민국 범위 안의 경위도인지
function inKorea(lng, lat) {
    return Number.isFinite(lng) && Number.isFinite(lat) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

module.exports = { CACHE_ONE_DAY, allowMethods, vworldAuth, inKorea };
