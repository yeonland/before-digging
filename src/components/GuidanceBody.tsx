// 결과 패널 아래쪽: 해야 할 일, 굴착 깊이, 비용, 주변 유적·조사 이력, 문의처, 알아두세요
import type { Guidance } from '../lib/guidance.js';
import { findDepartment, officeName, type DepartmentData } from '../lib/departments';
import {
    addressDistrict, addressDong, reportSearchWord, REPORT_SEARCH_URL, STATUS_SEARCH_URL
} from '../lib/format';
import type { Agency, AnalysisResult, Elevation, Survey } from '../types';

export function LawDetails({ law }: { law?: string | null }) {
    return law ? <details className="law"><summary>법령 근거</summary>{law}</details> : null;
}

const externalLink = { className: 'survey-link', target: '_blank', rel: 'noopener' };

function ReportSearchLink({ name }: { name: string | null }) {
    const word = reportSearchWord(name);
    return word ? <a {...externalLink} href={`${REPORT_SEARCH_URL}${encodeURIComponent(word)}`}>보고서 찾기 ↗</a> : null;
}

// 조사기관 연락처 (한국문화유산협회 회원기관 목록에 있는 기관만)
function AgencyContact({ agency }: { agency?: Agency | null }) {
    if (!agency) return null;
    return (
        <div className="survey-report">
            조사기관 {agency.name} · ☎ <a className="survey-link" href={`tel:${agency.phone.split(/[\s/,]/)[0]}`}>{agency.phone}</a>
            {agency.homepage && <> · <a {...externalLink} href={encodeURI(agency.homepage)}>홈페이지 ↗</a></>}
        </div>
    );
}

function StepItems({ items }: { items: string[] }) {
    return <ul className="step-items">{items.map((item, index) => <li key={index}>{item}</li>)}</ul>;
}

// 굴착 깊이: 지반 해발 - 굴착 깊이 = 굴착 바닥 해발
// (주변 유적층 해발과 비교하는 기능은 보고서 자료를 모아야 해서 아직 없음)
function ExcavationSection({ ground, depth, elevation, data, onUseBorehole }: {
    ground: number | null;
    depth: number | null;
    elevation: Elevation | null;
    data: AnalysisResult;
    onUseBorehole: (value: number) => void;
}) {
    let body;
    if (ground !== null && depth !== null) {
        const bottom = Math.round((ground - depth) * 100) / 100;
        body = (
            <>
                <div className="step-title">굴착 바닥 해발 약 {bottom}m</div>
                <div>지반 해발 {ground}m에서 {depth}m를 파면 바닥은 해발 약 {bottom}m예요. 주변 발굴조사에서 유구(유적의 흔적)가 나온 해발이 이보다 높으면, 공사가 유적층에 닿을 수 있어요.</div>
                <StepItems items={[
                    '주변 유적이 어느 해발에서 나왔는지는 아래 "주변 조사 이력"의 보고서나 조사기관에 확인해 보세요. 이 서비스는 아직 유적층 해발 자료가 없어요.',
                    '얕게 파는 공사라도 유존지역 안이면 국가유산영향진단 대상인 것은 같아요. 굴착 깊이는 진단·협의 때 참고 자료가 돼요.'
                ]} />
            </>
        );
    } else if (depth !== null) {
        body = <div>지반 해발을 넣으면 굴착 바닥 해발을 계산해요. 측량도나 설계도의 현황 지반고(EL, GL)를 넣어 주세요.</div>;
    } else if (ground !== null) {
        body = <div>굴착 깊이(기초·지하층을 위해 파는 깊이)를 넣으면 굴착 바닥 해발을 계산해요.</div>;
    } else {
        body = <div>위에 지반 해발과 굴착 깊이를 넣으면 굴착 바닥이 해발 몇 m인지 계산해요. 지반 해발은 측량도나 설계도의 현황 지반고(EL, GL)를 보거나, 도면(DXF)을 올리면 자동으로 읽어요.</div>;
    }

    return (
        <>
            <h4>굴착 깊이</h4>
            <div className="step info">
                {body}
                {elevation && (
                    <div className="survey-report">도면에서 표고 {elevation.count}개를 읽었어요 ({elevation.source === 'text' ? '표고 글자' : '점·등고선 높이'}, 최저 {elevation.min}m ~ 최고 {elevation.max}m). 지반 해발에는 중간값 {elevation.median}m를 넣었어요. 땅이 기울어 있으면 실제 굴착 위치의 값으로 고쳐 주세요.</div>
                )}
                <BoreholeNote data={data} ground={ground} onUse={onUseBorehole} />
            </div>
        </>
    );
}

// 주변 시추공의 지반 고도 (참고값). 지반 해발을 모를 때 가장 가까운 값을 넣을 수 있게 함
function BoreholeNote({ data, ground, onUse }: { data: AnalysisResult; ground: number | null; onUse: (value: number) => void }) {
    const info = data.boreholes;
    if (!info) return null;
    if (info.items.length === 0) {
        return <div className="survey-report">주변 {info.radius}m 안에 지반 고도를 알 수 있는 시추공 자료가 없어요.</div>;
    }
    const nearest = info.items[0];
    return (
        <>
            <div className="survey-report" style={{ marginTop: 8 }}><b>주변 시추공 ({info.radius}m 안, 가까운 순)</b></div>
            <ul className="step-items">
                {info.items.map((item, index) => (
                    <li key={index}>
                        {item.distance === 0 ? <b>경계 안</b> : `약 ${item.distance}m`} · 지반 고도 {item.elevation}m <span style={{ color: '#666' }}>(시추 깊이 {item.depth}m)</span>
                    </li>
                ))}
            </ul>
            {ground !== nearest.elevation && (
                <button type="button" className="go-panel" onClick={() => onUse(nearest.elevation)}>가장 가까운 시추공 고도({nearest.elevation}m) 넣기</button>
            )}
            <p className="disclaimer" style={{ marginTop: 4 }}>국토교통부 지반정보 시추공 자료({info.baseDate} 수정)예요. 측량값이 아니고 시추했을 때의 지반이라, 그 뒤에 흙을 쌓거나 깎았으면 달라요. 정확한 값은 측량도의 현황 지반고를 쓰세요.</p>
        </>
    );
}

function SurveyItem({ survey }: { survey: Survey }) {
    const followUps = survey.followUps || [];
    return (
        <li>
            <span className="survey-method">{survey.method}</span>
            {' '}{survey.name || '이름 없음'} ·{' '}
            {survey.distance === 0 ? <b>필지에 걸침</b> : `약 ${survey.distance}m`}{survey.year ? ` · ${survey.year}년` : ''}
            {survey.kind === 'excavation' && <> <ReportSearchLink name={survey.name} /></>}
            {survey.report && <div className="survey-report">{survey.report}</div>}
            <AgencyContact agency={survey.agency} />
            {followUps.length > 0 && (
                <div className="survey-report">
                    그 뒤 같은 범위:{' '}
                    {followUps.map((item, index) => (
                        <span key={index}>
                            {index > 0 && ', '}
                            {item.method}{item.year ? `(${item.year}년)` : ''} <ReportSearchLink name={item.name} />
                        </span>
                    ))}
                </div>
            )}
        </li>
    );
}

// 관할 시·군·구 문화유산 담당 부서 (부서 이름은 행정표준코드, 전화번호는 자료에 없어 검색·110 안내)
function ContactSection({ address, departments }: { address?: string; departments: DepartmentData | null }) {
    const district = addressDistrict(address);
    if (!district) return null;

    const found = findDepartment(departments, district);
    const office = officeName(district);
    const deptName = (path: string) => path.split(' ').pop();
    const deptLabel = (path: string, index: number) => {
        const parts = path.split(' ');
        const name = parts.pop();
        return (
            <span key={index}>
                {index > 0 && ', '}
                {office} <b>{name}</b>{parts.length > 0 && <> <span style={{ color: '#666' }}>({parts.join(' ')})</span></>}
            </span>
        );
    };

    let title;
    let body;
    let searchWord;
    if (found && found.sure) {
        title = <>관할 부서: {found.departments.map(deptLabel)}</>;
        body = '위 안내에서 "관할 시·군·구에 문의"는 이 부서를 말해요.';
        searchWord = `${office} ${deptName(found.departments[0])} 전화번호`;
    } else if (found) {
        title = <>관할 부서(추정): {found.departments.map(deptLabel)}</>;
        body = `${office}에는 이름에 '문화유산'이 들어간 부서가 없어서, 문화 업무 부서를 찾았어요. 이 부서 안의 문화유산 담당 팀이 맡는 경우가 많지만, 다른 부서일 수도 있으니 전화할 때 문화유산(현상변경·매장유산) 담당인지 확인해 보세요.`;
        searchWord = `${office} ${deptName(found.departments[0])} 전화번호`;
    } else {
        title = <>관할: {district} 문화유산 담당 부서</>;
        body = '부서 이름을 찾지 못했어요. 지자체마다 부서 이름이 달라요(문화유산과, 문화예술과, 문화관광과 등).';
        searchWord = `${district} 문화유산 담당 부서 전화번호`;
    }

    return (
        <>
            <h4>문의처</h4>
            <div className="step info">
                <div className="step-title">{title}</div>
                <div>{body}</div>
                <ul className="step-items">
                    <li><a {...externalLink} href={`https://search.naver.com/search.naver?query=${encodeURIComponent(searchWord)}`}>{found ? '전화번호 찾기' : `${district} 문화유산 담당 부서 찾기`} ↗</a></li>
                    <li>찾기 어려우면 정부민원안내콜센터 ☎ <a className="survey-link" href="tel:110">110</a>에 "{district} 문화유산 담당 부서"를 물어보면 연결해 줘요.</li>
                </ul>
                {found && departments?.baseDate && (
                    <p className="disclaimer" style={{ marginTop: 4 }}>부서 이름: 행정안전부 행정표준코드 기관코드 ({departments.baseDate} 기준). 조직 개편으로 바뀌었을 수 있어요.</p>
                )}
            </div>
        </>
    );
}

export function GuidanceBody({ data, guidance, ground, depth, elevation, departments, onUseBorehole }: {
    data: AnalysisResult;
    guidance: Guidance;
    ground: number | null;
    depth: number | null;
    elevation: Elevation | null;
    departments: DepartmentData | null;
    onUseBorehole: (value: number) => void;
}) {
    const { nearbySites, surveys } = data;
    const dong = addressDong(data.parcel && data.parcel.address);

    return (
        <div>
            <h4>해야 할 일</h4>
            {guidance.steps.map((step, index) => (
                <div key={index} className={`step ${step.level}`}>
                    <div className="step-title">{step.title}</div>
                    <div>{step.body}</div>
                    {step.items && <StepItems items={step.items} />}
                    {step.details && (
                        <details className="law">
                            <summary>{step.details.summary}</summary>
                            <StepItems items={step.details.items} />
                        </details>
                    )}
                    <LawDetails law={step.law} />
                </div>
            ))}

            <ExcavationSection ground={ground} depth={depth} elevation={elevation} data={data} onUseBorehole={onUseBorehole} />

            {guidance.cost && (
                <>
                    <h4>비용</h4>
                    <div className="step info">
                        <div>{guidance.cost.summary}</div>
                        <LawDetails law={guidance.cost.law} />
                    </div>
                    <div className={`step ${guidance.cost.support.level}`}>
                        <div>{guidance.cost.support.text}</div>
                        <LawDetails law={guidance.cost.support.law} />
                    </div>
                </>
            )}

            {nearbySites && (
                <>
                    <h4>주변 문화유적 (500m 이내)</h4>
                    {nearbySites.length > 0
                        ? (
                            <ul className="notes">
                                {nearbySites.map((site, index) => (
                                    <li key={index}>
                                        {site.name} · 약 {site.distance}m
                                        {site.mapNo && <> <span style={{ color: '#666', fontSize: 12 }}>(분포지도 {site.mapNo})</span></>}
                                    </li>
                                ))}
                            </ul>
                        )
                        : <p className="panel-sub">500m 안에 문화유적 분포 범위가 없어요.</p>}
                    <p className="disclaimer" style={{ marginTop: 4 }}>필지 경계에서 각 유적 분포 범위 경계까지의 가장 짧은 거리예요. 이미 필지와 겹치는 유적은 빼고 가까운 5곳만 보여줘요.</p>
                </>
            )}

            {surveys && (
                <>
                    <h4>주변 조사 이력 (500m 이내)</h4>
                    {surveys.length > 0
                        ? <ul className="notes surveys">{surveys.map((survey, index) => <SurveyItem key={index} survey={survey} />)}</ul>
                        : <p className="panel-sub">500m 안에 등록된 조사 기록이 없어요.</p>}
                    {dong && (
                        <p className="panel-sub" style={{ marginTop: 4 }}>
                            <a {...externalLink} href={`${STATUS_SEARCH_URL}${encodeURIComponent(dong)}`}>{dong} 발굴조사 허가 현황 보기 ↗</a>{' '}
                            <span style={{ color: '#666', fontSize: 12 }}>(국가유산청, 최근 신청된 조사까지)</span>
                        </p>
                    )}
                    <p className="disclaimer" style={{ marginTop: 4 }}>국가유산청 국가유산조사구역 자료예요. 가까운 순으로 최대 10건을 보여주고, 조사 종류와 연도는 보고서 이름에서 읽어낸 거라 실제와 다를 수 있어요. "보고서 찾기"는 국가유산청 발굴조사 보고서 목록을 조사 위치로 검색해요. 2017년쯤부터 제출된 발굴·시굴조사 보고서만 있고 지표조사 보고서는 없어서, 예전 조사는 안 나올 수 있어요. 조사기관 연락처는 한국문화유산협회 회원기관 목록에 있는 기관만 보여줘요. 보고서를 보거나 조사 내용을 물어볼 때 연락해 보세요.</p>
                </>
            )}

            <ContactSection address={data.parcel && data.parcel.address} departments={departments} />

            <h4>알아두세요</h4>
            <ul className="notes">
                {guidance.notes.map((note, index) => <li key={index}>{note.text} <LawDetails law={note.law} /></li>)}
            </ul>
            {guidance.incomplete && <p className="disclaimer">※ 일부 데이터를 불러오지 못해 안내가 불완전할 수 있어요.</p>}
            <p className="disclaimer">이 안내는 공공데이터와 법령을 바탕으로 한 <b>참고용 정보</b>이며 법적 판단을 대신하지 않아요. 정확한 내용은 관할 시·군·구 문화유산 담당 부서나 국가유산청에 문의하세요.</p>
        </div>
    );
}
