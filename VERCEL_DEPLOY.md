 땅파기전 Vercel 배포 순서

실제 API 키는 코드, GitHub, 채팅에 입력하지 않습니다.

## 1. GitHub 저장소 만들기

1. GitHub에서 새 저장소를 만듭니다.
2. 이 폴더의 파일을 저장소 최상위에 올립니다.
3. `index.html`과 `api` 폴더가 같은 단계에 있는지 확인합니다.

## 2. Vercel 연결하기

1. https://vercel.com 에서 GitHub 계정으로 로그인합니다.
2. `Add New` → `Project`를 선택합니다.
3. 땅파기전 GitHub 저장소 옆의 `Import`를 누릅니다.
4. Framework Preset은 `Other`를 선택합니다.
5. Root Directory는 기본값 `./`을 유지합니다.
6. 아직 Deploy를 누르지 말고 Environment Variables를 엽니다.

## 3. 환경변수 입력하기

다음 값을 Vercel 화면에 직접 입력합니다.

```text
VWORLD_API_KEY=본인의 실제 VWorld API 키
LAW_API_OC=국가법령정보 공동활용 인증값 (법령 개정 확인용)
```

다음 순서로 진행합니다.

1. `VWORLD_API_KEY`, `LAW_API_OC`를 등록하고 첫 배포를 진행합니다.
2. 배포가 끝나면 `https://프로젝트명.vercel.app` 주소를 확인합니다.
3. VWorld API 관리 화면의 허용 도메인에 해당 주소를 등록합니다.
4. 국가법령정보 공동활용(open.law.go.kr) 오픈API 신청 때도 같은 주소를 도메인으로 등록합니다. 법령 API는 요청의 Referer로 도메인을 확인하므로, 주소가 바뀌면 `api/law-versions.js`의 `REGISTERED_DOMAIN`도 바꿉니다.

### 서울 리전 고정

VWorld와 국가법령정보 API는 해외에서 오는 요청을 막습니다. 그래서 `vercel.json`에서 서버 함수를 서울 리전(`icn1`)으로 고정합니다. 이 설정을 지우면 지적도와 법령 확인이 동작하지 않습니다.

서버 함수는 접속 중인 배포 주소를 VWorld 요청의 도메인 값으로 사용합니다. 별도 도메인을 연결했거나 주소를 고정하고 싶을 때만 선택적으로 `VWORLD_DOMAIN`을 등록할 수 있습니다.

`VWORLD_API_KEY`에는 `VITE_`나 `NEXT_PUBLIC_`을 붙이지 않습니다.

## 4. 확인하기

배포 사이트에서 다음 항목을 확인합니다.

- 기본 지도가 표시되는지
- 지적도(줌 17 이상), 국가유산 구역, 문화유적 분포 범위(줌 15 이상)가 표시되는지
- 필지를 눌렀을 때 필지가 강조되고 진단 결과 패널이 나오는지
- 주소 검색(예: 경주시 인왕동 815-1)과 내 위치 버튼이 동작하는지
- `https://프로젝트명.vercel.app/api/law-versions`가 법령 정보를 돌려주는지

지적도만 표시되지 않으면 Vercel의 환경변수와 VWorld 허용 도메인을 먼저 확인합니다.

## 5. 법령 개정 자동 확인 (GitHub Actions)

`.github/workflows/law-watch.yml`이 매주 월요일 오전 9시(한국 시간)에 `/api/law-versions`를 호출해 `data/law-versions.json`과 비교합니다. 바뀐 법령이 있으면 GitHub 이슈를 만들고 기록 파일을 자동으로 커밋합니다. GitHub에는 따로 넣을 비밀값이 없습니다. 주소가 바뀌면 `scripts/check-laws.mjs`의 `VERSIONS_URL`을 바꿉니다.
