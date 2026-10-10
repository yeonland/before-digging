// 여러 화면에서 같이 쓰는 작은 함수들 (면적 표시, 입력칸 숫자 읽기, 걸친 영역 목록)
import { isNaturalZone } from '../result/guidance.js';
import type { AnalysisResult, SiteOverlap } from './types';

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
