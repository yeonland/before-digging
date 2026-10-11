// 결과 패널의 "다른 토지 규제": 용도지역(건폐율·용적률), 공사에 큰 영향을 주는 규제, 그 밖의 규제 (규칙은 land-rules.ts)
import { buildLandGuidance, ZONING_LAW } from './land-rules';
import { LawDetails } from './ResultSections';
import { formatArea } from '../shared/format';
import type { AnalysisResult, LandUseItem } from '../shared/types';

// 이름 옆 걸친 정도: 필지는 일부만 걸쳤을 때, 사업부지 전체는 해당 필지 수
function Relation({ item, site }: { item: LandUseItem; site: boolean }) {
    const text = site ? `${item.parcels}필지` : item.relation === 'part' ? '일부' : '';
    return text ? <span className="muted" style={{ fontWeight: 'normal' }}> ({text})</span> : null;
}

export function LandUseSection({ data, landArea }: { data: AnalysisResult; landArea: number | null }) {
    if (data.landUse === undefined) return null;
    if (data.landUse === null) {
        return (
            <>
                <h4>다른 토지 규제</h4>
                <p className="panel-sub">토지이용계획(용도지역·개발제한구역 등)을 불러오지 못했어요. 잠시 후 다시 진단해 주세요.</p>
            </>
        );
    }

    const site = data.target === 'site';
    const { zonings, rules, heritage, others } = buildLandGuidance(data.landUse, site ? '' : data.parcel.jibun);
    // 용도지역이 하나뿐이고 필지 전체에 걸칠 때만 면적 예시를 보여줌
    const single = zonings.length === 1 && zonings[0].item.relation === 'in' ? zonings[0] : null;

    return (
        <>
            <h4>다른 토지 규제</h4>
            {zonings.length > 0 && (
                <div className="step info">
                    {zonings.map((zoning, index) => (
                        <div key={index} style={index > 0 ? { marginTop: 8 } : undefined}>
                            <div className="step-title">용도지역: {zoning.item.name}<Relation item={zoning.item} site={site} /></div>
                            <div>{zoning.text} 건폐율 최대 {zoning.coverage}% · 용적률 최대 {zoning.floorRatio}%</div>
                        </div>
                    ))}
                    {single && landArea !== null && landArea > 0 && single.coverage !== null && single.floorRatio !== null && (
                        <div className="survey-report">
                            땅이 {formatArea(landArea)}라면 건물이 덮는 바닥은 최대 약 {formatArea(Math.floor(landArea * single.coverage / 100))},
                            모든 층 바닥을 합쳐 최대 약 {formatArea(Math.floor(landArea * single.floorRatio / 100))}까지예요.
                        </div>
                    )}
                    <p className="disclaimer" style={{ marginTop: 4 }}>건폐율은 땅 중 건물이 덮을 수 있는 비율, 용적률은 모든 층 바닥 면적을 합친 것이 땅의 몇 %까지인지예요. 법이 정한 최대치라서, 실제로는 시·군 조례로 더 낮은 경우가 많아요(예: 서울 제2종일반주거지역 용적률 200%).</p>
                    <LawDetails law={ZONING_LAW} />
                </div>
            )}

            {rules.map((rule, index) => (
                <div key={index} className={`step ${rule.level}`}>
                    <div className="step-title">
                        {rule.title}
                        {rule.items.length === 1 && <Relation item={rule.items[0]} site={site} />}
                    </div>
                    <div>{rule.body}</div>
                    <LawDetails law={rule.law} />
                </div>
            ))}
            {rules.length === 0 && <p className="panel-sub">개발제한구역·농업진흥구역·보전산지처럼 공사에 크게 영향을 주는 규제는 없어요.</p>}

            {heritage.length > 0 && (
                <p className="panel-sub" style={{ marginTop: 4 }}>
                    토지이용계획에 국가유산 관련 구역({heritage.map(item => item.name).join(', ')})도 올라 있어요. 이 내용은 "국가유산" 탭에서 안내해요.
                </p>
            )}

            {others.length > 0 && (
                <details className="law">
                    <summary>그 밖의 규제 {others.length}건</summary>
                    <ul className="step-items">
                        {others.map((item, index) => <li key={index}>{item.name}<Relation item={item} site={site} /></li>)}
                    </ul>
                    <p className="disclaimer" style={{ marginTop: 4 }}>가축사육제한구역·과밀억제권역처럼 일부 시설이나 업종에만 해당하거나, 공사에 직접 영향이 적은 것들이에요. 각각의 행위 제한은 토지이음(eum.go.kr)에서 지번으로 찾아볼 수 있어요.</p>
                </details>
            )}

            <p className="disclaimer" style={{ marginTop: 4 }}>
                국토교통부 브이월드 토지이용계획 자료(토지이음과 같은 자료)예요. {site ? '괄호 안은 이 규제가 걸친 필지 수예요.' : '"일부"는 필지의 일부만 걸친 것이에요.'} 국가유산 위험도에는 넣지 않았어요. 실제로 지을 수 있는지는 관할 시·군·구 건축·도시계획 부서에 확인하세요.
            </p>
        </>
    );
}
