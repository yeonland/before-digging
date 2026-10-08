// 서비스 안내(guidance.js)에 쓰는 법령이 개정됐는지 국가법령정보 공동활용 오픈API로 확인
// - 법령일련번호(MST)가 바뀌면 개정된 것으로 보고 data/law-versions.json을 갱신
// - 바뀐 내용은 GitHub 이슈 본문으로 쓸 수 있게 law-changes.md에 저장 (워크플로가 이슈 생성)
// 사용: LAW_API_OC=<인증값> node scripts/check-laws.mjs
import { readFile, writeFile } from 'node:fs/promises';

const STATE_FILE = new URL('../data/law-versions.json', import.meta.url);
const CHANGES_FILE = new URL('../law-changes.md', import.meta.url);

// 지켜볼 법령 (검색어 → 정확히 일치하는 법령명만 사용)
const WATCHED = [
    { query: '국가유산영향진단법', names: ['국가유산영향진단법', '국가유산영향진단법 시행령', '국가유산영향진단법 시행규칙'] },
    { query: '매장유산 보호 및 조사에 관한 법률', names: ['매장유산 보호 및 조사에 관한 법률', '매장유산 보호 및 조사에 관한 법률 시행령', '매장유산 보호 및 조사에 관한 법률 시행규칙'] },
    { query: '문화유산의 보존 및 활용에 관한 법률', names: ['문화유산의 보존 및 활용에 관한 법률', '문화유산의 보존 및 활용에 관한 법률 시행령', '문화유산의 보존 및 활용에 관한 법률 시행규칙'] }
];

const oc = process.env.LAW_API_OC;

if (!oc) {
    console.log('LAW_API_OC가 설정되지 않아 법령 확인을 건너뜁니다.');
    process.exit(0);
}

function formatDate(yyyymmdd) {
    return /^\d{8}$/.test(yyyymmdd || '')
        ? `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}.`
        : yyyymmdd || '-';
}

async function searchLaws(query) {
    const params = new URLSearchParams({ OC: oc, target: 'law', type: 'JSON', query, display: '100' });
    const response = await fetch(`https://www.law.go.kr/DRF/lawSearch.do?${params}`);
    const text = await response.text();

    let body;
    try {
        body = JSON.parse(text);
    } catch {
        throw new Error(`법령 API 응답을 읽을 수 없습니다 (${response.status}): ${text.slice(0, 200)}`);
    }

    if (!body.LawSearch) {
        throw new Error(`법령 API 오류: ${text.slice(0, 200)}`);
    }

    return [].concat(body.LawSearch.law || []);
}

async function fetchCurrentVersions() {
    const versions = {};

    for (const { query, names } of WATCHED) {
        const laws = await searchLaws(query);

        for (const name of names) {
            const law = laws.find((item) => item['법령명한글'] === name);
            if (!law) {
                throw new Error(`"${name}"을(를) 찾지 못했습니다. 법령명이 바뀌었을 수 있습니다.`);
            }
            versions[name] = {
                mst: law['법령일련번호'],
                lawId: law['법령ID'],
                kind: law['법령구분명'],
                effectiveDate: law['시행일자'],
                promulgationDate: law['공포일자'],
                promulgationNo: law['공포번호'],
                revisionType: law['제개정구분명']
            };
        }
    }

    return versions;
}

async function readState() {
    try {
        return JSON.parse(await readFile(STATE_FILE, 'utf8'));
    } catch {
        return null;
    }
}

const current = await fetchCurrentVersions();
const previous = await readState();

if (!previous) {
    await writeFile(STATE_FILE, JSON.stringify(current, null, 2) + '\n');
    console.log('처음 실행이라 현재 법령 정보를 기준으로 저장했습니다.');
    process.exit(0);
}

const changed = Object.entries(current).filter(
    ([name, version]) => !previous[name] || previous[name].mst !== version.mst
);

if (changed.length === 0) {
    console.log('바뀐 법령이 없습니다.');
    process.exit(0);
}

const lines = changed.map(([name, version]) => {
    const before = previous[name];
    const link = `https://www.law.go.kr/법령/${encodeURIComponent(name)}`;
    return [
        `### [${name}](${link})`,
        `- 개정 종류: ${version.revisionType}`,
        `- 공포: ${formatDate(version.promulgationDate)} (제${version.promulgationNo}호)`,
        `- 시행: **${formatDate(version.effectiveDate)}**`,
        before ? `- 이전 기록: ${formatDate(before.effectiveDate)} 시행 (${before.revisionType})` : '- 이전 기록 없음'
    ].join('\n');
});

const body = [
    '서비스 안내에 쓰는 법령이 개정됐어요. 조문이 바뀌었는지 확인하고, 필요하면 `guidance.js`와 `docs/기획서.md` 5장을 고쳐주세요.',
    '',
    ...lines,
    '',
    '> 이 이슈는 `.github/workflows/law-watch.yml`이 자동으로 만들었어요.'
].join('\n');

await writeFile(CHANGES_FILE, body + '\n');
await writeFile(STATE_FILE, JSON.stringify(current, null, 2) + '\n');
console.log(`바뀐 법령 ${changed.length}건:\n${changed.map(([name]) => `- ${name}`).join('\n')}`);
