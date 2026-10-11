// 다른 토지 규제(토지이용계획) → 쉬운 말 안내를 만드는 규칙
// 자료는 VWorld 토지이용계획(토지이음과 같은 자료, api/_lib/land-use.js). 법령이 바뀌면 이 파일의 숫자와 문구를 고친다.
// 국가유산 위험도와는 따로 보여줌 (위험도는 땅속 유적 기준)
import type { LandUseItem } from '../shared/types';

export type LandLevel = 'required' | 'check' | 'info';

export interface LandRule {
    level: LandLevel;
    title: string;
    body: string;
    law: string;
    items: LandUseItem[]; // 이 안내에 해당한 원래 이름들
}

export interface Zoning {
    item: LandUseItem;
    text: string;
    coverage: number | null; // 건폐율 상한(%)
    floorRatio: number | null; // 용적률 상한(%)
}

export interface LandGuidance {
    zonings: Zoning[];
    rules: LandRule[];
    heritage: LandUseItem[]; // 국가유산 관련 구역 (위 국가유산 진단에서 안내)
    others: LandUseItem[]; // 그 밖의 규제 (이름만)
}

// 용도지역별 건폐율·용적률 상한 (국토계획법 시행령 제84조·제85조). 실제 값은 시·군 조례로 더 낮은 경우가 많음
const ZONING: Record<string, [number, number, string]> = {
    제1종전용주거지역: [50, 100, '단독주택 중심의 조용한 주거지예요.'],
    제2종전용주거지역: [50, 150, '공동주택 중심의 조용한 주거지예요.'],
    제1종일반주거지역: [60, 200, '저층 주택 중심의 주거지예요.'],
    제2종일반주거지역: [60, 250, '중층 주택 중심의 주거지예요.'],
    제3종일반주거지역: [50, 300, '중·고층 주택 중심의 주거지예요.'],
    준주거지역: [70, 500, '주택과 상가·사무실이 섞인 곳이에요.'],
    중심상업지역: [90, 1500, '도심의 상업·업무 중심지예요.'],
    일반상업지역: [80, 1300, '일반적인 상가·업무 지역이에요.'],
    근린상업지역: [70, 900, '주변 주민을 위한 상가 지역이에요.'],
    유통상업지역: [80, 1100, '도매·물류 같은 유통 시설 지역이에요.'],
    전용공업지역: [70, 300, '중화학 공장 같은 공업 시설 지역이에요.'],
    일반공업지역: [70, 350, '환경에 큰 부담이 없는 공장 지역이에요.'],
    준공업지역: [70, 400, '공장과 주택·상가가 섞인 곳이에요.'],
    보전녹지지역: [20, 80, '도시 안의 자연환경·경관을 지키는 녹지라 지을 수 있는 건물이 아주 적어요.'],
    생산녹지지역: [20, 100, '농사를 위해 남겨 둔 도시 안 녹지예요. 지을 수 있는 건물이 제한돼요.'],
    자연녹지지역: [20, 100, '도시 안 녹지로, 정해진 건물만 낮고 작게 지을 수 있어요.'],
    보전관리지역: [20, 80, '도시 밖에서 자연환경을 지키려고 관리하는 땅이라 개발이 많이 제한돼요.'],
    생산관리지역: [20, 80, '도시 밖에서 농업·임업 등을 위해 관리하는 땅이라 개발이 제한돼요.'],
    계획관리지역: [40, 100, '도시 밖에서 계획적으로 개발을 허용하는 땅이에요. 관리지역 중 지을 수 있는 게 가장 많아요.'],
    농림지역: [20, 80, '농업·임업을 위한 땅이라 지을 수 있는 건물이 아주 적어요.'],
    자연환경보전지역: [20, 80, '자연환경·물을 지키는 땅이라 개발이 가장 엄격히 제한돼요.']
};

export const ZONING_LAW = '국토의 계획 및 이용에 관한 법률 제76조~제78조, 같은 법 시행령 제71조, 제84조, 제85조';

// 세분된 이름이 있으면 빼는 상위 이름 (예: "도시지역" + "자연녹지지역" → 자연녹지지역만)
const PARENTS: [string, (name: string) => boolean][] = [
    ['도시지역', name => /주거지역$|상업지역$|공업지역$|녹지지역$/.test(name)],
    ['관리지역', name => /^(보전|생산|계획)관리지역$/.test(name)],
    ['보전산지', name => name === '공익용산지' || name === '임업용산지'],
    ['군사기지 및 군사시설 보호구역', name => /^(통제|제한)보호구역$/.test(name)]
];

interface RuleDef {
    match: (item: LandUseItem) => boolean;
    level: LandLevel;
    title: string | ((items: LandUseItem[]) => string);
    body: string;
    law: string;
}

const named = (...names: string[]) => (item: LandUseItem) => names.includes(item.name);
const joinNames = (items: LandUseItem[]) => items.map(item => item.name).join(', ');

// 위에서부터 처음 맞는 규칙에 들어감 (공사에 큰 영향을 주는 것만. 나머지는 "그 밖의 규제"에 이름만)
const RULES: RuleDef[] = [
    {
        match: named('개발제한구역'),
        level: 'required',
        title: '개발제한구역(그린벨트)',
        body: '건물을 짓거나, 흙을 쌓고 깎아 땅 모양을 바꾸는 일이 원칙적으로 금지돼요. 법에 정한 시설만 시장·군수·구청장의 허가를 받아 할 수 있어요. 공사 계획 전에 관할 시·군·구 개발제한구역 담당 부서에 가능한지 먼저 물어보세요.',
        law: '개발제한구역의 지정 및 관리에 관한 특별조치법 제12조'
    },
    {
        match: named('도시자연공원구역'),
        level: 'required',
        title: '도시자연공원구역',
        body: '도시 안의 산과 녹지를 지키는 구역이에요. 건물을 짓거나 땅 모양을 바꾸는 일이 원칙적으로 금지되고, 법에 정한 것만 허가를 받아 할 수 있어요.',
        law: '도시공원 및 녹지 등에 관한 법률 제27조'
    },
    {
        match: named('농업진흥구역'),
        level: 'required',
        title: '농업진흥구역',
        body: '농사를 위해 지켜 두는 땅이에요. 농업 생산이나 농지 개량과 관련된 시설(농업인 주택, 농업용 창고 등 정해진 것) 말고는 건물을 짓기 어려워요.',
        law: '농지법 제32조제1항'
    },
    {
        match: named('농업보호구역'),
        level: 'check',
        title: '농업보호구역',
        body: '농업진흥구역에 쓰는 물 등을 지키는 구역이에요. 진흥구역보다는 덜하지만, 지을 수 있는 시설의 종류와 규모가 정해져 있어요.',
        law: '농지법 제32조제2항'
    },
    {
        match: named('공익용산지', '임업용산지', '보전산지'),
        level: 'required',
        title: items => `보전산지 (${joinNames(items)})`,
        body: '산림을 지키려고 지정한 산지예요. 법에 정한 시설 말고는 산지전용(산을 다른 용도로 바꾸는 것)이 제한되고, 공익용산지는 임업용산지보다 더 엄격해요. 할 수 있는 시설이어도 산지전용 허가를 받고 대체산림자원조성비를 내야 해요.',
        law: '산지관리법 제12조, 제14조, 제19조'
    },
    {
        match: named('준보전산지'),
        level: 'check',
        title: '준보전산지',
        body: '보전산지가 아닌 산지라 행위 제한은 덜해요. 다만 건물을 지으려면 산지전용 허가(또는 신고)를 받고 대체산림자원조성비를 내야 해요.',
        law: '산지관리법 제14조, 제15조, 제19조'
    },
    {
        match: named('상수원보호구역'),
        level: 'required',
        title: '상수원보호구역',
        body: '먹는 물의 수원을 지키는 구역이에요. 건물을 새로 짓거나 늘리는 일, 땅 모양을 바꾸는 일이 엄격히 제한되고 관할 관청의 허가가 필요해요.',
        law: '수도법 제7조'
    },
    {
        match: named('국립공원', '도립공원', '군립공원'),
        level: 'required',
        title: items => `자연공원 (${joinNames(items)})`,
        body: '자연공원 안이에요. 건물을 짓거나 땅 모양을 바꾸려면 공원관리청의 허가를 받아야 하고, 공원 안의 용도지구(아래 "그 밖의 규제"의 공원○○지구)에 따라 할 수 있는 일이 크게 달라요.',
        law: '자연공원법 제18조, 제23조'
    },
    {
        match: named('사방지'),
        level: 'check',
        title: '사방지',
        body: '산사태나 흙이 쓸려 내려가는 것을 막으려고 지정한 땅이에요. 나무를 베거나 흙·돌을 파내거나 건물을 짓는 일은 시·도지사의 허가가 필요해요.',
        law: '사방사업법 제14조'
    },
    {
        match: named('통제보호구역'),
        level: 'required',
        title: '군사시설 통제보호구역',
        body: '군사시설 보호를 위해 건물을 새로 짓는 일이 원칙적으로 금지된 구역이에요. 관할 부대와 꼭 먼저 상의해야 해요.',
        law: '군사기지 및 군사시설 보호법 제9조, 제13조'
    },
    {
        match: named('제한보호구역', '군사기지 및 군사시설 보호구역'),
        level: 'check',
        title: items => items.some(item => item.name === '제한보호구역') ? '군사시설 제한보호구역' : '군사시설 보호구역',
        body: '건물을 짓거나 땅을 개발하려면 허가 기관이 관할 부대와 협의해야 해요. 협의 결과에 따라 높이·위치 등이 제한되거나 허가가 안 날 수 있어요.',
        law: '군사기지 및 군사시설 보호법 제9조, 제13조'
    },
    {
        match: item => item.name.includes('비행안전'),
        level: 'check',
        title: items => joinNames(items),
        body: '군 비행장 주변이라 건물·공작물의 높이가 제한돼요. 높은 건물을 계획하면 관할 부대와 협의가 필요해요.',
        law: '군사기지 및 군사시설 보호법 제10조, 제13조'
    },
    {
        match: item => item.name.startsWith('대공방어협조구역'),
        level: 'check',
        title: items => joinNames(items),
        body: '정해진 높이(위탁고도) 이상의 건물을 지으려면 관할 부대와 협의해야 해요. 이름 옆 괄호에 위탁고도가 있으면 그 높이를 기준으로 봐요.',
        law: '군사기지 및 군사시설 보호법 제11조, 제13조'
    },
    {
        match: named('하천구역'),
        level: 'required',
        title: '하천구역',
        body: '하천에 속한 땅이에요. 이 땅을 쓰거나 공사하려면 하천 관리청의 점용허가를 받아야 하고, 건물을 짓기는 매우 어려워요.',
        law: '하천법 제33조'
    },
    {
        match: named('홍수관리구역'),
        level: 'check',
        title: '홍수관리구역',
        body: '홍수 때 물이 넘칠 수 있는 구역이에요. 건물을 짓거나 땅 모양을 바꾸려면 하천 관리청의 허가가 필요할 수 있어요.',
        law: '하천법 제38조'
    },
    {
        match: item => item.code.startsWith('UQS'),
        level: 'check',
        title: items => `도시계획도로 (${joinNames(items)})`,
        body: '도로를 내기로 계획된 땅이 걸쳐 있어요. 그 부분에는 원칙적으로 건물을 지을 수 없고, 도로 공사 때 보상을 받고 수용될 수 있어요. 설계 전에 관할 시·군·구 도시계획 부서에 걸친 범위를 확인하세요.',
        law: '국토의 계획 및 이용에 관한 법률 제64조'
    },
    {
        match: named('지구단위계획구역'),
        level: 'check',
        title: '지구단위계획구역',
        body: '이 지역만의 계획(건물 용도·높이·배치·색채 등)이 따로 있어서, 그 계획에 맞게 지어야 해요. 관할 시·군·구 도시계획 부서에서 지구단위계획 내용을 확인하세요.',
        law: '국토의 계획 및 이용에 관한 법률 제52조, 제54조'
    },
    {
        match: item => item.name === '고도지구' || item.name.endsWith('경관지구'),
        level: 'check',
        title: items => joinNames(items),
        body: '건물 높이의 한도나 경관을 위한 규모·모양 기준이 정해져 있어요. 구체적인 기준은 관할 시·군·구의 도시관리계획과 조례에서 확인하세요.',
        law: '국토의 계획 및 이용에 관한 법률 제37조, 제76조'
    },
    {
        match: named('역사문화환경보호지구'),
        level: 'check',
        title: '역사문화환경보호지구',
        body: '문화유산 주변 환경을 지키려고 정한 지구예요. 조례로 건물의 종류·높이 등이 제한될 수 있어요.',
        law: '국토의 계획 및 이용에 관한 법률 제37조, 제76조'
    },
    {
        match: named('토지거래계약에관한허가구역'),
        level: 'info',
        title: '토지거래허가구역',
        body: '땅을 사고팔 때 시장·군수·구청장의 허가가 필요한 구역이에요. 공사 자체에는 직접 영향이 없지만, 땅을 사서 공사하려면 미리 확인하세요.',
        law: '부동산 거래신고 등에 관한 법률 제10조, 제11조'
    }
];

// 지목(지번 뒤 글자)에 따른 전용 허가. 농지·임야에 건물을 지으려면 용도를 바꾸는 허가가 따로 필요함
const FARM_JIMOK: Record<string, string> = { 전: '전(밭)', 답: '답(논)', 과: '과수원' };

function jimokRules(jibun: string, rules: LandRule[]): LandRule[] {
    const jimok = (jibun || '').trim().split(' ').pop() || '';
    if (FARM_JIMOK[jimok]) {
        return [{
            level: 'check',
            title: `농지 (지목 ${FARM_JIMOK[jimok]})`,
            body: '농지에 건물을 짓거나 다른 용도로 쓰려면 농지전용 허가(또는 신고)를 받고 농지보전부담금을 내야 해요. 실제로 농사를 짓지 않는 땅이어도 지목이 농지면 대상이 될 수 있어요.',
            law: '농지법 제34조, 제35조, 제38조',
            items: []
        }];
    }
    // 산지 규제가 이미 나왔으면 거기서 산지전용을 안내함
    if (jimok === '임' && !rules.some(rule => rule.title.includes('산지'))) {
        return [{
            level: 'check',
            title: '산지 (지목 임야)',
            body: '임야에 건물을 짓거나 다른 용도로 쓰려면 산지전용 허가(또는 신고)를 받고 대체산림자원조성비를 내야 해요.',
            law: '산지관리법 제14조, 제15조, 제19조',
            items: []
        }];
    }
    return [];
}

const LEVEL_ORDER: Record<LandLevel, number> = { required: 0, check: 1, info: 2 };

// jibun: 지목을 읽을 지번 ("1-1 대"). 사업부지 전체처럼 없으면 ''
export function buildLandGuidance(items: LandUseItem[], jibun: string): LandGuidance {
    const names = new Set(items.map(item => item.name));
    const hidden = new Set(PARENTS
        .filter(([parent, isChild]) => names.has(parent) && items.some(item => isChild(item.name)))
        .map(([parent]) => parent));
    const visible = items.filter(item => !hidden.has(item.name));

    const zonings: Zoning[] = [];
    const heritage: LandUseItem[] = [];
    const others: LandUseItem[] = [];
    const matched = new Map<RuleDef, LandUseItem[]>();

    visible.forEach(item => {
        const zoning = ZONING[item.name];
        if (zoning) {
            zonings.push({ item, coverage: zoning[0], floorRatio: zoning[1], text: zoning[2] });
            return;
        }
        if (item.code.startsWith('UOC')) {
            heritage.push(item);
            return;
        }
        const rule = RULES.find(def => def.match(item));
        if (rule) {
            matched.set(rule, [...(matched.get(rule) || []), item]);
            return;
        }
        // "도시지역"만 있고 세분이 없는 경우 등은 그 밖의 규제로
        others.push(item);
    });

    const rules: LandRule[] = RULES
        .filter(def => matched.has(def))
        .map(def => {
            const found = matched.get(def)!;
            return {
                level: def.level,
                title: typeof def.title === 'function' ? def.title(found) : def.title,
                body: def.body,
                law: def.law,
                items: found
            };
        });
    rules.push(...jimokRules(jibun, rules));
    rules.sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);

    return { zonings, rules, heritage, others };
}
