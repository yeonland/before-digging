// 필지 진단 결과 → "다음에 해야 할 일"과 비용 안내를 만드는 규칙
// 근거 조문은 docs/기획서.md 5장 참고. 법령이 바뀌면 이 파일의 규칙과 문구를 고친다.
(function () {
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
        discovery: '매장유산 보호 및 조사에 관한 법률 제5조제2항, 제17조'
    };

    // 진단 결과에서 어떤 영역에 걸치는지 정리 (경계에만 걸친 것은 제외)
    function classify(result) {
        const zones = (result.zones || []).filter((zone) => !zone.edgeOnly);
        const sites = (result.sites || []).filter((site) => !site.edgeOnly);
        const isDesignated = (type) => /지정문화재구역|지정유산구역/.test(type || '');

        return {
            // 문화유적분포지도 표시 지역, 지정유산이 있는 지역 → 매장유산 유존지역 (시행령 제3조)
            inRemains: sites.length > 0 || zones.some((zone) => isDesignated(zone.type)),
            inSites: sites.length > 0,
            inDesignated: zones.some((zone) => isDesignated(zone.type)),
            inProtection: zones.some((zone) => /보호구역/.test(zone.type || '')),
            inHistoricEnv: zones.some((zone) => /역사문화환경/.test(zone.type || '')),
            edgeOnly: [...(result.zones || []), ...(result.sites || [])].some((item) => item.edgeOnly),
            incomplete: result.zones === null || result.sites === null
        };
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

        // 3. 지정구역·보호구역 (허가 조문은 아직 확인 전이라 문의 안내만)
        if (area.inDesignated || area.inProtection) {
            steps.push({
                level: 'check',
                title: '공사 허가가 필요한지 문의해 보세요',
                body: '지정문화유산 구역이나 보호구역 안에서 하는 공사는 별도 허가를 받아야 할 수 있어요. 관할 시·군·구 문화유산 담당 부서에 먼저 문의해 보세요.',
                law: '확인 중'
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

        if (surfaceSites.length > 0 && !area.inSites) {
            steps.push({
                level: 'check',
                title: '지표조사에서 유적이 확인된 범위에 걸쳐요',
                body: `'${surfaceSites[0].name}' 범위에 걸쳐 있어요. 국가유산청이 검토한 조사 보고서에 매장유산이 있다고 표시된 지역이면 매장유산 유존지역에 해당해 영향진단 대상이 될 수 있어요. 관할 시·군·구에 확인해 보세요.`,
                law: `${LAW.remainsRange} (유존지역 범위), ${LAW.diagnosisRemains}`
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
        excavationRadius: 200, // 이 반경 안의
        excavationCount: 3 // 발굴·시굴조사가 이만큼 이상이면 주의
    };

    const RISK_LEVELS = {
        high: { label: '높음', icon: '🔴', summary: '공사 전에 문화유산 절차가 필요할 가능성이 높은 땅이에요.' },
        caution: { label: '주의', icon: '🟡', summary: '문화유산 절차가 생기거나 주변에 유적이 있을 수 있는 땅이에요.' },
        low: { label: '낮음', icon: '🟢', summary: '확인된 자료에서는 문화유산 관련 근거가 없는 땅이에요.' },
        unknown: { label: '확인 불가', icon: '⚪', summary: '일부 자료를 불러오지 못해 등급을 정하지 못했어요.' }
    };

    // 화면의 "등급 기준 보기"에 그대로 보여주는 기준표
    const RISK_CRITERIA = [
        {
            level: 'high',
            rules: [
                '문화유적 분포 범위에 걸침 (10㎡ 이상) → 매장유산 유존지역',
                '국가·시도 지정유산 구역에 걸침',
                '지표조사로 유적이 확인된 범위에 걸침'
            ]
        },
        {
            level: 'caution',
            rules: [
                '역사문화환경 보존지역이나 보호구역에 걸침',
                `문화유적 분포 범위가 ${RISK.nearbyDistance}m 안에 있음`,
                '필지에 예전 발굴·시굴조사 기록이 있음',
                `주변 ${RISK.excavationRadius}m 안에 발굴·시굴조사가 ${RISK.excavationCount}건 이상`,
                '유적 범위가 필지 경계에만 살짝 걸침 (10㎡ 미만)'
            ]
        },
        {
            level: 'low',
            rules: ['위 기준에 하나도 해당하지 않음']
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
        const surfaceSite = onParcel.find((survey) => survey.kind === 'surfaceSite');
        if (surfaceSite) {
            high.push(`지표조사로 유적이 확인된 범위에 걸쳐요 ('${surfaceSite.name}')`);
        }

        // 주의
        if (area.inHistoricEnv) caution.push('역사문화환경 보존지역에 걸쳐요');
        if (area.inProtection) caution.push('국가유산 보호구역에 걸쳐요');

        const nearest = (result.nearbySites || [])[0];
        if (!area.inSites && nearest && nearest.distance <= RISK.nearbyDistance) {
            caution.push(`문화유적 분포 범위가 약 ${nearest.distance}m 떨어져 있어요 ('${nearest.name}')`);
        }

        const pastExcavations = onParcel.filter((survey) => survey.kind === 'excavation');
        if (pastExcavations.length > 0) {
            const years = pastExcavations.map((survey) => survey.year).filter(Boolean);
            caution.push(`필지에 예전 발굴·시굴조사 기록이 ${pastExcavations.length}건 있어요${years.length ? ` (${Math.min(...years)}~${Math.max(...years)}년)` : ''}`);
        }

        const nearbyExcavations = result.surveyStats ? result.surveyStats.excavationsWithin200 : null;
        if (nearbyExcavations !== null && nearbyExcavations >= RISK.excavationCount) {
            caution.push(`주변 ${RISK.excavationRadius}m 안에서 발굴·시굴조사가 ${nearbyExcavations}건 있었어요`);
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
        if (incomplete) {
            reasons.push('일부 자료(국가유산 구역, 문화유적 분포 범위, 조사 이력 중)를 불러오지 못했어요. 잠시 후 다시 확인해 보세요');
        }

        return {
            level,
            ...RISK_LEVELS[level],
            reasons,
            incomplete,
            criteria: RISK_CRITERIA.map((group) => ({ ...group, ...RISK_LEVELS[group.level] }))
        };
    }

    window.buildGuidance = buildGuidance;
    window.buildRisk = buildRisk;
})();
