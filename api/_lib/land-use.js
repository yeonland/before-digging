// 필지의 토지이용계획(용도지역·지구·구역): 토지이음에 나오는 것과 같은 자료
// - VWorld 토지이용계획속성조회(getLandUseAttr), 필지 고유번호(PNU)로 조회
// - 쉬운 말 안내는 화면 쪽 src/result/land-rules.ts에서 만듦 (여기서는 이름과 걸친 정도만 정리)

// 한 번에 동시에 보내는 요청 수 (도면 사업부지의 필지가 많을 때)
const BATCH_SIZE = 10;

// cnflcAt: 1 포함, 2 저촉(일부 걸침), 3 접함(경계에 닿기만 함 → 해당 아님이라 뺌)
const RELATIONS = { 1: 'in', 2: 'part' };

async function fetchLandUse(pnu, apiKey, registeredDomain) {
    const params = new URLSearchParams({
        pnu,
        key: apiKey,
        domain: registeredDomain,
        format: 'json',
        numOfRows: '1000',
        pageNo: '1'
    });

    const response = await fetch(`https://api.vworld.kr/ned/data/getLandUseAttr?${params.toString()}`);
    const body = await response.json();

    if (!body.landUses) {
        // 결과가 없으면 { response: { totalCount: "0" } }, 오류면 resultCode·resultMsg가 옴
        const info = body.response || {};
        if (!response.ok || info.resultCode) {
            throw new Error(`VWorld 토지이용계획 응답 오류: ${response.status} ${info.resultCode || ''} ${info.resultMsg || ''}`.trim());
        }
        return [];
    }

    const byName = new Map();
    [].concat(body.landUses.field || []).forEach((item) => {
        const relation = RELATIONS[item.cnflcAt];
        const name = item.prposAreaDstrcCodeNm;
        if (!relation || !name) return;
        // 같은 이름이 여러 번 오면(도로 여러 개 등) 하나로, 포함이 하나라도 있으면 포함
        const prev = byName.get(name);
        if (!prev || (prev.relation === 'part' && relation === 'in')) {
            byName.set(name, { name, code: item.prposAreaDstrcCode, relation });
        }
    });
    return [...byName.values()];
}

// 여러 필지를 몇 개씩 나눠 조회. 실패한 필지는 null
async function fetchLandUses(pnus, apiKey, registeredDomain) {
    const results = [];
    for (let i = 0; i < pnus.length; i += BATCH_SIZE) {
        const batch = pnus.slice(i, i + BATCH_SIZE);
        results.push(...await Promise.all(batch.map((pnu) =>
            fetchLandUse(pnu, apiKey, registeredDomain).catch((error) => {
                console.error('토지이용계획 조회 오류:', pnu, error.message);
                return null;
            })
        )));
    }
    return results;
}

// 사업부지 전체: 필지마다의 목록을 합침. 모든 필지에 포함이면 포함, 아니면 일부. parcels는 해당 필지 수
// 한 필지라도 못 불러왔으면 null
function mergeLandUses(lists) {
    if (lists.some((list) => list === null)) return null;
    const byName = new Map();
    lists.forEach((list) => list.forEach((item) => {
        const prev = byName.get(item.name) || { ...item, parcels: 0, inCount: 0 };
        prev.parcels += 1;
        if (item.relation === 'in') prev.inCount += 1;
        byName.set(item.name, prev);
    }));
    return [...byName.values()].map(({ inCount, ...item }) => ({
        ...item,
        relation: inCount === lists.length ? 'in' : 'part'
    }));
}

module.exports = { fetchLandUse, fetchLandUses, mergeLandUses };
