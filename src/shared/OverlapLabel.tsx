import type { OverlapItem } from './format';

// 이름이 없는 구역(역사문화환경 보존지역 등)은 종류만 표시
export function OverlapLabel({ item }: { item: Pick<OverlapItem, 'name' | 'type'> }) {
    return item.name
        ? <>{item.name} <span className="muted">({item.type})</span></>
        : <>{item.type}</>;
}
