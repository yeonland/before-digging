// 필지 진단 결과 → "다음에 해야 할 일"과 비용 안내를 만드는 규칙
// 근거 조문은 docs/기획서.md 5장 참고. 법령이 바뀌면 이 파일의 규칙과 문구를 고친다.
// 국가유산영향진단법 시행령 제5조제1항: 사업 면적 3만㎡ 이상
const DIAGNOSIS_AREA = 30000;

// 이 거리 안에 문화유적이 있으면 주의 안내 (법적 기준이 아닌 서비스 참고 기준, m)
const NEARBY_CAUTION_DISTANCE = 100;

// 매장유산법 시행령 제10조: 발굴경비 지원 대상 건설공사
// rule: "~이면 지원 대상"에 들어갈 기준 문장, extra: 덧붙일 예외
const SUPPORT_RULES = {
    house: {
        topic: '단독주택은',
        check: (input) => input.landArea <= 792,
        rule: '대지면적이 792㎡ 이하',
        extra: '주택건설사업자가 시행하는 공사는 제외돼요.'
    },
    farm: {
        topic: '농업인·어업인이 사업 목적으로 짓는 시설물은',
        check: (input) => input.landArea <= 2644,
        rule: '대지면적이 2,644㎡ 이하'
    },
    business: {
        topic: '개인사업자가 자기 사업 목적으로 짓는 시설물은',
        check: (input) => input.floorArea !== null && input.floorArea <= 264 && input.landArea <= 792,
        rule: '건축물 연면적이 264㎡ 이하이면서 대지면적이 792㎡ 이하'
    },
    factory: {
        topic: '공장은',
        check: (input) => input.landArea <= 2644,
        rule: '부지면적이 2,644㎡ 이하'
    }
};

const LAW = {
    diagnosisRemains: '국가유산영향진단법 제9조제1항제2호',
    diagnosisArea: '국가유산영향진단법 제9조제1항제1호, 같은 법 시행령 제5조제1항',
    diagnosisNotice: '국가유산영향진단법 제9조제1항제3호, 같은 법 시행령 제5조제2항',
    remainsRange: '매장유산 보호 및 조사에 관한 법률 시행령 제3조',
    simpleDiagnosis: '문화유산의 보존 및 활용에 관한 법률 제13조제2항·제7항',
    cost: '국가유산영향진단법 제10조제2항, 매장유산 보호 및 조사에 관한 법률 제11조제3항',
    support: '매장유산 보호 및 조사에 관한 법률 제11조제3항 단서, 같은 법 시행령 제10조',
    contract: '매장유산 보호 및 조사에 관한 법률 제24조제4항',
    discovery: '매장유산 보호 및 조사에 관한 법률 제5조제2항, 제17조',
    natural: '자연유산의 보존 및 활용에 관한 법률 (허가 조문 확인 중)',
    worldDistrict: '세계유산의 보존ㆍ관리 및 활용에 관한 특별법 제10조, 제11조의2제1항, 같은 법 시행령 제3조의2·제3조의4, 별표 1',
    worldOutside: '세계유산의 보존ㆍ관리 및 활용에 관한 특별법 제11조의2제2항'
};

// 국가유산 구역 자료(VWorld)에는 문화유산·자연유산을 나누는 칸이 없어 이름으로 구분
// 천연기념물·명승 같은 자연유산 구역은 매장유산 유존지역 판단과 위험도에서 빼고 안내만 함
// 이름이 없는 구역은 구분할 수 없어 문화유산으로 봄 (안전한 쪽)
const NATURAL_NAME = /철새|도래지|서식지|번식지|군락|자생지|나무|노거수|숲|수림|상록수|동굴|주상절리|화석|습지|폭포|계곡|천연보호구역/;

// 허용기준 구역 중 높이 같은 숫자 기준 없이 "개별검토", "개별심의", "심의구역", "보존구역"으로 된 곳
// → 공사마다 따로 검토를 받아야 해서 위험도 주의, 안내는 확인 필요
function needsAllowanceReview(item) {
    return Boolean(item.rule) &&
        [...item.rule.flat, ...item.rule.slope].some((text) => /개별\s*(검토|심의)|심의|보존구역/.test(text));
}

function allowanceLabel(item) {
    return `${item.heritage ? `'${item.heritage}' ` : ''}${item.zone}`;
}

function isNaturalZone(zone) {
    return NATURAL_NAME.test((zone && zone.name) || '');
}

// 진단 결과에서 어떤 영역에 걸치는지 정리 (경계에만 걸친 것은 제외)
function classify(result) {
    const naturalZones = (result.zones || []).filter((zone) => !zone.edgeOnly && isNaturalZone(zone));
    const heritageZones = (result.zones || []).filter((zone) => !isNaturalZone(zone));
    const zones = heritageZones.filter((zone) => !zone.edgeOnly);
    const sites = (result.sites || []).filter((site) => !site.edgeOnly);
    const isDesignated = (type) => /지정문화재구역|지정유산구역/.test(type || '');

    return {
        // 문화유적분포지도 표시 지역, 지정유산이 있는 지역 → 매장유산 유존지역 (시행령 제3조)
        inRemains: sites.length > 0 || zones.some((zone) => isDesignated(zone.type)),
        inSites: sites.length > 0,
        inDesignated: zones.some((zone) => isDesignated(zone.type)),
        inProtection: zones.some((zone) => /보호구역/.test(zone.type || '')),
        inHistoricEnv: zones.some((zone) => /역사문화환경/.test(zone.type || '')),
        edgeOnly: [...heritageZones, ...(result.sites || [])].some((item) => item.edgeOnly),
        naturalNames: [...new Set(naturalZones.map((zone) => zone.name))],
        incomplete: result.zones === null || result.sites === null
    };
}

// "시굴조사(2017년)"처럼 조사 종류와 연도
function surveyLabel(survey) {
    return `${survey.method}${survey.year ? `(${survey.year}년)` : ''}`;
}

// 도면으로 올린 사업부지 진단(result.target === 'site')에서는 "필지"를 "사업부지"로 바꿔 씀
const SITE_WORDS = [
    [/이 필지/g, '이 사업부지'],
    [/필지에서/g, '부지 경계에서'],
    [/필지 경계/g, '부지 경계'],
    [/필지(에|의|가|는)/g, '부지$1']
];

function siteWording(text) {
    return typeof text === 'string'
        ? SITE_WORDS.reduce((result, [pattern, replacement]) => result.replace(pattern, replacement), text)
        : text;
}

// input: { workType, landArea, floorArea } (workType: '', house, farm, business, factory, other)
function buildGuidance(result, input) {
    const area = classify(result);
    const steps = [];

    // 1. 국가유산영향진단
    let needsDiagnosis = false;
    if (area.inRemains) {
        needsDiagnosis = true;
        steps.push({
            level: 'required',
            title: '국가유산영향진단을 받아야 해요',
            body: area.inSites
                ? '이 필지는 문화유적분포지도에 표시된 범위에 걸쳐 있어 매장유산 유존지역에 해당해요. 유존지역에서 하는 건설공사는 면적과 상관없이, 사업계획을 확정하기 전에 국가유산영향진단을 받아야 해요.'
                : '이 필지는 지정문화유산 구역에 걸쳐 있어 매장유산 유존지역에 해당해요. 유존지역에서 하는 건설공사는 면적과 상관없이, 사업계획을 확정하기 전에 국가유산영향진단을 받아야 해요.',
            law: `${LAW.diagnosisRemains}, ${LAW.remainsRange}`
        });
    } else if (input.landArea !== null && input.landArea >= DIAGNOSIS_AREA) {
        needsDiagnosis = true;
        steps.push({
            level: 'required',
            title: '국가유산영향진단을 받아야 해요',
            body: '사업 면적이 3만㎡ 이상인 건설공사는 사업계획을 확정하기 전에 국가유산영향진단을 받아야 해요. 같은 목적으로 나누거나 붙여서 개발하는 경우에도 전체 면적으로 판단해요.',
            law: LAW.diagnosisArea
        });
    } else {
        steps.push({
            level: 'check',
            title: '관할 시·군·구 고시 구역인지 확인해 보세요',
            body: '확인된 범위에서는 영향진단 대상이 아니에요. 다만 과거에 유물이 나온 곳 등으로 시장·군수·구청장이 고시한 구역이면 3만㎡ 미만이어도 대상이 돼요.',
            law: LAW.diagnosisNotice
        });
    }

    // 2. 역사문화환경 보존지역: 약식영향진단
    if (area.inHistoricEnv) {
        steps.push({
            level: needsDiagnosis ? 'info' : 'required',
            title: needsDiagnosis
                ? '약식영향진단은 따로 받지 않아도 돼요'
                : '인허가 전에 약식영향진단을 받아야 해요',
            body: needsDiagnosis
                ? '역사문화환경 보존지역에 걸쳐 있지만, 국가유산영향진단을 받으면 약식영향진단은 하지 않아도 돼요.'
                : '역사문화환경 보존지역 안의 건설공사는 인허가 전에 약식영향진단을 받아야 해요. 다만 고시된 행위기준(현상변경 허용기준) 범위 안의 공사라면 생략할 수 있어요.',
            law: LAW.simpleDiagnosis
        });
    }

    // 2-1. 현상변경 허용기준: 필지에 걸친 구역의 높이 등 기준. 이 범위 안이면 약식영향진단 생략 가능
    const allowance = (result.allowance || []);
    if (allowance.length > 0) {
        const ruleText = (item) => {
            if (!item.rule) return `${item.zone}: 기준 내용을 불러오지 못했어요`;
            const same = item.rule.flat.join(', ') === item.rule.slope.join(', ');
            return same
                ? `${item.zone}: ${item.rule.flat.join(', ')}`
                : `${item.zone}: 평지붕 ${item.rule.flat.join(', ')} / 경사지붕 ${item.rule.slope.join(', ')}`;
        };
        const lines = allowance.map((item) =>
            `${item.heritage ? `'${item.heritage}' 주변 ` : ''}${ruleText(item)} (필지의 ${item.overlapRatio}%)${needsAllowanceReview(item) ? ' → 확인 필요' : ''}`
        );
        const reviewItems = allowance.filter(needsAllowanceReview);
        const missing = allowance.some((item) => !item.rule);
        const common = [...new Set(allowance.flatMap((item) => item.common))];
        const reviewText = reviewItems.length > 0
            ? ` ⚠️ 확인 필요: ${reviewItems.map(allowanceLabel).join(', ')}은(는) 높이 같은 숫자 기준 대신 "개별검토·심의"로 정해져 있어요. 이런 구역은 건물 높이나 규모와 상관없이 공사마다 국가유산 쪽 검토(현상변경 허가 등)를 받아야 할 수 있어요. 설계를 확정하기 전에 관할 시·군·구 문화유산 담당 부서에 "이 공사가 현상변경 허가 대상인지, 어떤 서류가 필요한지" 먼저 문의하세요.`
            : '';
        const missingText = missing
            ? ' 기준 내용을 불러오지 못한 구역은 국가유산청 국가유산공간정보서비스(gis-heritage.go.kr)에서 기준을 확인하세요.'
            : '';
        steps.push({
            level: reviewItems.length > 0 || missing ? 'check' : 'info',
            title: reviewItems.length > 0 ? '현상변경 허용기준 구역에 걸쳐요 (확인 필요)' : '현상변경 허용기준 구역에 걸쳐요',
            body: `국가유산 주변에서 지을 수 있는 건물의 높이 등을 미리 정해 둔 기준이에요. 역사문화환경 보존지역 안이라도 계획한 공사가 이 기준 안이면 약식영향진단을 생략할 수 있어요.${reviewText}${missingText}`,
            items: lines,
            details: common.length > 0 ? { summary: `공통 기준 ${common.length}개 보기`, items: common } : null,
            law: `${LAW.simpleDiagnosis} (행위기준 고시와 약식영향진단 생략). 기준 원문은 국가유산청 국가유산공간정보서비스에서 확인하세요.`
        });
    }

    // 2-2. 세계유산: 고시된 세계유산지구 안이면 건축 전 세계유산영향평가, 등재 구역·완충구역이나 가까운 곳은 확인 안내
    const world = result.worldHeritage;
    if (world) {
        const quote = (names) => `'${names.join("', '")}'`;
        if (world.district.length > 0) {
            steps.push({
                level: 'required',
                title: '세계유산영향평가를 받아야 해요',
                body: `이 필지는 세계유산 ${quote(world.district)}의 세계유산지구에 걸쳐 있어요. 세계유산지구에서 건축물을 짓거나 늘리는 공사는 건축 허가·신고 전에 세계유산영향평가를 해야 해요. 먼저 국가유산청에 사전검토요청서(위치, 규모, 최고 높이, 세계유산 구역과의 거리 등)를 내면 30일 안에 평가서 제출 대상인지 알려줘요.`,
                law: LAW.worldDistrict
            });
        } else if (world.core.length > 0 || world.buffer.length > 0) {
            const inCore = world.core.length > 0;
            steps.push({
                level: 'check',
                title: inCore ? '세계유산 구역에 걸쳐요' : '세계유산 완충구역에 걸쳐요',
                body: `이 필지는 세계유산 ${quote(inCore ? world.core : world.buffer)}의 ${inCore ? '세계유산 구역' : '완충구역'}에 걸쳐 있어요. 이 범위가 세계유산지구로 고시되면 건축 전에 세계유산영향평가를 받아야 해요. 지구로 고시됐는지, 영향평가가 필요한지 관할 시·군·구나 국가유산청에 확인해 보세요.`,
                law: LAW.worldDistrict
            });
        } else if (world.nearest) {
            steps.push({
                level: 'info',
                title: '세계유산이 가까이에 있어요',
                body: `세계유산 '${world.nearest.name}' 구역에서 약 ${world.nearest.distance}m 떨어져 있어요. 세계유산지구 밖이라도 세계유산에 중대한 영향을 줄 것이 확실한 사업은 국가유산청이 세계유산영향평가를 요청할 수 있어요(예: 종묘 앞 세운4구역). 높은 건물이나 큰 개발이라면 미리 확인해 보세요.`,
                law: `${LAW.worldOutside} (거리 기준은 법에 정해져 있지 않아요. 500m는 서비스 참고 기준이에요)`
            });
        }
    }

    // 3. 지정구역·보호구역 (허가 조문은 아직 확인 전이라 문의 안내만)
    if (area.inDesignated || area.inProtection) {
        steps.push({
            level: 'check',
            title: '공사 허가가 필요한지 문의해 보세요',
            body: '지정문화유산 구역이나 보호구역 안에서 하는 공사는 별도 허가를 받아야 할 수 있어요. 관할 시·군·구 문화유산 담당 부서에 먼저 문의해 보세요.',
            law: '확인 중'
        });
    }

    // 3-1. 자연유산 구역 (매장유산 절차와 별개라 위험도에는 넣지 않고 안내만)
    if (area.naturalNames.length > 0) {
        steps.push({
            level: 'check',
            title: '자연유산 구역에 걸쳐요',
            body: `'${area.naturalNames.join("', '")}'은(는) 천연기념물·명승 같은 자연유산 구역으로 보여요. 땅속 유물(매장유산) 절차와는 별개라 위험도에는 넣지 않았어요. 다만 자연유산 구역과 그 주변에서 공사하려면 현상변경 허가가 필요할 수 있으니 관할 시·군·구에 문의해 보세요.`,
            law: LAW.natural
        });
    }

    // 4. 경계에만 걸친 영역 (지적도와 구역도의 도면 오차일 수 있음)
    if (area.edgeOnly) {
        steps.push({
            level: 'check',
            title: '경계에 걸친 영역이 있는지 확인해 보세요',
            body: '필지 경계에 국가유산 관련 영역이 아주 조금(10㎡ 미만) 걸쳐 있어요. 지도끼리의 오차일 수 있지만, 경계 가까이에서 공사한다면 관할 시·군·구에 확인해 보세요.',
            law: null
        });
    }

    // 5. 가까운 문화유적 (필지가 유적 범위 밖일 때만)
    const nearest = (result.nearbySites || [])[0];
    if (!area.inSites && nearest && nearest.distance <= NEARBY_CAUTION_DISTANCE) {
        steps.push({
            level: 'check',
            title: '가까이에 문화유적이 있어요',
            body: `필지에서 약 ${nearest.distance}m 떨어진 곳에 '${nearest.name}' 분포 범위가 있어요. 유적 범위 밖이라 법적 절차 대상은 아니지만, 유적이 주변까지 이어져 있을 수 있으니 공사 전에 관할 시·군·구에 문의해 두면 좋아요.`,
            law: '법적 기준이 아닌 참고 안내예요. (서비스 기준: 100m 이내)'
        });
    }

    // 6. 이 필지에 걸친 조사 기록 (국가유산조사구역)
    const onParcel = (result.surveys || []).filter((survey) => survey.distance === 0);
    const pastExcavations = onParcel.filter((survey) => survey.kind === 'excavation');
    const surfaceSites = onParcel.filter((survey) => survey.kind === 'surfaceSite');

    if (surfaceSites.length > 0) {
        const site = surfaceSites[0];
        const followUps = site.followUps || [];
        const shown = followUps.slice(0, 3).map(surveyLabel).join(', ');
        const followUpText = followUps.length > 0
            ? ` 같은 범위에서 그 뒤에 ${shown}${followUps.length > 3 ? ` 외 ${followUps.length - 3}건의` : ''} 기록이 있어요. 그 조사 결과도 함께 확인해 보세요. 아래 "주변 조사 이력"의 "보고서 찾기"로 국가유산청 보고서 목록을 열 수 있어요.`
            : ' 같은 범위에서 그 뒤에 한 표본·시굴·발굴조사 기록은 찾지 못했어요.';
        steps.push({
            level: 'check',
            title: '지표조사에서 유적이 확인된 범위에 걸쳐요',
            body: `'${site.name}' 범위에 걸쳐 있어요${site.report ? ` (보고서: ${site.report})` : ''}. 지표조사에서 확인됐다고 모두 조사가 필요한 건 아니고, 보고서의 조사 의견에 따라 달라져요. 보통 유물이 흩어져 보이는 유물산포지는 표본·시굴조사로 확인하고, 문화층이 나오면 발굴조사로 이어져요.${followUpText} 보고서는 관할 시·군·구나 조사기관${site.agency ? `(${site.agency.name}, ☎ ${site.agency.phone})` : ''}에 요청해 볼 수 있어요. 국가유산청이 검토해 매장유산이 있다고 표시한 지역이면 유존지역에 해당해 영향진단 대상이 될 수 있으니 함께 확인해 보세요.`,
            law: `${LAW.remainsRange} (유존지역 범위), ${LAW.diagnosisRemains}`
        });
    }

    // 지표조사 구역 안이지만 유적 확인 범위에는 안 걸칠 때: 조사 결과(유적 유무)를 참고로 안내
    const surfaceAreas = onParcel.filter((survey) => survey.kind === 'surface');
    if (surfaceSites.length === 0 && surfaceAreas.length > 0) {
        const notFound = surfaceAreas.filter((survey) => survey.siteFound === false);
        const found = surfaceAreas.filter((survey) => survey.siteFound === true);
        const main = found[0] || notFound[0] || surfaceAreas[0];
        const result = found.length > 0
            ? '조사 구역 안에서 유적이 확인됐지만, 확인된 유적 범위는 이 필지에 걸치지 않아요.'
            : notFound.length > 0
                ? '그 조사에서는 유적이 확인되지 않았어요.'
                : '조사 결과(유적 유무)는 자료에서 확인되지 않아요.';
        steps.push({
            level: 'info',
            title: '예전 지표조사 구역 안에 있어요',
            body: `'${main.name}'${main.year ? ` (${main.year}년)` : ''} 지표조사 구역에 걸쳐 있어요. ${result} 오래된 조사이거나 공사 범위가 다르면 다시 조사가 필요할 수 있어요.`,
            law: null
        });
    }

    if (pastExcavations.length > 0) {
        // 조사명에 이 필지 지번(예: 815-1)이 들어간 기록을 먼저, 그다음 최근 조사 순
        const parcelNo = ((result.parcel && result.parcel.jibun) || '').split(' ')[0];
        const mentionsParcel = (survey) =>
            parcelNo !== '' && new RegExp(`(^|[^\\d-])${parcelNo}(번지|[^\\d-]|$)`).test(survey.name);
        const [main] = [...pastExcavations].sort((a, b) =>
            (mentionsParcel(b) - mentionsParcel(a)) || ((b.year || 0) - (a.year || 0))
        );
        const others = pastExcavations.length - 1;
        steps.push({
            level: 'info',
            title: '이 필지에 예전 조사 기록이 있어요',
            body: `필지에 걸친 ${main.method} 기록이 있어요: '${main.name}'${main.year ? ` (${main.year}년)` : ''}${others > 0 ? ` 외 ${others}건` : ''}. 예전 조사 결과에 따라 필요한 절차가 달라질 수 있으니, 보고서 내용을 확인하고 관할 시·군·구에 문의해 보세요. 조사 목록은 아래 "주변 조사 이력"에서 볼 수 있어요.`,
            law: null
        });
    }

    // 7. 비용
    const cost = needsDiagnosis || area.inHistoricEnv ? buildCost(input) : null;

    // 8. 공통 주의사항
    const notes = [];
    if (needsDiagnosis) {
        notes.push({
            text: '조사기관과의 조사 계약은 공사 계약과 분리해서 맺어야 해요.',
            law: LAW.contract
        });
    }
    notes.push({
        text: '공사 중 유물이나 유구가 나오면 즉시 공사를 멈추고 신고해야 해요. 신고하지 않으면 처벌받을 수 있어요.',
        law: LAW.discovery
    });

    if (result.target === 'site') {
        steps.forEach((step) => {
            step.title = siteWording(step.title);
            step.body = siteWording(step.body);
            if (step.items) step.items = step.items.map(siteWording);
        });
    }

    return { steps, cost, notes, incomplete: area.incomplete };
}

function buildCost(input) {
    const cost = {
        summary: '영향진단과 발굴조사 비용은 공사를 하는 사람(사업시행자)이 부담해요.',
        law: LAW.cost,
        support: null
    };

    const rule = SUPPORT_RULES[input.workType];
    if (!input.workType) {
        cost.support = { level: 'ask', text: '공사 종류를 고르면 발굴비용 지원 대상인지 알려드려요.' };
    } else if (!rule) {
        cost.support = {
            level: 'no',
            text: '이 공사 종류는 발굴비용 지원 대상에 해당하지 않아요. (국가유산청장이 따로 고시한 공사는 예외)',
            law: LAW.support
        };
    } else if (input.landArea === null || (input.workType === 'business' && input.floorArea === null)) {
        cost.support = { level: 'ask', text: `${rule.topic} ${rule.rule}이면 발굴비용 지원 대상이에요. 면적을 입력해 주세요.` };
    } else if (rule.check(input)) {
        cost.support = {
            level: 'yes',
            text: `${rule.topic} ${rule.rule}이면 발굴비용을 국가나 지자체에서 지원받을 수 있어요. 입력한 면적은 기준에 해당해요. (예산 범위 안에서 지원)${rule.extra ? ' ' + rule.extra : ''}`,
            law: LAW.support
        };
    } else {
        cost.support = {
            level: 'no',
            text: `${rule.topic} ${rule.rule}일 때만 발굴비용 지원 대상이에요. 입력한 면적은 기준을 넘어요.`,
            law: LAW.support
        };
    }

    return cost;
}

// ---------------------------------------------------------------
// 위험도 등급: 공사할 때 문화유산 때문에 절차나 조사가 생길 가능성 (참고용 서비스 기준)
// 위에서부터 확인해 처음 걸리는 등급으로 정하고, 해당되는 근거는 모두 보여줌
// ---------------------------------------------------------------
const RISK = {
    nearbyDistance: NEARBY_CAUTION_DISTANCE, // 이 거리 안에 문화유적 분포 범위가 있으면 주의 (m)
    // 이 반경 안의 발굴·시굴조사는 등급에 넣지 않고 참고로만 안내 (2026-10-10 실무 의견:
    // 서울 도심·경주 시내는 거의 다 걸려서 건수 기준이 변별력이 없음)
    excavationRadius: 200
};

const RISK_LEVELS = {
    high: { label: '높음', icon: '🔴', summary: '공사 전에 문화유산 절차가 필요할 가능성이 높은 땅이에요.' },
    caution: { label: '주의', icon: '🟡', summary: '문화유산 절차가 생기거나 주변에 유적이 있을 수 있는 땅이에요.' },
    low: { label: '낮음', icon: '🟢', summary: '확인된 자료에서는 문화유산 관련 근거가 없는 땅이에요.' },
    unknown: { label: '확인 불가', icon: '⚪', summary: '일부 자료를 불러오지 못해 등급을 정하지 못했어요.' },
    note: { label: '참고', icon: 'ℹ️', summary: '' } // 기준표에만 쓰는 설명 줄
};

// 화면의 "등급 기준 보기"에 그대로 보여주는 기준표
const RISK_CRITERIA = [
    {
        level: 'high',
        rules: [
            '문화유적 분포 범위에 걸침 (10㎡ 이상) → 매장유산 유존지역',
            '국가·시도 지정유산 구역에 걸침 (자연유산 구역은 제외)',
            '고시된 세계유산지구에 걸침 → 세계유산영향평가 대상'
        ]
    },
    {
        level: 'caution',
        rules: [
            '지표조사로 유적이 확인된 범위에 걸침 (보고서 의견에 따라 조사 여부가 달라짐)',
            '역사문화환경 보존지역이나 보호구역에 걸침',
            '세계유산 구역이나 완충구역에 걸침 (세계유산지구 고시 전)',
            '현상변경 허용기준의 개별검토·심의 구역에 걸침 (숫자 기준 없이 공사마다 검토)',
            `문화유적 분포 범위가 ${RISK.nearbyDistance}m 안에 있음`,
            '필지에 예전 발굴·시굴조사 기록이 있음',
            '유적 범위가 필지 경계에만 살짝 걸침 (10㎡ 미만)'
        ]
    },
    {
        level: 'low',
        rules: ['위 기준에 하나도 해당하지 않음']
    },
    {
        level: 'note',
        rules: [
            '천연기념물·명승 같은 자연유산 구역은 매장유산 절차와 별개라 등급에 넣지 않고 따로 안내함',
            `주변 ${RISK.excavationRadius}m 안의 발굴·시굴조사는 지역마다 건수 차이가 커서 등급에 넣지 않고, 있으면 참고로 안내함`
        ]
    },
    {
        level: 'unknown',
        rules: ['자료 일부를 불러오지 못했고, 불러온 자료에서는 높음·주의 근거가 없음']
    }
];

function buildRisk(result) {
    const area = classify(result);
    const surveys = result.surveys || [];
    const onParcel = surveys.filter((survey) => survey.distance === 0);
    const high = [];
    const caution = [];

    // 높음
    if (area.inSites) {
        const ratio = result.overlap && result.overlap.siteRatio;
        high.push(ratio
            ? `문화유적 분포 범위에 필지의 ${ratio}%가 걸쳐요`
            : '문화유적 분포 범위에 걸쳐요');
    }
    if (area.inDesignated) {
        high.push('국가·시도 지정유산 구역에 걸쳐요');
    }
    const world = result.worldHeritage;
    if (world && world.district.length > 0) {
        high.push(`세계유산지구('${world.district.join("', '")}')에 걸쳐요`);
    }

    // 주의
    if (world && world.district.length === 0 && (world.core.length > 0 || world.buffer.length > 0)) {
        const inCore = world.core.length > 0;
        caution.push(`세계유산 ${inCore ? '구역' : '완충구역'}('${(inCore ? world.core : world.buffer).join("', '")}')에 걸쳐요`);
    }
    const reviewZones = (result.allowance || []).filter(needsAllowanceReview);
    if (reviewZones.length > 0) {
        caution.push(`현상변경 허용기준 개별검토·심의 구역에 걸쳐요 (${reviewZones.map(allowanceLabel).join(', ')}). 공사마다 따로 검토를 받아야 할 수 있어요`);
    }

    const surfaceSite = onParcel.find((survey) => survey.kind === 'surfaceSite');
    if (surfaceSite) {
        const followUps = surfaceSite.followUps || [];
        caution.push(`지표조사로 유적이 확인된 범위에 걸쳐요 ('${surfaceSite.name}')${followUps.length > 0 ? `. 그 뒤 같은 범위에 ${surveyLabel(followUps[0])}${followUps.length > 1 ? ` 외 ${followUps.length - 1}건의` : ''} 기록이 있어요` : ''}`);
    }
    if (area.inHistoricEnv) caution.push('역사문화환경 보존지역에 걸쳐요. 건물 높이·모양 같은 기준이 있을 수 있으니, 설계 전에 관할 시·군·구에 현상변경 허가 대상인지 확인해 보세요');
    if (area.inProtection) caution.push('국가유산 보호구역에 걸쳐요');

    const nearest = (result.nearbySites || [])[0];
    if (!area.inSites && nearest && nearest.distance <= RISK.nearbyDistance) {
        caution.push(`문화유적 분포 범위가 약 ${nearest.distance}m 떨어져 있어요 ('${nearest.name}')`);
    }

    const pastExcavations = onParcel.filter((survey) => survey.kind === 'excavation');
    if (pastExcavations.length > 0) {
        const years = pastExcavations.map((survey) => survey.year).filter(Boolean);
        const [first, last] = [Math.min(...years), Math.max(...years)];
        caution.push(`필지에 예전 발굴·시굴조사 기록이 ${pastExcavations.length}건 있어요${years.length ? ` (${first === last ? first : `${first}~${last}`}년)` : ''}`);
    }


    if (area.edgeOnly) caution.push('유적 관련 범위가 필지 경계에만 살짝 걸쳐요 (도면 오차일 수 있음)');

    const incomplete = area.incomplete || result.surveys === null || result.nearbySites === null;
    let level;
    if (high.length > 0) level = 'high';
    else if (caution.length > 0) level = 'caution';
    else if (incomplete) level = 'unknown';
    else level = 'low';

    const reasons = [...high, ...caution];
    if (level === 'low') {
        reasons.push('주변 500m 안 자료를 확인했지만 위 기준에 해당하는 근거가 없어요');
    }
    const nearbyExcavations = result.surveyStats ? result.surveyStats.excavationsWithin200 : null;
    if (nearbyExcavations > 0) {
        reasons.push(`(참고) 주변 ${RISK.excavationRadius}m 안에서 발굴·시굴조사가 ${nearbyExcavations}건 있었어요. 등급에는 넣지 않았으니, 아래 "주변 조사 이력"에서 어떤 유적이 나왔는지 확인해 보세요`);
    }
    if (area.naturalNames.length > 0) {
        reasons.push(`(참고) 자연유산 구역에 걸쳐요 ('${area.naturalNames.join("', '")}'). 등급에는 넣지 않았어요`);
    }
    if (incomplete) {
        reasons.push('일부 자료(국가유산 구역, 문화유적 분포 범위, 조사 이력 중)를 불러오지 못했어요. 잠시 후 다시 확인해 보세요');
    }

    return {
        level,
        ...RISK_LEVELS[level],
        reasons: result.target === 'site' ? reasons.map(siteWording) : reasons,
        incomplete,
        criteria: RISK_CRITERIA.map((group) => ({ ...group, ...RISK_LEVELS[group.level] }))
    };
}

export { buildGuidance, buildRisk, isNaturalZone };
