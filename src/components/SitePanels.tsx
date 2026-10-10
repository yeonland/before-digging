// 도면(DXF) 사업부지: 경계 레이어·좌표계 고르기, 필지별 진단 표
import type { CrsCandidate, DxfLayer, ElevationPoint } from '../lib/dxf-site.js';
import type { RiskLevel } from '../lib/guidance.js';
import { formatArea, shortAddress } from '../lib/format';
import type { SiteParcelResult, SiteResponse } from '../types';

export interface SiteDraft {
    fileName: string;
    layers: DxfLayer[];
    elevations: ElevationPoint[];
    layerIndex: number;
    crs: number | null;
    candidates: (CrsCandidate & { address: string })[]; // 지적도 위로 떨어지는 좌표계 후보
}

export function SiteSetup({ draft, onLayerChange, onCrsChange, onRun }: {
    draft: SiteDraft;
    onLayerChange: (index: number) => void;
    onCrsChange: (code: number) => void;
    onRun: () => void;
}) {
    return (
        <>
            <h3>도면으로 사업부지 진단</h3>
            <p className="panel-sub">{draft.fileName} · 도면은 이 브라우저에서만 읽고, 진단에는 경계 좌표만 보내요.</p>
            <h4>1. 사업부지 경계 레이어</h4>
            <p className="panel-sub">닫힌 선이 있는 레이어예요. 넓은 순으로 보여주고, 다른 경계 안에 있는 경계는 제외 구역으로 봐요.</p>
            <ul className="site-options">
                {draft.layers.map((item, index) => (
                    <li key={index}>
                        <label>
                            <input type="radio" name="site-layer" checked={index === draft.layerIndex} onChange={() => onLayerChange(index)} />
                            {' '}<b>{item.name}</b> · 경계 {item.polygons.length}개 · 약 {formatArea(Math.round(item.area))}
                            {item.scale !== 1 && <> <span className="site-option-note">(mm 단위 도면으로 보고 m로 바꿨어요)</span></>}
                        </label>
                    </li>
                ))}
            </ul>
            <h4>2. 도면 좌표계</h4>
            {draft.candidates.length > 0 ? (
                <>
                    <p className="panel-sub">DXF에는 좌표계 정보가 없어요. 좌표계마다 위치가 달라지니, <b>사업지 주소와 맞는 것</b>을 골라 주세요. 고르면 지도에 경계가 그려져요.</p>
                    <ul className="site-options">
                        {draft.candidates.map(item => (
                            <li key={item.code}>
                                <label>
                                    <input type="radio" name="site-crs" checked={item.code === draft.crs} onChange={() => onCrsChange(item.code)} />
                                    {' '}<b>{item.name}</b> (EPSG:{item.code}) → <b>{item.address}</b> 부근{' '}
                                    <span className="site-option-note">{item.note}</span>
                                </label>
                            </li>
                        ))}
                    </ul>
                    <button type="button" className="site-run" disabled={!draft.crs} onClick={onRun}>이 경계로 진단하기</button>
                </>
            ) : (
                <p>도면 좌표를 어떤 좌표계로 읽어도 우리나라 땅 위에 오지 않아요. 측량 좌표(TM 좌표)가 아니라 임의의 좌표(0,0 기준 등)로 그린 도면일 수 있어요. 측량 성과나 지적 좌표로 맞춘 도면으로 다시 올려 주세요.</p>
            )}
        </>
    );
}

const RISK_ORDER: Record<RiskLevel, number> = { high: 0, caution: 1, unknown: 2, low: 3 };

// 위험도가 높은 순, 같으면 부지 안 면적이 넓은 순
export function siteParcelOrder(data: SiteResponse): { item: SiteParcelResult; index: number }[] {
    return data.parcels
        .map((item, index) => ({ item, index }))
        .sort((a, b) => (RISK_ORDER[a.item.risk.level] - RISK_ORDER[b.item.risk.level]) ||
            ((b.item.parcel.inSiteArea || 0) - (a.item.parcel.inSiteArea || 0)));
}

// 필지별 표를 CSV로 내려받기 (엑셀에서 한글이 깨지지 않도록 BOM을 붙임)
function downloadSiteCsv(data: SiteResponse) {
    const quote = (value: unknown) => `"${String(value).replace(/"/g, '""')}"`;
    const lines = [
        ['위험도', '주소', '필지 면적(㎡)', '부지 안 면적(㎡)', '이유'].map(quote).join(','),
        ...siteParcelOrder(data).map(({ item }) => [
            item.risk.label,
            item.parcel.address,
            item.parcel.area,
            item.parcel.inSiteArea,
            item.risk.reasons.join(' / ')
        ].map(quote).join(','))
    ];
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `사업부지_필지별_진단_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
}

export function SiteTable({ data, onSelect }: { data: SiteResponse; onSelect: (index: number) => void }) {
    const counts: Partial<Record<RiskLevel, number>> = {};
    data.parcels.forEach(item => { counts[item.risk.level] = (counts[item.risk.level] || 0) + 1; });
    const countText = (['high', 'caution', 'unknown', 'low'] as RiskLevel[])
        .filter(level => counts[level])
        .map(level => {
            const sample = data.parcels.find(item => item.risk.level === level)!.risk;
            return `${sample.icon} ${sample.label} ${counts[level]}`;
        })
        .join(' · ');

    return (
        <details open>
            <summary><b>필지별 진단 ({data.site.parcelCount}필지)</b> · {countText}</summary>
            <p className="panel-sub">위험도가 높은 순으로 보여줘요. 줄을 누르거나 지도에서 필지를 누르면 그 필지의 진단을 볼 수 있어요.</p>
            <div className="site-table-wrap">
                <table className="site-table">
                    <thead><tr><th>위험도</th><th>지번</th><th>필지 면적</th><th>부지 안 면적</th><th>주요 이유</th></tr></thead>
                    <tbody>
                        {siteParcelOrder(data).map(({ item, index }) => (
                            <tr key={index} onClick={() => onSelect(index)}>
                                <td style={{ whiteSpace: 'nowrap' }}>{item.risk.icon} {item.risk.label}</td>
                                <td>{shortAddress(item.parcel.address)}</td>
                                <td className="num">{formatArea(item.parcel.area)}</td>
                                <td className="num">{formatArea(item.parcel.inSiteArea || 0)}</td>
                                <td>{item.risk.reasons[0] || ''}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <button type="button" className="go-panel" onClick={() => downloadSiteCsv(data)}>표 내려받기 (CSV)</button>
            {data.site.parcelsTruncated && <p className="disclaimer">※ 필지가 너무 많아 일부만 진단했어요.</p>}
        </details>
    );
}
