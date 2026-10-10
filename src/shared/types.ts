// /api 응답 모양 (api/_lib/analyze.js, api/parcel.js, api/site.js, api/heritage.js, api/search.js)
import type { Geometry } from 'geojson';
import type { Risk } from '../result/guidance.js';

export interface Zone {
    type: string;
    name: string;
    overlapArea: number;
    overlapRatio: number;
    edgeOnly: boolean;
}

export interface SiteOverlap {
    name: string | null;
    mapNo?: string | null;
    overlapArea: number;
    overlapRatio: number;
    edgeOnly: boolean;
}

export interface NearbySite {
    name: string;
    mapNo?: string | null;
    distance: number;
}

export interface Agency {
    name: string;
    phone: string;
    homepage?: string | null;
}

export interface FollowUp {
    name: string;
    method: string;
    year: number | null;
    report?: string | null;
    agency?: Agency | null;
}

export interface Survey {
    name: string | null;
    method: string;
    kind: string; // excavation, surface, surfaceSite
    year: number | null;
    report?: string | null;
    agency?: Agency | null;
    siteFound?: boolean | null;
    followUps?: FollowUp[];
    distance: number;
}

export interface Allowance {
    heritage: string | null;
    zone: string;
    overlapArea: number;
    overlapRatio: number;
    rule: { flat: string[]; slope: string[] } | null;
    common: string[];
}

export interface WorldHeritage {
    district: string[];
    core: string[];
    buffer: string[];
    nearest: { name: string; distance: number } | null;
}

export interface Boreholes {
    radius: number;
    baseDate: string;
    items: { distance: number; elevation: number; depth: number }[];
}

export interface Parcel {
    pnu?: string;
    address: string;
    jibun: string;
    area: number;
    inSiteArea?: number;
    geometry: Geometry;
}

// 한 경계(필지·사업부지)의 진단 결과. 불러오지 못한 자료는 null
export interface AnalysisResult {
    target?: 'site';
    parcel: Parcel;
    zones: Zone[] | null;
    sites: SiteOverlap[] | null;
    nearbySites?: NearbySite[] | null;
    surveys?: Survey[] | null;
    surveyStats?: { excavationsWithin200: number; excavationsWithin500: number } | null;
    allowance?: Allowance[] | null;
    worldHeritage?: WorldHeritage | null;
    boreholes?: Boreholes | null;
    overlap: { area: number; ratio: number; siteArea: number; siteRatio: number };
}

export interface SiteParcelResult extends AnalysisResult {
    risk: Risk;
}

// 도면에서 읽은 부지 표고
export interface Elevation {
    count: number;
    source: 'text' | 'height';
    min: number;
    max: number;
    median: number;
}

export interface SiteResponse {
    site: { area: number; parcelCount: number; parcelsTruncated: boolean; geometry: Geometry };
    result: Omit<AnalysisResult, 'parcel'>;
    parcels: SiteParcelResult[];
    elevation: Elevation | null;
}

// 지적도에 없는 곳(바다 등)의 지점 진단
export interface PointResult {
    zones: { name: string; type: string }[] | null;
    sites: { name: string | null }[] | null;
}

export interface SearchResult {
    label: string;
    sub?: string;
    lat: number;
    lng: number;
}
