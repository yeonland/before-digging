// guidance.js의 타입 (규칙은 guidance.js에서 고침)
import type { AnalysisResult } from '../types';

export interface Step {
    level: 'required' | 'check' | 'info';
    title: string;
    body: string;
    items?: string[];
    details?: { summary: string; items: string[] } | null;
    law: string | null;
}

export interface Cost {
    summary: string;
    law: string;
    support: { level: 'ask' | 'yes' | 'no'; text: string; law?: string };
}

export interface Guidance {
    steps: Step[];
    cost: Cost | null;
    notes: { text: string; law: string }[];
    incomplete: boolean;
}

export interface GuidanceInput {
    workType: string;
    landArea: number | null;
    floorArea: number | null;
}

export type RiskLevel = 'high' | 'caution' | 'low' | 'unknown';

export interface Risk {
    level: RiskLevel;
    label: string;
    icon: string;
    summary: string;
    reasons: string[];
    incomplete: boolean;
    criteria: { level: string; label: string; icon: string; summary: string; rules: string[] }[];
}

export function buildGuidance(result: AnalysisResult, input: GuidanceInput): Guidance;
export function buildRisk(result: AnalysisResult): Risk;
export function isNaturalZone(zone: { name?: string | null } | null): boolean;
