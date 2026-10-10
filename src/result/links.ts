// 결과 패널의 주소·보고서 링크: 관할 시·군·구, 동·리, 국가유산청 보고서·허가 현황 검색

// 필지 주소에서 관할 시·군·구 (일반구가 있는 시는 시청이 담당하는 경우가 많아 시까지만)
// 같은 이름(고성군 등)이 있어 시·도를 붙임. 예: "경상북도 경주시 인왕동" → 경상북도 경주시, "세종특별자치시 …" → 세종특별자치시
export function addressDistrict(address: string | undefined): string | null {
    const [sido, sigungu] = (address || '').split(' ');
    if (!sido) return null;
    return /세종/.test(sido) || !sigungu ? sido : `${sido} ${sigungu}`;
}

// 필지 주소에서 동·리 이름 (발굴조사 현황은 주소 한 칸에서 그대로 찾아서 동·리 이름만 넣음)
export function addressDong(address: string | undefined): string | null {
    const words = (address || '').split(' ').filter(word => /(동|리|가)$/.test(word) && !/(시|군|구|읍|면)$/.test(word));
    return words[words.length - 1] || null;
}

// 국가유산청 발굴조사 보고서·현황 목록 (e-minwon, 국가유산청 홈페이지에 들어가 있는 목록)
// 주소에 검색어를 넣으면 걸러진 목록이 열림. 보고서는 띄어쓴 단어가 모두 들어간 것을 찾아줌
export const REPORT_SEARCH_URL = 'https://www.e-minwon.go.kr/ge/ee/getListEcexmRptp.do?txtRptNm=';
export const STATUS_SEARCH_URL = 'https://www.e-minwon.go.kr/ge/ee/getListEcexmPrmsnAply.do?searchVal=';

// 조사명에서 "괘릉리 산37-1"처럼 동·리 이름과 번지를 뽑아 보고서 검색어로 씀
export function reportSearchWord(name: string | null): string | null {
    const match = (name || '').match(/([가-힣0-9]+(?:동|리|가))\s*\(?\s*(산\s?\d+(?:-\d+)?|\d+(?:-\d+)?)?/);
    if (!match) return null;
    return match[2] ? `${match[1]} ${match[2].replace(/\s/g, '')}` : match[1];
}
