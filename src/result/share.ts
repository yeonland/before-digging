// 결과 공유 링크: 진단한 위치(+ 공사 종류·면적·해발 입력)를 주소창에 담음
// 결과를 저장하지 않고, 링크를 열 때 그 시점 데이터로 다시 진단
import { inKorea } from '../shared/api';
import { readElevation, readNumber } from '../shared/format';

export interface LatLng {
    lat: number;
    lng: number;
}

// 결과 패널의 입력칸 (입력칸 그대로 글자로 보관)
export interface PanelInputs {
    work: string;
    landArea: string;
    floorArea: string;
    ground: string;
    depth: string;
}

export const WORK_TYPES: [string, string][] = [
    ['', '선택 안 함'],
    ['house', '단독주택'],
    ['farm', '농업인·어업인 시설물'],
    ['business', '개인사업자 시설물'],
    ['factory', '공장'],
    ['other', '그 밖의 공사']
];

// inputs: 패널이 지금 위치의 결과일 때만 넘김 (다른 곳을 눌러 진단 중이면 이전 입력을 섞지 않음)
export function buildShareUrl(location: LatLng | null, inputs: { values: PanelInputs; parcelArea: number } | null): string {
    const url = new URL(window.location.pathname, window.location.origin);
    if (!location) return url.toString();

    url.searchParams.set('lat', location.lat.toFixed(6));
    url.searchParams.set('lng', location.lng.toFixed(6));

    if (inputs) {
        const { values, parcelArea } = inputs;
        if (values.work) url.searchParams.set('work', values.work);
        // 사업 면적은 필지 면적과 다르게 고쳤을 때만 담음
        const area = readNumber(values.landArea);
        if (area !== null && area !== Math.round(parcelArea)) url.searchParams.set('area', String(area));
        const floor = readNumber(values.floorArea);
        if (values.work === 'business' && floor !== null) url.searchParams.set('floor', String(floor));
        const ground = readElevation(values.ground);
        if (ground !== null) url.searchParams.set('ground', String(ground));
        const depth = readNumber(values.depth);
        if (depth !== null) url.searchParams.set('depth', String(depth));
    }
    return url.toString();
}

export interface SharedLink {
    location: LatLng;
    work: string;
    area: number | null;
    floor: number | null;
    ground: number | null;
    depth: number | null;
}

// 공유 링크로 열었으면 위치와 입력값을 읽음 (우리나라 밖 좌표는 무시)
export function readSharedLink(search: string): SharedLink | null {
    const params = new URLSearchParams(search);
    const lat = Number(params.get('lat'));
    const lng = Number(params.get('lng'));
    if (!params.has('lat') || !params.has('lng') || !inKorea(lng, lat)) return null;

    const number = (name: string) => {
        const value = Number(params.get(name));
        return params.has(name) && Number.isFinite(value) && value >= 0 ? value : null;
    };
    const work = params.get('work') || '';
    const ground = Number(params.get('ground'));
    return {
        location: { lat, lng },
        work: WORK_TYPES.some(([value]) => value === work) ? work : '',
        area: number('area'),
        floor: number('floor'),
        ground: params.has('ground') && Number.isFinite(ground) && ground >= -20 && ground <= 2000 ? ground : null,
        depth: number('depth')
    };
}
