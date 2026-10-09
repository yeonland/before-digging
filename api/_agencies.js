// 보고서 이름("기관, 연도, 제목")의 조사기관을 한국문화유산협회 회원기관 목록(data/agencies.json)과 맞춰 연락처를 찾음
// 목록 갱신: node --use-system-ca scripts/update-agencies.mjs
const { agencies } = require('../data/agencies.json');

// 기관 이름이 바뀐 경우 (예전 이름 → 지금 이름, 비교용으로 정리한 형태)
const RENAMED = {
    한국문화재재단: '국가유산진흥원',
    한국문화재보호재단: '국가유산진흥원'
};

// 비교용 이름: 법인 표시와 띄어쓰기를 빼고, 2024년 명칭 변경(문화재 → 문화유산)을 맞춤
function normalize(name) {
    const key = (name || '')
        .replace(/\(재\)|\(사\)|\(주\)|재단법인|사단법인|[「」『』"'\s]/g, '')
        .replace(/문화재조사연구단$/, '')
        .replace(/문화재/g, '문화유산');
    return RENAMED[key.replace(/문화유산/g, '문화재')] || key;
}

const byName = new Map(agencies.map((agency) => [normalize(agency.name), agency]));

// 보고서 이름 맨 앞(첫 쉼표 전)을 기관명으로 보고 회원기관 목록에서 찾음 (없으면 null)
function findAgency(report) {
    const name = (report || '').split(/[,，]/)[0].trim();
    if (!name || name.length > 40) return null;

    const agency = byName.get(normalize(name));
    return agency
        ? { name: agency.name, phone: agency.phone, homepage: agency.homepage }
        : null;
}

module.exports = { findAgency };
