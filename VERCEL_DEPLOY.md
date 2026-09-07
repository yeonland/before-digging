# 땅파기전 Vercel 배포 순서

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
```

다음 순서로 진행합니다.

1. `VWORLD_API_KEY`를 등록하고 첫 배포를 진행합니다.
2. 배포가 끝나면 `https://프로젝트명.vercel.app` 주소를 확인합니다.
3. VWorld API 관리 화면의 허용 도메인에 해당 주소를 등록합니다.

서버 함수는 접속 중인 배포 주소를 VWorld 요청의 도메인 값으로 사용합니다. 별도 도메인을 연결했거나 주소를 고정하고 싶을 때만 선택적으로 `VWORLD_DOMAIN`을 등록할 수 있습니다.

`VWORLD_API_KEY`에는 `VITE_`나 `NEXT_PUBLIC_`을 붙이지 않습니다.

## 4. 확인하기

배포 사이트에서 다음 항목을 확인합니다.

- 기본 지도가 표시되는지
- 지적도 표시 버튼이 동작하는지
- 문화유산 구역이 표시되는지
- 구역 안과 밖을 클릭했을 때 안내가 달라지는지
- 주소 검색과 현재 위치가 동작하는지

지적도만 표시되지 않으면 Vercel의 환경변수와 VWorld 허용 도메인을 먼저 확인합니다.
