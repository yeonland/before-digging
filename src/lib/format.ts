// 화면에 보여줄 글자를 만드는 작은 함수들
import { isNaturalZone } from './guidance.js';
import type { AnalysisResult, SiteOverlap } from '../types';

export function formatArea(value: number): string {
    return `${value.toLocaleString('ko-KR')}㎡`;
}

// 입력칸 값 → 0 이상 숫자 (비었거나 잘못되면 null)
export function readNumber(text: string): number | null {
    if (text.trim() === '') return null;
    const value = Number(text);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

// 지반 해발은 바닷가 매립지처럼 0보다 낮을 수 있음
export function readElevation(text: string): number | null {
    if (text.trim() === '') return null;
    const value = Number(text);
    return Number.isFinite(value) && value >= -20 && value <= 2000 ? value : null;
}

// 주소에서 시·도와 시·군·구를 뺀 나머지 (예: "인왕동 811-1")
export function shortAddress(address: string): string {
    const words = (address || '').split(' ');
    return words.slice(/세종/.test(words[0]) ? 1 : 2).join(' ') || address;
}

// 필지 주소에서 관할 시·군·구 (일반구가 있는 시는 시청이 담당하는 경우가 많아 시까지만)
// 같은 이름(고성군 등)이 있어 시·도를 붙임. 예: "경상북도 경주시 인왕동" → 경상북도 경주시, "세종특별자치시 …" → 세종특별자치시
export function addressDistrict(address: string | undefined): string | null {
    const [sido, sigungu] = (address || '').split(' ');
    if (!sido) return null;
    return /세종/.test(sido) || !sigungu ? sido : `${sido} ${sigungu}`;
}

// 필지 주소에서 동·리 이름 (발굴조사 현황은 주소 한 칸에서 그대로 찾아서 동·리 이름만 넣음)
export function addressDong(address: string | undefined): string | null {
    const words = (address || '').split(' ').filter(word => /(동|리|가)$/.test(word) && !/(시|군|구|읍|면)$/.test(word));
    return words[words.length - 1] || null;
}

// 국가유산청 발굴조사 보고서·현황 목록 (e-minwon, 국가유산청 홈페이지에 들어가 있는 목록)
// 주소에 검색어를 넣으면 걸러진 목록이 열림. 보고서는 띄어쓴 단어가 모두 들어간 것을 찾아줌
export const REPORT_SEARCH_URL = 'https://www.e-minwon.go.kr/ge/ee/getListEcexmRptp.do?txtRptNm=';
export const STATUS_SEARCH_URL = 'https://www.e-minwon.go.kr/ge/ee/getListEcexmPrmsnAply.do?searchVal=';

// 조사명에서 "괘릉리 산37-1"처럼 동·리 이름과 번지를 뽑아 보고서 검색어로 씀
export function reportSearchWord(name: string | null): string | null {
    const match = (name || '').match(/([가-힣0-9]+(?:동|리|가))\s*\(?\s*(산\s?\d+(?:-\d+)?|\d+(?:-\d+)?)?/);
    if (!match) return null;
    return match[2] ? `${match[1]} ${match[2].replace(/\s/g, '')}` : match[1];
}

// 좌표 입력: "198342.5, 451230.1", "X=451230 Y=198342", "37.5786 126.977" 같은 숫자 두 개
// ("815-1" 같은 번지는 숫자 하나로 보고 좌표로 다루지 않음)
export function parseCoordinates(keyword: string): [number, number] | null {
    const tokens = keyword.replace(/[XYxy]\s*[=:]?|[()]/g, ' ').trim().split(/[\s,]+/);
    return tokens.length === 2 && tokens.every(token => /^-?\d+(?:\.\d+)?$/.test(token))
        ? [Number(tokens[0]), Number(tokens[1])]
        : null;
}

// 같은 이름이 여러 번 등록된 유적은 가장 많이 겹친 것 하나만 표시
function dedupeSites(sites: SiteOverlap[]): SiteOverlap[] {
    const byName = new Map<string | null, SiteOverlap>();
    sites.forEach(site => {
        const prev = byName.get(site.name);
        if (!prev || site.overlapArea > prev.overlapArea) byName.set(site.name, site);
    });
    return [...byName.values()];
}

export interface OverlapItem {
    name: string;
    type: string;
    natural?: boolean;
    overlapArea: number;
    overlapRatio: number;
    edgeOnly: boolean;
}

// 필지(부지)에 걸친 국가유산 구역·문화유적 분포 범위, 많이 겹친 순
export function overlapItems(data: Pick<AnalysisResult, 'zones' | 'sites'>): OverlapItem[] {
    return [
        ...(data.zones || []).map(zone => ({
            name: zone.name,
            type: isNaturalZone(zone) ? `${zone.type} · 자연유산` : zone.type,
            natural: isNaturalZone(zone),
            overlapArea: zone.overlapArea,
            overlapRatio: zone.overlapRatio,
            edgeOnly: zone.edgeOnly
        })),
        ...dedupeSites(data.sites || []).map(site => ({
            name: site.name || '이름 없음',
            type: '문화유적 분포 범위',
            overlapArea: site.overlapArea,
            overlapRatio: site.overlapRatio,
            edgeOnly: site.edgeOnly
        }))
    ].sort((a, b) => b.overlapArea - a.overlapArea);
}
