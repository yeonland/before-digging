// 지도 핀 팝업: 필지 진단 요약, 지적도에 없는 곳의 지점 진단
import { buildRisk } from '../lib/guidance.js';
import { formatArea, overlapItems, type OverlapItem } from '../lib/format';
import type { AnalysisResult, PointResult } from '../types';

const text13 = { margin: 0, fontSize: 13 };
const note12 = { margin: '6px 0 0 0', fontSize: 12, color: '#666' };
const listStyle = { margin: '5px 0 0 0', paddingLeft: 18, fontSize: 13 };
const titleStyle = (color: string) => ({ margin: '0 0 5px 0', color });

// 이름이 없는 구역(역사문화환경 보존지역 등)은 종류만 표시
export function OverlapLabel({ item }: { item: Pick<OverlapItem, 'name' | 'type'> }) {
    return item.name
        ? <>{item.name} <span style={{ color: '#666' }}>({item.type})</span></>
        : <>{item.type}</>;
}

// 팝업이 지도를 너무 가리지 않게 많이 겹친 3개만 보여주고, 나머지는 결과 패널의 전체 목록으로 보냄
const POPUP_ITEM_LIMIT = 3;

export function ParcelPopup({ data, onShowPanel, onShowOverlaps }: {
    data: AnalysisResult;
    onShowPanel: () => void;
    onShowOverlaps: () => void;
}) {
    const parcel = data.parcel;
    const items = overlapItems(data);
    const realItems = items.filter(item => !item.edgeOnly);
    const edgeItems = items.filter(item => item.edgeOnly);
    const failed = data.zones === null || data.sites === null;
    const nearest = (data.nearbySites || [])[0];
    const surveyCount = (data.surveys || []).length;
    const hiddenCount = realItems.length - POPUP_ITEM_LIMIT;
    const risk = buildRisk(data);

    let title;
    let summary;
    if (realItems.length > 0 && realItems.every(item => item.natural)) {
        // 자연유산 구역만 걸친 경우: 매장유산 위험도와 별개라 빨간색으로 표시하지 않음
        title = <h4 style={titleStyle('#e9a400')}>자연유산 구역 해당</h4>;
        summary = <p style={text13}><b>확인 결과:</b> ℹ️ 필지의 <b>{data.overlap.ratio}% ({formatArea(data.overlap.area)})</b>가 자연유산 구역에 걸칩니다. (땅속 유물 절차와는 별개)</p>;
    } else if (realItems.length > 0) {
        title = <h4 style={titleStyle('#e63946')}>국가유산 관련 영역 해당</h4>;
        summary = <p style={text13}><b>확인 결과:</b> 🔴 필지의 <b>{data.overlap.ratio}% ({formatArea(data.overlap.area)})</b>가 관련 영역에 걸칩니다.</p>;
    } else if (edgeItems.length > 0) {
        title = <h4 style={titleStyle('#e9a400')}>경계 확인 필요</h4>;
        summary = <p style={text13}><b>확인 결과:</b> 🟡 관련 영역이 필지 경계에만 살짝 걸칩니다.</p>;
    } else if (failed) {
        title = <h4 style={titleStyle('#666')}>확인된 영역 없음</h4>;
        summary = <p style={text13}>관련 영역이 없지만, 일부 데이터를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>;
    } else {
        title = <h4 style={titleStyle('#2a9d8f')}>국가유산 관련 영역 외 지역</h4>;
        summary = <p style={text13}><b>확인 결과:</b> 🟢 필지가 관련 영역에 포함되지 않습니다.</p>;
    }

    return (
        <div style={{ padding: 5 }}>
            {title}
            <p style={{ margin: '0 0 6px 0', fontSize: 13 }}>
                <b>위험도 {risk.icon} {risk.label}</b> <span style={{ color: '#666', fontSize: 12 }}>(참고자료)</span>
            </p>
            <p style={{ margin: '0 0 6px 0', fontSize: 13 }}>
                <b>{parcel.address}</b><br />
                <span style={{ color: '#666' }}>지목·지번 {parcel.jibun} · 필지 면적 {formatArea(parcel.area)}</span>
            </p>
            {summary}
            {realItems.length > 0 && (
                <ul style={listStyle}>
                    {realItems.slice(0, POPUP_ITEM_LIMIT).map((item, index) => (
                        <li key={index}><OverlapLabel item={item} /> · {formatArea(item.overlapArea)} ({item.overlapRatio}%)</li>
                    ))}
                    {hiddenCount > 0 && (
                        <li style={{ listStyle: 'none' }}>
                            <a href="#" className="more-link" onClick={event => { event.preventDefault(); onShowOverlaps(); }}>외 {hiddenCount}건 모두 보기 ▼</a>
                        </li>
                    )}
                </ul>
            )}
            {edgeItems.length > 0 && (
                <p style={note12}>경계에만 걸침 (도면 오차일 수 있음): {edgeItems.map(item => item.name || item.type).join(', ')}</p>
            )}
            {nearest && <p style={note12}>가장 가까운 문화유적: {nearest.name} · 약 {nearest.distance}m</p>}
            {surveyCount > 0 && (
                <p style={{ ...note12, margin: '2px 0 0 0' }}>주변 500m 조사 이력 {surveyCount}건{surveyCount >= 10 ? ' 이상' : ''}</p>
            )}
            {failed && <p style={{ ...note12, margin: '5px 0 0 0' }}>※ 일부 데이터를 불러오지 못해 결과가 불완전할 수 있습니다.</p>}
            <button type="button" className="go-panel" onClick={onShowPanel}>해야 할 일 보기 ▼</button>
        </div>
    );
}

export function PointPopup({ data }: { data: PointResult }) {
    const zones = data.zones || [];
    // 같은 이름의 유적이 여러 번 등록된 경우 한 번만 표시
    const sites = (data.sites || []).filter((site, index, list) =>
        list.findIndex(other => other.name === site.name) === index
    );
    const failed = data.zones === null || data.sites === null;

    if (zones.length > 0 || sites.length > 0) {
        return (
            <div style={{ padding: 5 }}>
                <h4 style={titleStyle('#e63946')}>국가유산 관련 영역 해당</h4>
                <p style={text13}><b>확인 결과:</b> 🔴 관련 영역에 포함됩니다.</p>
                <ul style={listStyle}>
                    {zones.map((zone, index) => (
                        <li key={`z${index}`}>{zone.name || '이름 없음'} <span style={{ color: '#666' }}>({zone.type})</span></li>
                    ))}
                    {sites.map((site, index) => (
                        <li key={`s${index}`}>{site.name || '이름 없음'} <span style={{ color: '#666' }}>(문화유적 분포 범위)</span></li>
                    ))}
                </ul>
                {failed && <p style={{ ...note12, margin: '5px 0 0 0' }}>※ 일부 데이터를 불러오지 못해 결과가 불완전할 수 있습니다.</p>}
            </div>
        );
    }
    if (failed) {
        return (
            <div style={{ padding: 5 }}>
                <h4 style={titleStyle('#666')}>확인된 영역 없음</h4>
                <p style={text13}>조회된 범위에서는 관련 영역이 없지만, 일부 데이터를 불러오지 못했습니다. 잠시 후 다시 확인해 주세요.</p>
            </div>
        );
    }
    return (
        <div style={{ padding: 5 }}>
            <h4 style={titleStyle('#2a9d8f')}>국가유산 관련 영역 외 지역</h4>
            <p style={text13}><b>확인 결과:</b> 🟢 관련 영역에 포함되지 않습니다.</p>
        </div>
    );
}
