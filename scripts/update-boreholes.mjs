// 주변 시추공 자료(data/boreholes.bin.gz)를 공공데이터포털 '국토교통부_지반정보_시추공' CSV에서 새로 만듦
// - 결과 화면 "굴착 깊이"에서 주변 시추공의 지반 고도를 참고값으로 보여주는 데 씀
// - CSV 좌표는 중부원점(EPSG:5186) 하나로 통일돼 있음 (경복궁·부산·강릉 주변 고도로 확인, 2026-10-10)
// - 원본 파일이 바뀌지 않았으면(같은 파일 해시) 아무것도 하지 않음
//
// 사용:
//   npm i --no-save proj4@2.11.0
//   node scripts/update-boreholes.mjs                 → 공공데이터포털에서 최신 파일을 받아서
//   node scripts/update-boreholes.mjs 시추공.csv      → 받아 둔 파일로
// 바뀌었으면 GitHub Actions가 GITHUB_OUTPUT에 changed=true를 남김
import { readFile, writeFile, appendFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { gzipSync } from 'node:zlib';
import proj4 from 'proj4';

const DATASET_PAGE = 'https://www.data.go.kr/data/15069365/fileData.do';
const DOWNLOAD_URL = 'https://www.data.go.kr/cmm/cmm/fileDownload.do';
const OUTPUT_FILE = new URL('../data/boreholes.bin.gz', import.meta.url);
const META_FILE = new URL('../data/boreholes-meta.json', import.meta.url);
const EPSG5186 = '+proj=tmerc +lat_0=38 +lon_0=127 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs';

// 서버(api/_lib/boreholes.js)와 같은 값이어야 함: 칸 크기(도), 숫자 저장 배율
const CELL = 0.01;
const COORD_SCALE = 1e6;
const VALUE_SCALE = 100;

async function setOutput(name, value) {
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

// 공공데이터포털 CSV는 EUC-KR인 경우가 많음 (UTF-8이면 그대로)
function decodeCsv(buffer) {
    const utf8 = buffer.toString('utf8').replace(/^﻿/, '');
    return utf8.slice(0, 200).includes('시추공코드') ? utf8 : new TextDecoder('euc-kr').decode(buffer);
}

async function readMeta() {
    try {
        return JSON.parse(await readFile(META_FILE, 'utf8'));
    } catch {
        return null;
    }
}

// 데이터 페이지에서 지금 올라와 있는 파일 번호와 수정일을 찾아 내려받음
async function download() {
    const page = await (await fetch(DATASET_PAGE)).text();
    const fileId = (page.match(/atchFileId=(FILE_\d+)/) || [])[1];
    const detail = (page.match(/fileDetailSn=(\d+)/) || [])[1] || '1';
    const modified = (page.match(/수정일\s*<\/th>\s*<td[^>]*>\s*([\d-]+)/) || page.match(/수정일[^\d]{0,80}(\d{4}-\d{2}-\d{2})/) || [])[1] || null;
    if (!fileId) throw new Error('데이터 페이지에서 파일 번호를 찾지 못했어요. 페이지 구조가 바뀌었는지 확인하세요.');

    const response = await fetch(`${DOWNLOAD_URL}?atchFileId=${fileId}&fileDetailSn=${detail}`);
    if (!response.ok) throw new Error(`시추공 파일 내려받기 실패: ${response.status}`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (!decodeCsv(buffer.subarray(0, 200)).includes('시추공코드')) {
        throw new Error('내려받은 파일이 시추공 CSV가 아니에요 (첫 줄에 "시추공코드"가 없음).');
    }
    return { buffer, fileId, modified };
}

const inputPath = process.argv[2];
const source = inputPath
    ? { buffer: await readFile(inputPath), fileId: null, modified: null }
    : await download();
const sha256 = createHash('sha256').update(source.buffer).digest('hex');
const previous = await readMeta();

if (previous && previous.sha256 === sha256) {
    console.log('시추공 원본 파일이 바뀌지 않았어요.');
    await setOutput('changed', 'false');
    process.exit(0);
}

// 시추공코드,고도,시추심도,지하수위,시추방법,시추공종류,X좌표,Y좌표
const lines = decodeCsv(source.buffer).split(/\r?\n/);
const header = lines[0].split(',');
const col = (name) => {
    const index = header.indexOf(name);
    if (index < 0) throw new Error(`"${name}" 칸이 없어요. 자료 형식이 바뀌었는지 확인하세요.`);
    return index;
};
const [ELEV, DEPTH, X, Y] = ['고도', '시추심도', 'X좌표', 'Y좌표'].map(col);

const rows = [];
let skipped = 0;
for (const line of lines.slice(1)) {
    if (!line) continue;
    const cells = line.split(',');
    const elevation = Number(cells[ELEV]);
    const depth = Number(cells[DEPTH]);
    const [lng, lat] = proj4(EPSG5186, 'EPSG:4326', [Number(cells[X]), Number(cells[Y])]);
    // 고도가 비었거나 0인 것(약 9%), 우리나라 밖 좌표는 뺌
    const valid = Number.isFinite(elevation) && elevation !== 0 && elevation >= -20 && elevation <= 2000 &&
        Number.isFinite(lng) && Number.isFinite(lat) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
    if (!valid) {
        skipped++;
        continue;
    }
    rows.push([lng, lat, elevation, Number.isFinite(depth) ? depth : 0]);
}

// 같은 칸(약 1km)끼리 모이도록 정렬해 두면 서버가 칸 단위로 빨리 찾음
const cellOf = ([lng, lat]) => [Math.floor(lat / CELL), Math.floor(lng / CELL)];
rows.sort((a, b) => {
    const [ay, ax] = cellOf(a);
    const [by, bx] = cellOf(b);
    return ay - by || ax - bx;
});

// 한 시추공 = Int32 4개 (경도·위도 ×1e6, 고도·시추심도 ×100)
const data = new Int32Array(rows.length * 4);
rows.forEach(([lng, lat, elevation, depth], index) => {
    data.set([
        Math.round(lng * COORD_SCALE),
        Math.round(lat * COORD_SCALE),
        Math.round(elevation * VALUE_SCALE),
        Math.round(depth * VALUE_SCALE)
    ], index * 4);
});
await writeFile(OUTPUT_FILE, gzipSync(Buffer.from(data.buffer), { level: 9 }));
await writeFile(META_FILE, JSON.stringify({
    source: '국토교통부_지반정보_시추공 (공공데이터포털 15069365)',
    fileId: source.fileId || (previous && previous.fileId) || null,
    modified: source.modified || (previous && previous.modified) || '2023-10-30',
    sha256,
    count: rows.length,
    skipped,
    builtAt: new Date().toISOString().slice(0, 10)
}, null, 2) + '\n');

await setOutput('changed', 'true');
console.log(`시추공 ${rows.length.toLocaleString()}곳 저장 (고도 없음·좌표 오류 ${skipped.toLocaleString()}곳 제외)`);
