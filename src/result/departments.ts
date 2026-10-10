// 시·군·구 문화유산 담당 부서 이름 (scripts/update-departments.mjs로 행정표준코드 기관코드에서 만듦)

export interface DepartmentData {
    baseDate?: string;
    districts: Record<string, { departments: string[]; sure: boolean }>;
}

export interface FoundDepartment {
    key: string;
    departments: string[];
    sure: boolean;
}

// 처음 진단할 때 필요하므로 따로 나눠 받음 (매달 자동 갱신되는 data/departments.json)
export function loadDepartments(): Promise<DepartmentData | null> {
    return import('../../data/departments.json')
        .then(module => module.default as DepartmentData)
        .catch(() => null);
}

// 기관코드 자료와 주소의 시·도 이름이 다를 수 있어 맞춤 (예: 2026년 전남·광주 통합)
const SIDO_ALIASES: Record<string, string> = {
    전라남도: '전남광주통합특별시',
    광주광역시: '전남광주통합특별시',
    강원도: '강원특별자치도',
    전라북도: '전북특별자치도'
};

export function findDepartment(data: DepartmentData | null, district: string | null): FoundDepartment | null {
    if (!data || !district) return null;
    const districts = data.districts;
    const [sido, sigungu] = district.split(' ');
    const keys = [district, sigungu ? `${SIDO_ALIASES[sido] || sido} ${sigungu}` : null].filter((name): name is string => Boolean(name));
    const key = keys.find(name => districts[name]);
    if (key) return { key, ...districts[key] };

    // 시·도 이름이 또 바뀐 경우: 시·군·구 이름이 하나뿐이면 그것으로
    const matches = sigungu ? Object.keys(districts).filter(name => name.endsWith(` ${sigungu}`)) : [];
    return matches.length === 1 ? { key: matches[0], ...districts[matches[0]] } : null;
}

// 부서가 속한 청 이름: 종로구 → 종로구청, 세종특별자치시 → 세종특별자치시청
export function officeName(district: string): string {
    const name = district.split(' ').pop() || district;
    return /(시|군|구)$/.test(name) ? `${name}청` : name;
}
