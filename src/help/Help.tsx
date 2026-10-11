// 사이트 도움말 (사용설명서). 그림이 들어간 긴 설명은 docs/사용설명서.md
// 화면이나 규칙이 바뀌면 여기와 docs/사용설명서.md를 같이 고친다.
const MANUAL_URL = 'https://github.com/yeonland/before-digging/blob/main/docs/%EC%82%AC%EC%9A%A9%EC%84%A4%EB%AA%85%EC%84%9C.md';

const SECTIONS = [
    { id: 'help-find', title: '1. 땅 찾기' },
    { id: 'help-read', title: '2. 결과 읽기' },
    { id: 'help-tabs', title: '3. 탭별 내용' },
    { id: 'help-dxf', title: '4. 도면(DXF)으로 사업부지 진단' },
    { id: 'help-map', title: '5. 지도 레이어' },
    { id: 'help-share', title: '6. 공유·PDF 저장' },
    { id: 'help-faq', title: '자주 묻는 질문' }
];

export function Help({ onClose }: { onClose: () => void }) {
    const jump = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    return (
        <div className="help">
            <button type="button" className="go-panel" onClick={onClose}>← 돌아가기</button>
            <h3 style={{ marginTop: 10 }}>사용설명서</h3>
            <p className="panel-sub">땅파기전은 공사 전에 그 땅의 문화유산 절차와 다른 토지 규제를 미리 확인하는 지도예요.</p>

            <ul className="help-toc">
                {SECTIONS.map(section => (
                    <li key={section.id}><button type="button" onClick={() => jump(section.id)}>{section.title}</button></li>
                ))}
            </ul>

            <h4 id="help-find">1. 땅 찾기</h4>
            <ul className="notes">
                <li><b>지도에서 누르기</b>: 땅을 누르면 그 필지를 바로 진단해요. 필지 경계(지적도)는 많이 확대해야 보여요.</li>
                <li><b>검색</b>: 지번(예: 경주시 인왕동 815-1), 도로명 주소, 장소 이름을 넣으세요. 결과가 여러 개면 목록에서 골라요.</li>
                <li><b>좌표</b>: 숫자 두 개(예: 37.5796, 126.9770 또는 측량 좌표)를 넣으면 좌표계마다 어느 주소인지 보여주고 고르게 해요.</li>
                <li><b>내 위치</b>: 지도 오른쪽 아래 화살표 버튼을 누르면 지금 있는 곳으로 가요.</li>
            </ul>

            <h4 id="help-read">2. 결과 읽기</h4>
            <p>맨 위 <b>요약 카드</b>에 국가유산 위험도와 해야 할 일 개수가 나와요. 개수를 누르면 그 내용이 있는 탭으로 가요.</p>
            <div className="step required"><div className="step-title">🔴 높음</div><div>공사 전에 문화유산 절차가 필요할 가능성이 높아요. 문화유적 분포 범위, 지정유산 구역, 세계유산지구에 걸친 경우예요.</div></div>
            <div className="step check"><div className="step-title">🟡 주의</div><div>절차가 생기거나 주변에 유적이 있을 수 있어요. 보존지역, 지표조사 확인 유적, 100m 안의 유적 등이에요.</div></div>
            <div className="step info"><div className="step-title">🟢 낮음</div><div>확인한 자료에서는 문화유산 관련 근거가 없어요. 그래도 공사 중 유물이 나오면 신고해야 해요.</div></div>
            <div className="step"><div className="step-title">⚪ 확인 불가</div><div>자료 일부를 불러오지 못했어요. 잠시 후 같은 곳을 다시 눌러 주세요.</div></div>
            <p className="panel-sub">정확한 기준은 결과의 "산정 근거 보기"에 모두 나와요. 위험도는 <b>땅속 유적</b> 기준이라 그린벨트 같은 토지 규제는 넣지 않아요.</p>
            <p style={{ marginTop: 8 }}><b>공사 정보</b>를 넣으면 안내가 맞춰져요.</p>
            <ul className="notes">
                <li>공사 종류·면적: 발굴비용을 나라에서 지원받을 수 있는지, 3만㎡ 이상이라 영향진단 대상인지 알려줘요. 면적은 필지 면적이 먼저 들어가 있어요.</li>
                <li>지반 해발·굴착 깊이: 굴착 바닥이 해발 몇 m인지 계산해요. 지반 해발을 모르면 주변 시추공 고도를 참고로 넣을 수 있어요.</li>
            </ul>

            <h4 id="help-tabs">3. 탭별 내용</h4>
            <ul className="notes">
                <li><b>국가유산</b>: 해야 할 일(영향진단·허가·신고 등)과 법령 근거, 굴착 깊이, 비용, 알아두세요.</li>
                <li><b>토지 규제</b>: 용도지역(건폐율·용적률), 개발제한구역·농업진흥구역·보전산지처럼 공사에 큰 영향을 주는 규제를 쉬운 말로. 빨강은 공사를 크게 막는 것, 노랑은 확인이 필요한 것이에요.</li>
                <li><b>주변 자료</b>: 500m 안 문화유적과 예전 발굴·시굴·지표조사 기록. 보고서 찾기와 조사기관 연락처도 있어요.</li>
                <li><b>문의</b>: 관할 시·군·구 문화유산 담당 부서 이름과 전화번호 찾기.</li>
            </ul>

            <h4 id="help-dxf">4. 도면(DXF)으로 사업부지 진단</h4>
            <p>사업부지가 여러 필지에 걸치면 검색창 옆 <b>도면(DXF)</b>으로 한 번에 진단해요. 도면 파일은 이 브라우저에서만 읽고 서버에는 경계 좌표만 보내요.</p>
            <ol className="notes">
                <li>사업부지 경계를 <b>닫힌 폴리라인</b>으로 그린 DXF를 고르세요. 안쪽 경계는 제외 구역으로 봐요.</li>
                <li>경계가 있는 <b>레이어</b>를 고르세요.</li>
                <li><b>좌표계</b>를 고르세요. 후보마다 그 좌표계로 읽으면 어느 주소인지 보여주니, 맞는 주소를 고르면 돼요(DXF에는 좌표계 정보가 없어요).</li>
                <li>진단하면 부지 전체 결과와 <b>필지별 표</b>가 나와요. 표의 줄이나 지도의 필지를 누르면 그 필지 결과를 보고, 표는 CSV로 내려받을 수 있어요.</li>
            </ol>
            <p className="panel-sub">부지는 2㎢, 300필지까지예요. 필지가 많으면 1분 가까이 걸려요. 도면에 표고 글자나 등고선이 있으면 지반 해발을 자동으로 읽어요.</p>

            <h4 id="help-map">5. 지도 레이어</h4>
            <p>지도 오른쪽 위 <b>레이어</b>에서 켜고 끄고, 색이 무엇을 뜻하는지 볼 수 있어요. 현상변경 허용기준 구역과 세계유산 구역은 처음엔 꺼져 있어요. 문화유적 분포 범위와 지적도는 많이 확대해야 보여요.</p>

            <h4 id="help-share">6. 공유·PDF 저장</h4>
            <ul className="notes">
                <li><b>링크 복사</b>: 위치와 입력한 공사 정보가 담긴 링크예요. 받은 사람이 열면 <b>그때의 자료로 다시 진단</b>해서, 자료가 바뀌었으면 결과도 달라요.</li>
                <li><b>PDF로 저장·인쇄</b>: 지금 결과를 탭까지 모두 펼쳐서 남겨요. 그 순간의 결과를 보관하려면 PDF를 쓰세요.</li>
            </ul>
            <p className="panel-sub">휴대폰에서는 아래 결과 창의 손잡이를 끌어올리거나 눌러서 크게 볼 수 있어요. 지도 팝업은 짧게 요약만 보여주고, "국가유산 영역", "토지 규제", "해야 할 일" 버튼을 누르면 결과 창의 그 부분으로 바로 가요.</p>

            <h4 id="help-faq">자주 묻는 질문</h4>
            <details className="help-faq">
                <summary>"낮음"이면 문화유산 조사를 안 해도 되나요?</summary>
                <p>확인한 공공자료에 근거가 없다는 뜻이에요. 자료에 없는 유적이 있을 수 있고, 공사 중 유물이 나오면 공사를 멈추고 신고해야 해요. 큰 공사(3만㎡ 이상)는 위험도와 관계없이 국가유산영향진단 대상이에요.</p>
            </details>
            <details className="help-faq">
                <summary>위험도와 토지 규제는 무슨 관계인가요?</summary>
                <p>따로예요. 위험도는 땅속 문화유산만 봐요. 그린벨트나 농업진흥구역은 "토지 규제" 탭에서 따로 확인하세요.</p>
            </details>
            <details className="help-faq">
                <summary>토지이음이나 다른 사이트와 결과가 달라요.</summary>
                <p>국가유산청·국토교통부 자료를 받아 오는데, 기관마다 갱신 시점이 달라서 차이가 날 수 있어요. 지적도와 구역도의 도면 오차로 경계에만 살짝 걸치는 경우도 있어서 "경계에만 걸침"으로 따로 표시해요.</p>
            </details>
            <details className="help-faq">
                <summary>도면 좌표계를 모르겠어요.</summary>
                <p>후보마다 나오는 주소를 보고 실제 사업부지 주소와 같은 것을 고르면 돼요. 측량 도면은 대부분 중부원점(서울·경기·충청·전라 등)이나 동부원점(경상도 등)이에요.</p>
            </details>
            <details className="help-faq">
                <summary>결과를 그대로 믿어도 되나요?</summary>
                <p>공공데이터와 법령을 바탕으로 한 참고자료예요. 법적 판단을 대신하지 않으니, 설계 전에 "문의" 탭의 관할 시·군·구 담당 부서에 꼭 확인하세요.</p>
            </details>

            <p className="panel-sub" style={{ marginTop: 14 }}>
                화면 그림이 있는 자세한 설명: <a href={MANUAL_URL} target="_blank" rel="noopener">사용설명서 문서 ↗</a>
            </p>
        </div>
    );
}
