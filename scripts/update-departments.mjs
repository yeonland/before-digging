// 시·군·구 문화유산 담당 부서 목록(data/departments.json)을 행정표준코드 기관코드 전체자료에서 새로 만듦
// - 결과 화면 "문의처"에서 관할 시·군·구의 담당 부서 이름을 바로 보여주는 데 씀
// - 기관코드 자료에는 팀 단위와 부서 전화번호가 거의 없어서 과(課) 이름만 씀
// - 이름에 문화유산·국가유산·문화재가 들어간 과가 있으면 확실(sure), 없으면 이름에 '문화'가 들어간 과를 추정으로 둠
//
// 자료: https://www.code.go.kr → 코드검색 → 기관코드검색 → "기관코드 전체자료" (zip 안에 txt)
// 사용: node scripts/update-departments.mjs                       → 사이트에서 바로 받아서
//       node scripts/update-departments.mjs "기관코드 전체자료.zip"  → 받아 둔 zip이나 압축을 푼 txt로
// 부서 목록이 그대로면 파일을 건드리지 않음 (매달 자동 갱신 때 날짜만 바뀌는 커밋이 생기지 않게)
import { readFile, writeFile } from 'node:fs/promises';
import { inflateRawSync } from 'node:zlib';

const SITE = 'https://www.code.go.kr';
const OUTPUT_FILE = new URL('../data/departments.json', import.meta.url);
const today = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10); // 한국 날짜

// 전체자료 내려받기: 조회 화면에서 받은 쿠키(세션)와 Referer가 있어야 파일을 줌 (없으면 "파일이 없습니다")
async function download() {
    const page = await fetch(`${SITE}/stdcode/orgCodeL.do`);
    const cookie = page.headers.getSetCookie().map((item) => item.split(';')[0]).join('; ');
    const response = await fetch(`${SITE}/etc/codeFullDown.do`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            Cookie: cookie,
            Referer: `${SITE}/stdcode/orgCodeL.do`
        },
        body: 'codeseId=00001'
    });
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!response.ok || buffer.subarray(0, 2).toString() !== 'PK') {
        throw new Error(`기관코드 전체자료를 받지 못했어요 (${response.status}, ${buffer.length}바이트). 사이트 내려받기 방식이 바뀌었는지 확인하세요.`);
    }
    return buffer;
}

// zip 안의 파일들 { 이름, 내용 } (zip 끝의 목록을 읽어 압축을 풂)
function unzip(buffer) {
    const end = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    const count = buffer.readUInt16LE(end + 10);
    let offset = buffer.readUInt32LE(end + 16);
    const files = [];
    for (let i = 0; i < count; i++) {
        const method = buffer.readUInt16LE(offset + 10);
        const size = buffer.readUInt32LE(offset + 20);
        const nameLength = buffer.readUInt16LE(offset + 28);
        const extraLength = buffer.readUInt16LE(offset + 30);
        const commentLength = buffer.readUInt16LE(offset + 32);
        const local = buffer.readUInt32LE(offset + 42);
        const name = new TextDecoder('euc-kr').decode(buffer.subarray(offset + 46, offset + 46 + nameLength));
        const dataStart = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28);
        const raw = buffer.subarray(dataStart, dataStart + size);
        files.push({ name, data: method === 8 ? inflateRawSync(raw) : raw });
        offset += 46 + nameLength + extraLength + commentLength;
    }
    return files;
}

// zip에는 "기관코드 전체자료.txt"와 유형분류를 더한 판이 같이 들어 있음 → 기본 판을 씀
function pickText(files) {
    const texts = files.filter((file) => /\.txt$/i.test(file.name));
    const file = texts.find((item) => !/\(/.test(item.name)) || texts[0];
    if (!file) throw new Error('zip 안에 txt 파일이 없어요.');
    return file.data;
}

const inputPath = process.argv[2];
let raw;
if (!inputPath) raw = pickText(unzip(await download()));
else if (/\.zip$/i.test(inputPath)) raw = pickText(unzip(await readFile(inputPath)));
else raw = await readFile(inputPath);

const HERITAGE = /국가유산|문화유산|문화재|유산/;
// 담당 부서가 아닌 기관(재단, 박물관 등)과 다른 업무 부서는 뺌
const NOT_DEPARTMENT = /재단|센터|박물관|도서관|미술관|기념관|위원|보건|교육|의회|사업소|본부$|해녀/;

// 기관코드 자료는 CP949(EUC-KR) 탭 구분 글자 파일
const text = new TextDecoder('euc-kr').decode(raw);
const lines = text.split(/\r?\n/);
const header = lines[0].split('\t');
const col = (name) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`"${name}" 칸이 없어요. 자료 형식이 바뀌었는지 확인하세요.`);
    return index;
};
const [FULL, LOW, LEVEL, TYPE, ALIVE] = ['전체기관명', '최하위기관명', '차수', '유형분류_대', '존폐여부'].map(col);

// 지금 있는 지방자치단체 조직만
const orgs = lines.slice(1)
    .map((line) => line.split('\t'))
    .filter((cells) => cells[ALIVE] === '0' && cells[TYPE] === '02')
    .map((cells) => ({ full: cells[FULL].trim(), low: cells[LOW].trim(), level: Number(cells[LEVEL]) }));

// 관할 단위: 시·도 아래의 시·군·구 + 시·군·구가 없는 세종특별자치시
const districts = orgs.filter((org) =>
    (org.level === 2 && /(시|군|구)$/.test(org.low) && org.full.split(' ').length === 2) ||
    (org.level === 1 && /세종/.test(org.full)));

const result = {};
let sureCount = 0;
let guessCount = 0;

for (const district of districts) {
    const prefix = `${district.full} `;
    const units = orgs
        .filter((org) => org.full.startsWith(prefix) && /과$/.test(org.low) && !NOT_DEPARTMENT.test(org.low))
        .map((org) => org.full.slice(prefix.length));
    const last = (path) => path.split(' ').pop();

    const heritage = units.filter((path) => HERITAGE.test(last(path)));
    const culture = units
        .filter((path) => /문화/.test(last(path)) && !/주차|교통|공원|청년|여성|가족|복지|일자리/.test(last(path)))
        // 이름이 짧을수록(문화과, 문화관광과) 일반 문화 업무 부서일 가능성이 높음
        .sort((a, b) => last(a).length - last(b).length);

    if (heritage.length > 0) {
        result[district.full] = { sure: true, departments: heritage.slice(0, 2) };
        sureCount++;
    } else if (culture.length > 0) {
        result[district.full] = { sure: false, departments: culture.slice(0, 1) }; // 추정은 가장 그럴듯한 하나만
        guessCount++;
    }
}

const summary = `시·군·구 ${districts.length}곳 중 확실 ${sureCount}곳, 추정 ${guessCount}곳, 못 찾음 ${districts.length - sureCount - guessCount}곳`;
const previous = await readFile(OUTPUT_FILE, 'utf8').then(JSON.parse).catch(() => null);
if (previous && JSON.stringify(previous.districts) === JSON.stringify(result)) {
    console.log(`담당 부서 목록이 바뀌지 않았어요. (${summary})`);
    process.exit(0);
}

await writeFile(OUTPUT_FILE, JSON.stringify({
    source: '행정안전부 행정표준코드관리시스템 기관코드 전체자료 (www.code.go.kr)',
    baseDate: today,
    districts: result
}, null, 1) + '\n');

console.log(`시·군·구 ${districts.length}곳 중 확실 ${sureCount}곳, 추정 ${guessCount}곳, 못 찾음 ${districts.length - sureCount - guessCount}곳`);
