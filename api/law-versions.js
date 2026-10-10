// 서비스 안내에 쓰는 법령의 현재 시행 정보(법령일련번호, 시행일 등)를 반환
// 국가법령정보 공동활용 오픈API가 해외 접속을 막아 GitHub Actions에서 직접 부를 수 없으므로,
// 서울 리전의 이 함수가 대신 조회한다. (scripts/check-laws.mjs가 사용)
const WATCHED = require('../data/watched-laws.json');
const { allowMethods } = require('./_lib/http');

// 오픈API 신청 때 등록한 도메인. API가 요청의 Referer로 사용자를 검증함
const REGISTERED_DOMAIN = 'https://before-digging.vercel.app/';

async function searchLaws(query, oc) {
    const params = new URLSearchParams({ OC: oc, target: 'law', type: 'JSON', query, display: '100' });
    const response = await fetch(`https://www.law.go.kr/DRF/lawSearch.do?${params}`, {
        headers: { Referer: REGISTERED_DOMAIN }
    });
    const text = await response.text();

    let body;
    try {
        body = JSON.parse(text);
    } catch {
        throw new Error(`법령 API 응답을 읽을 수 없습니다 (${response.status})`);
    }

    if (!body.LawSearch) {
        throw new Error(`법령 API 오류: ${body.result || ''} ${body.msg || ''}`.trim());
    }

    return [].concat(body.LawSearch.law || []);
}

module.exports = async function handler(req, res) {
    if (!allowMethods(req, res)) return;

    const oc = process.env.LAW_API_OC;

    if (!oc) {
        return res.status(500).json({ message: '법령 API 인증값(LAW_API_OC)이 설정되지 않았습니다.' });
    }

    try {
        const versions = {};

        for (const { query, names } of WATCHED) {
            const laws = await searchLaws(query, oc);

            for (const name of names) {
                const law = laws.find((item) => item['법령명한글'] === name);
                if (!law) {
                    throw new Error(`"${name}"을(를) 찾지 못했습니다. 법령명이 바뀌었을 수 있습니다.`);
                }
                versions[name] = {
                    mst: law['법령일련번호'],
                    lawId: law['법령ID'],
                    kind: law['법령구분명'],
                    effectiveDate: law['시행일자'],
                    promulgationDate: law['공포일자'],
                    promulgationNo: law['공포번호'],
                    revisionType: law['제개정구분명']
                };
            }
        }

        // 하루에 여러 번 불려도 법령 API는 한 시간에 한 번만 부르도록 캐시
        res.setHeader('Cache-Control', 'public, s-maxage=3600');

        return res.status(200).json({ versions });
    } catch (error) {
        console.error('법령 정보 조회 오류:', error);

        return res.status(502).json({ message: String(error.message).replaceAll(oc, '***') });
    }
};
