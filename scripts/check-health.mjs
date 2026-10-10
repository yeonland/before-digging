// 외부 데이터 장애 확인
// - 서울 리전의 /api/health가 공공데이터를 하나씩 불러 본 결과를 받음 (VWorld·국가유산청이 해외 접속을 막을 때가 있어 GitHub에서 직접 못 부름)
// - 잠깐 끊긴 것을 장애로 착각하지 않게, 실패가 있으면 몇 분 뒤 한 번 더 확인하고 두 번 다 실패한 것만 장애로 봄
// - 결과는 GitHub 이슈 본문으로 쓸 수 있게 health-report.md에 저장하고, 장애 여부를 워크플로 출력(failed)으로 넘김
// 사용: node scripts/check-health.mjs
import { appendFile, writeFile } from 'node:fs/promises';

const REPORT_FILE = new URL('../health-report.md', import.meta.url);
const HEALTH_URL = process.env.HEALTH_URL || 'https://before-digging.vercel.app/api/health';

// 배포 직후에는 새 함수가 아직 없을 수 있어 몇 번 다시 시도
const RETRIES = 5;
const RETRY_DELAY_MS = 30000;
const RECHECK_DELAY_MS = 3 * 60 * 1000;

// 실패 이유가 GitHub 실행 요약에 보이도록 오류 주석으로 남기고 종료
process.on('uncaughtException', (error) => {
    const message = String((error && error.message) || error).replace(/\s+/g, ' ');
    console.log(`::error title=장애 점검 실패::${message}`);
    process.exit(1);
});

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function fetchHealth() {
    let lastError;

    for (let attempt = 1; attempt <= RETRIES; attempt++) {
        try {
            const response = await fetch(HEALTH_URL);
            const body = await response.json().catch(() => ({}));

            if (response.ok && Array.isArray(body.checks)) {
                return body;
            }
            lastError = new Error(`점검 결과 조회 실패 (${response.status}): ${body.message || '응답 형식 오류'}`);
        } catch (error) {
            lastError = new Error(`점검 서버에 연결하지 못했습니다: ${error.cause ? error.cause.code || error.cause.message : error.message}`);
        }

        if (attempt < RETRIES) {
            console.log(`${lastError.message} → ${RETRY_DELAY_MS / 1000}초 뒤 다시 시도 (${attempt}/${RETRIES})`);
            await sleep(RETRY_DELAY_MS);
        }
    }

    throw lastError;
}

async function setOutput(name, value) {
    if (process.env.GITHUB_OUTPUT) {
        await appendFile(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
    }
}

const escapeCell = (text) => String(text).replace(/\|/g, '\\|').replace(/\s+/g, ' ');

let result = await fetchHealth();
let failedIds = new Set(result.checks.filter((check) => !check.ok).map((check) => check.id));

if (failedIds.size > 0) {
    console.log(`실패 ${failedIds.size}건 → ${RECHECK_DELAY_MS / 60000}분 뒤 한 번 더 확인`);
    await sleep(RECHECK_DELAY_MS);
    result = await fetchHealth();
    // 두 번 다 실패한 것만 장애로 봄
    failedIds = new Set(result.checks.filter((check) => !check.ok && failedIds.has(check.id)).map((check) => check.id));
}

const rows = result.checks.map((check) => {
    const mark = check.ok ? '✅ 정상' : failedIds.has(check.id) ? '❌ 장애' : '⚠️ 한 번 실패';
    return `| ${escapeCell(check.name)} | ${mark} | ${escapeCell(check.detail)} | ${check.ms}ms |`;
});

const body = [
    failedIds.size > 0
        ? `외부 데이터 ${failedIds.size}곳이 응답하지 않거나 결과가 비어 있어요. 해당 기능의 진단 결과가 빠지거나 틀릴 수 있어요.`
        : '모든 외부 데이터가 정상으로 응답했어요.',
    '',
    '| 데이터 | 상태 | 내용 | 응답 시간 |',
    '|---|---|---|---|',
    ...rows,
    '',
    `점검 시각: ${new Date(result.checkedAt).toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })} (한국 시간)`,
    '',
    '> 이 이슈는 `.github/workflows/health-check.yml`이 자동으로 만들었어요. 모두 정상으로 돌아오면 자동으로 닫혀요.'
].join('\n');

await writeFile(REPORT_FILE, body + '\n');
await setOutput('failed', failedIds.size > 0 ? 'true' : 'false');

for (const check of result.checks) {
    console.log(`${check.ok ? '정상' : failedIds.has(check.id) ? '장애' : '한 번 실패'} | ${check.name} | ${check.detail} | ${check.ms}ms`);
}
