// 매장유산 조사기관 연락처 목록(data/agencies.json)을 한국문화유산협회 회원기관 목록에서 새로 만듦
// - 조사 이력의 보고서 이름 앞에 나오는 기관명과 맞춰 전화번호·홈페이지를 안내하는 데 씀
// - 기관 연락처는 바뀔 수 있어서 가끔 다시 실행해 갱신
// 사용: node scripts/update-agencies.mjs
import { readFile, writeFile } from 'node:fs/promises';

const SOURCE_URL = 'https://www.kaah.kr/asslist';
const OUTPUT_FILE = new URL('../data/agencies.json', import.meta.url);

function cellText(html) {
    return html
        .replace(/<br\s*\/?>/gi, ' / ')
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

const response = await fetch(SOURCE_URL);
if (!response.ok) {
    throw new Error(`한국문화유산협회 목록 응답 오류: ${response.status}`);
}

const html = await response.text();
const table = (html.match(/<table class="board-table-list[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/) || [])[1];
if (!table) {
    throw new Error('회원기관 표를 찾지 못했어요. 페이지 구조가 바뀌었는지 확인하세요.');
}

const agencies = [...table.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map(([, row]) => [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((cell) => cell[1]))
    .filter((cells) => cells.length >= 5)
    .map(([, name, address, phone, home]) => ({
        name: cellText(name),
        address: cellText(address).replace(/^本\)\s*/, ''),
        phone: cellText(phone),
        homepage: (home.match(/href='([^']+)'/) || home.match(/href="([^"]+)"/) || [])[1] || null
    }));

if (agencies.length < 50) {
    throw new Error(`기관이 ${agencies.length}곳뿐이에요. 페이지 구조가 바뀌었는지 확인하세요.`);
}

// 목록이 그대로면 파일을 건드리지 않음 (매달 자동 갱신 때 날짜만 바뀌는 커밋이 생기지 않게)
const previous = await readFile(OUTPUT_FILE, 'utf8').then(JSON.parse).catch(() => null);
if (previous && JSON.stringify(previous.agencies) === JSON.stringify(agencies)) {
    console.log('조사기관 목록이 바뀌지 않았어요.');
    process.exit(0);
}

await writeFile(OUTPUT_FILE, JSON.stringify({
    source: SOURCE_URL,
    updated: new Date().toISOString().slice(0, 10),
    agencies
}, null, 2) + '\n');

console.log(`조사기관 ${agencies.length}곳 저장: data/agencies.json`);
