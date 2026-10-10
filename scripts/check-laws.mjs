// 서비스 안내(src/lib/guidance.js)에 쓰는 법령이 개정됐는지 확인
// - 법령 정보는 서울 리전의 /api/law-versions에서 받음 (법령 API가 해외 접속을 막아 GitHub에서 직접 못 부름)
// - 법령일련번호(MST)가 바뀌면 개정된 것으로 보고 data/law-versions.json을 갱신
// - 바뀐 내용은 GitHub 이슈 본문으로 쓸 수 있게 law-changes.md에 저장 (워크플로가 이슈 생성)
// 사용: node scripts/check-laws.mjs
import { readFile, writeFile } from 'node:fs/promises';

const STATE_FILE = new URL('../data/law-versions.json', import.meta.url);
const CHANGES_FILE = new URL('../law-changes.md', import.meta.url);
const VERSIONS_URL = process.env.LAW_VERSIONS_URL || 'https://before-digging.vercel.app/api/law-versions';

// 배포 직후에는 새 함수가 아직 없을 수 있어 몇 번 다시 시도
const RETRIES = 5;
const RETRY_DELAY_MS = 30000;

// 실패 이유가 GitHub 실행 요약에 보이도록 오류 주석으로 남기고 종료
process.on('uncaughtException', (error) => {
    const message = String((error && error.message) || error).replace(/\s+/g, ' ');
    console.log(`::error title=법령 확인 실패::${message}`);
    process.exit(1);
});

function formatDate(yyyymmdd) {
    return /^\d{8}$/.test(yyyymmdd || '')
        ? `${yyyymmdd.slice(0, 4)}.${yyyymmdd.slice(4, 6)}.${yyyymmdd.slice(6, 8)}.`
        : yyyymmdd || '-';
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchCurrentVersions() {
    let lastError;

    for (let attempt = 1; attempt <= RETRIES; attempt++) {
        try {
            const response = await fetch(VERSIONS_URL);
            const body = await response.json().catch(() => ({}));

            if (response.ok && body.versions) {
                return body.versions;
            }
            lastError = new Error(`법령 정보 조회 실패 (${response.status}): ${body.message || '응답 형식 오류'}`);
        } catch (error) {
            lastError = new Error(`법령 정보 서버에 연결하지 못했습니다: ${error.cause ? error.cause.code || error.cause.message : error.message}`);
        }

        if (attempt < RETRIES) {
            console.log(`${lastError.message} → ${RETRY_DELAY_MS / 1000}초 뒤 다시 시도 (${attempt}/${RETRIES})`);
            await sleep(RETRY_DELAY_MS);
        }
    }

    throw lastError;
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
    '서비스 안내에 쓰는 법령이 개정됐어요. 조문이 바뀌었는지 확인하고, 필요하면 `src/lib/guidance.js`와 `docs/기획서.md` 5장을 고쳐주세요.',
    '',
    ...lines,
    '',
    '> 이 이슈는 `.github/workflows/law-watch.yml`이 자동으로 만들었어요.'
].join('\n');

await writeFile(CHANGES_FILE, body + '\n');
await writeFile(STATE_FILE, JSON.stringify(current, null, 2) + '\n');
console.log(`바뀐 법령 ${changed.length}건:\n${changed.map(([name]) => `- ${name}`).join('\n')}`);
