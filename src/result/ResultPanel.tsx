// 진단 결과 패널: 위험도, 걸친 영역, 입력칸(공사 종류·면적·해발), 해야 할 일 (규칙은 guidance.js)
import { useCallback, useState, type ReactNode } from 'react';
import { buildGuidance, buildRisk, type Risk } from './guidance.js';
import { WORK_TYPES, type PanelInputs } from './share';
import type { DepartmentData } from './departments';
import { ResultSections } from './ResultSections';
import { formatArea, overlapItems, readElevation, readNumber } from '../shared/format';
import { OverlapLabel } from '../shared/OverlapLabel';
import type { AnalysisResult, Elevation } from '../shared/types';

export interface ResultOptions {
    title?: string;
    areaLabel?: string;
    back?: boolean; // 도면 사업부지 전체로 돌아가는 버튼
    shareable?: boolean; // false면 링크 복사 버튼을 빼고 PDF 저장만
    elevation?: Elevation | null; // 도면에서 읽은 표고
    siteTable?: boolean; // 위험도 아래에 도면 사업부지 필지별 표
}

// 위험도 등급 박스: 등급, 해당 이유, 펼쳐보는 등급 기준표
function RiskBox({ risk }: { risk: Risk }) {
    return (
        <div className={`risk-box ${risk.level}`}>
            <div className="risk-title">위험도 {risk.icon} {risk.label}</div>
            <div>{risk.summary}</div>
            <ul>{risk.reasons.map((reason, index) => <li key={index}>{reason}</li>)}</ul>
            <details className="risk-criteria">
                <summary>산정 근거 보기</summary>
                <p className="risk-note" style={{ marginTop: 6 }}>위에서부터 확인해 처음 해당하는 등급으로 정하고, 해당하는 이유는 모두 보여줘요.</p>
                <table>
                    <tbody>
                        {risk.criteria.map(group => (
                            <tr key={group.level}>
                                <th>{group.icon} {group.label}</th>
                                <td>{group.rules.map((rule, index) => <span key={index}>{index > 0 && <br />}{rule}</span>)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </details>
            <p className="risk-note">위험도는 참고자료일 뿐이에요.</p>
        </div>
    );
}

// 걸친 영역 전체 목록 (3건 이하면 팝업에 다 보이므로 접어 둠)
function OverlapList({ data, areaName }: { data: AnalysisResult; areaName: string }) {
    const items = overlapItems(data);
    if (items.length === 0) return null;
    return (
        <details className="overlap-list" id="overlap-list" open={items.length > 3}>
            <summary><b>{areaName}에 걸친 영역 {items.length}건</b></summary>
            <div className="site-table-wrap">
                <table className="site-table">
                    <thead><tr><th>이름 (종류)</th><th>겹친 면적</th><th>비율</th></tr></thead>
                    <tbody>
                        {items.map((item, index) => (
                            <tr key={index}>
                                <td><OverlapLabel item={item} />{item.edgeOnly && <span style={{ color: '#666' }}> · 경계에만 걸침</span>}</td>
                                <td className="num">{formatArea(item.overlapArea)}</td>
                                <td className="num">{item.overlapRatio}%</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <p className="disclaimer" style={{ marginTop: 0 }}>많이 겹친 순이에요. 같은 이름의 문화유적이 여러 번 등록된 경우는 하나만 보여줘요.</p>
        </details>
    );
}

export function ResultPanel({ data, options, inputs, onInputsChange, shareUrl, departments, siteTable, onBack }: {
    data: AnalysisResult;
    options: ResultOptions;
    inputs: PanelInputs;
    onInputsChange: (inputs: PanelInputs) => void;
    shareUrl: string | null; // 링크 복사로 보낼 주소 (공유할 수 없는 결과면 null)
    departments: DepartmentData | null;
    siteTable?: ReactNode;
    onBack: () => void;
}) {
    const [shareStatus, setShareStatus] = useState('');
    const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
    const selectOnShow = useCallback((element: HTMLInputElement | null) => element?.select(), []);

    const set = (key: keyof PanelInputs) => (event: { target: { value: string } }) =>
        onInputsChange({ ...inputs, [key]: event.target.value });

    const guidance = buildGuidance(data, {
        workType: inputs.work,
        landArea: readNumber(inputs.landArea),
        floorArea: inputs.work === 'business' ? readNumber(inputs.floorArea) : null
    });

    async function copyShareLink() {
        if (!shareUrl) return;
        // 휴대폰은 공유 창(카카오톡, 문자 등)을 바로 띄움
        if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
            try {
                await navigator.share({ title: '땅파기전 진단 결과', url: shareUrl });
                return;
            } catch (error) {
                if ((error as Error).name === 'AbortError') return;
            }
        }

        try {
            await navigator.clipboard.writeText(shareUrl);
            setShareStatus('링크를 복사했어요. 열면 그때의 데이터로 다시 진단해요.');
        } catch {
            // 복사가 막힌 브라우저: 링크를 보여주고 직접 복사하게 함
            setFallbackUrl(shareUrl);
            setShareStatus('자동 복사가 안 돼요. 아래 링크를 복사해 주세요.');
        }
    }

    return (
        <>
            {options.back && <button type="button" className="go-panel" onClick={onBack}>← 도면 사업부지 전체로</button>}
            <h3>{options.title || '진단 결과 · 해야 할 일'}</h3>
            <p className="panel-sub">{data.parcel.address} · {options.areaLabel || '필지 면적'} {formatArea(data.parcel.area)}</p>
            <div className="share-bar">
                {shareUrl && <button type="button" className="go-panel" onClick={copyShareLink}>🔗 링크 복사</button>}
                <button type="button" className="go-panel" onClick={() => window.print()}>🖨️ PDF로 저장·인쇄</button>
                <span className="share-status" role="status">{shareStatus}</span>
            </div>
            {fallbackUrl && (
                <input className="share-link-input" type="text" readOnly value={fallbackUrl} aria-label="공유 링크"
                    ref={selectOnShow} />
            )}
            <RiskBox risk={buildRisk(data)} />
            <OverlapList data={data} areaName={data.target === 'site' ? '부지' : '필지'} />
            {siteTable}
            <div className="inputs">
                <label>공사 종류{' '}
                    <select value={inputs.work} onChange={set('work')}>
                        {WORK_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </label>
                <label>사업(대지) 면적 <input type="number" min="0" step="1" value={inputs.landArea} onChange={set('landArea')} /> ㎡</label>
                <label hidden={inputs.work !== 'business'}>건축물 연면적 <input type="number" min="0" step="1" value={inputs.floorArea} onChange={set('floorArea')} /> ㎡</label>
                <label>지반 해발 <input type="number" step="0.01" placeholder="예: 35.2" value={inputs.ground} onChange={set('ground')} /> m</label>
                <label>굴착 깊이 <input type="number" min="0" step="0.1" placeholder="예: 3" value={inputs.depth} onChange={set('depth')} /> m</label>
            </div>
            <ResultSections
                data={data}
                guidance={guidance}
                ground={readElevation(inputs.ground)}
                depth={readNumber(inputs.depth)}
                elevation={options.elevation || null}
                departments={departments}
                onUseBorehole={value => onInputsChange({ ...inputs, ground: String(value) })}
            />
        </>
    );
}
