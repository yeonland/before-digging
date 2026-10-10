// dxf-site.js의 타입 (규칙은 dxf-site.js에서 고침)
import type { MultiPolygon } from 'geojson';
import type { Elevation } from '../types';

type Ring = [number, number][];

export interface DxfLayer {
    name: string;
    rings: Ring[];
    polygons: { ring: Ring; holes: Ring[] }[];
    scale: number;
    area: number;
}

export interface ElevationPoint {
    x: number;
    y: number;
    z: number;
    kind: 'text' | 'point' | 'contour';
}

export interface Crs {
    code: number;
    name: string;
    note: string;
    def: string;
    raw?: boolean;
}

export interface CrsCandidate extends Crs {
    center: [number, number];
    swapped?: boolean;
}

export const CRS_LIST: Crs[];
export function decodeDxf(buffer: ArrayBuffer): string;
export function readBoundaries(text: string): { layers: DxfLayer[]; elevations: ElevationPoint[] };
export function crsCandidates(layer: DxfLayer): CrsCandidate[];
export function pointCandidates(first: number, second: number): CrsCandidate[];
export function toGeometry(layer: DxfLayer, crsCode: number): MultiPolygon;
export function siteElevation(layer: DxfLayer, elevations: ElevationPoint[]): Elevation | null;
