// 진단 결과 패널: 맨 위 요약(위험도·할 일 개수·걸친 영역·공사 정보 입력칸), 아래는 탭
// 탭: 국가유산(해야 할 일·굴착·비용) / 토지 규제 / 주변 자료 / 문의 (규칙은 guidance.js, land-rules.ts)
import { useCallback, useState, type ReactNode } from 'react';
import { buildGuidance, buildRisk, type Guidance, type Risk } from './guidance.js';
import { buildLandGuidance } from './land-rules';
import { LandUseSection } from './LandUseSection';
import { WORK_TYPES, type PanelInputs } from './share';
import type { DepartmentData } from './departments';
import { ContactSection, HeritageSections, NearbySections } from './ResultSections';
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

type TabId = 'heritage' | 'land' | 'nearby' | 'contact';

const TABS: { id: TabId; label: string }[] = [
    { id: 'heritage', label: '국가유산' },
    { id: 'land', label: '토지 규제' },
    { id: 'nearby', label: '주변 자료' },
    { id: 'contact', label: '문의' }
];

interface Count {
    tab: TabId;
    label: string;
    value: number;
    level: 'required' | 'check' | 'info';
}

// 요약에 보여줄 개수: 꼭 해야 할 일, 공사에 영향을 주는 토지 규제, 주변 조사 이력
function buildCounts(data: AnalysisResult, guidance: Guidance): Count[] {
    const counts: Count[] = [];
    const stepCount = (level: string) => guidance.steps.filter(step => step.level === level).length;
    const add = (tab: TabId, label: string, value: number, level: Count['level']) => {
        if (value > 0) counts.push({ tab, label, value, level });
    };

    add('heritage', '꼭 할 일', stepCount('required'), 'required');
    add('heritage', '확인할 일', stepCount('check'), 'check');
    if (data.landUse) {
        const rules = buildLandGuidance(data.landUse, data.target === 'site' ? '' : data.parcel.jibun).rules;
        add('land', '공사 제한 규제', rules.filter(rule => rule.level === 'required').length, 'required');
        add('land', '확인할 토지 규제', rules.filter(rule => rule.level === 'check').length, 'check');
    }
    add('nearby', '주변 조사', (data.surveys || []).length, 'info');
    return counts;
}

// 위험도 등급 박스: 등급, 할 일 개수(누르면 그 탭으로), 해당 이유, 펼쳐보는 등급 기준표
function RiskBox({ risk, counts, onTab }: { risk: Risk; counts: Count[]; onTab: (tab: TabId) => void }) {
    return (
        <div className={`risk-box ${risk.level}`}>
            <div className="risk-head">
                <span className="risk-badge">{risk.icon} {risk.label}</span>
                <span className="risk-title">국가유산 위험도</span>
            </div>
            <div>{risk.summary}</div>
            {counts.length > 0 && (
                <div className="count-row">
                    {counts.map(count => (
                        <button key={count.label} type="button" className={`count-chip ${count.level}`} onClick={() => onTab(count.tab)}>
                            {count.label} <b>{count.value}</b>
                        </button>
                    ))}
                </div>
            )}
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
            <p className="risk-note">위험도는 땅속 유적을 기준으로 한 참고자료일 뿐이에요.</p>
        </div>
    );
}

// 걸친 영역 전체 목록 (3건 이하면 팝업에 다 보이므로 접어 둠)
function OverlapList({ data, areaName }: { data: AnalysisResult; areaName: string }) {
    const items = overlapItems(data);
    if (items.length === 0) return null;
    return (
        <details className="overlap-list" id="overlap-list" open={items.length > 3}>
            <summary><b>{areaName}에 걸친 국가유산 영역 {items.length}건</b></summary>
            <div className="site-table-wrap">
                <table className="site-table">
                    <thead><tr><th>이름 (종류)</th><th>겹친 면적</th><th>비율</th></tr></thead>
                    <tbody>
                        {items.map((item, index) => (
                            <tr key={index}>
                                <td><OverlapLabel item={item} />{item.edgeOnly && <span className="muted"> · 경계에만 걸침</span>}</td>
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
    const [tab, setTab] = useState<TabId>('heritage');
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
    const counts = buildCounts(data, guidance);
    const risk = buildRisk(data);

    // 요약의 개수를 누르면 그 탭을 열고 탭 머리로 이동
    function openTab(id: TabId) {
        setTab(id);
        document.getElementById('result-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

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
            {/* 휴대폰 시트가 접혀 있어도 제목 줄에서 위험도가 보이게 */}
            <div className="result-head">
                <h3>{options.title || '진단 결과'}</h3>
                <span className={`risk-badge ${risk.level}`}>{risk.icon} {risk.label}</span>
            </div>
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
            <RiskBox risk={risk} counts={counts} onTab={openTab} />
            <OverlapList data={data} areaName={data.target === 'site' ? '부지' : '필지'} />
            {siteTable}
            <div className="inputs">
                <div className="inputs-title">공사 정보 <span className="muted small">넣으면 비용·굴착·용적률 안내가 맞춰져요</span></div>
                <label>공사 종류
                    <select value={inputs.work} onChange={set('work')}>
                        {WORK_TYPES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </label>
                <label>사업(대지) 면적 <span className="unit-input"><input type="number" min="0" step="1" value={inputs.landArea} onChange={set('landArea')} />㎡</span></label>
                <label hidden={inputs.work !== 'business'}>건축물 연면적 <span className="unit-input"><input type="number" min="0" step="1" value={inputs.floorArea} onChange={set('floorArea')} />㎡</span></label>
                <label>지반 해발 <span className="unit-input"><input type="number" step="0.01" placeholder="예: 35.2" value={inputs.ground} onChange={set('ground')} />m</span></label>
                <label>굴착 깊이 <span className="unit-input"><input type="number" min="0" step="0.1" placeholder="예: 3" value={inputs.depth} onChange={set('depth')} />m</span></label>
            </div>

            <div className="tabs" role="tablist" id="result-tabs">
                {TABS.map(item => (
                    <button key={item.id} type="button" role="tab" id={`tab-${item.id}`} aria-selected={tab === item.id}
                        aria-controls={`tabpanel-${item.id}`} className="tab" onClick={() => setTab(item.id)}>
                        {item.label}
                    </button>
                ))}
            </div>
            {/* 탭 내용은 모두 그려 두고 고른 것만 보여줌 (인쇄할 때는 모두 보임) */}
            <div className="tab-panel" role="tabpanel" id="tabpanel-heritage" aria-labelledby="tab-heritage" hidden={tab !== 'heritage'}>
                <h3 className="print-only">국가유산</h3>
                <HeritageSections
                    data={data}
                    guidance={guidance}
                    ground={readElevation(inputs.ground)}
                    depth={readNumber(inputs.depth)}
                    elevation={options.elevation || null}
                    onUseBorehole={value => onInputsChange({ ...inputs, ground: String(value) })}
                />
            </div>
            <div className="tab-panel" role="tabpanel" id="tabpanel-land" aria-labelledby="tab-land" hidden={tab !== 'land'}>
                <h3 className="print-only">토지 규제</h3>
                <LandUseSection data={data} landArea={readNumber(inputs.landArea)} />
            </div>
            <div className="tab-panel" role="tabpanel" id="tabpanel-nearby" aria-labelledby="tab-nearby" hidden={tab !== 'nearby'}>
                <h3 className="print-only">주변 자료</h3>
                <NearbySections data={data} />
            </div>
            <div className="tab-panel" role="tabpanel" id="tabpanel-contact" aria-labelledby="tab-contact" hidden={tab !== 'contact'}>
                <h3 className="print-only">문의</h3>
                <ContactSection address={data.parcel && data.parcel.address} departments={departments} />
            </div>

            {guidance.incomplete && <p className="disclaimer">※ 일부 데이터를 불러오지 못해 안내가 불완전할 수 있어요.</p>}
            <p className="disclaimer">이 안내는 공공데이터와 법령을 바탕으로 한 <b>참고용 정보</b>이며 법적 판단을 대신하지 않아요. 정확한 내용은 관할 시·군·구 문화유산 담당 부서나 국가유산청에 문의하세요.</p>
        </>
    );
}
