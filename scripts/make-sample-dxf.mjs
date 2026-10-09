// 테스트용 DXF 도면 만들기: 경주 인왕동 일대 가상의 사업부지 (동부원점 EPSG:5187)
// - 부지경계: 닫힌 폴리라인 (안쪽에 제외 구역 하나)
// - 건물: 작은 닫힌 폴리라인 2개 / 도로중심선: 열린 선 (경계로 잡히면 안 됨)
// 사용: cd scripts && npm i --no-save proj4@2.11.0 && node make-sample-dxf.mjs (끝나면 scripts/node_modules 삭제)
import { writeFile } from 'node:fs/promises';
import proj4 from 'proj4';

const EPSG5187 = '+proj=tmerc +lat_0=38 +lon_0=129 +k=1 +x_0=200000 +y_0=600000 +ellps=GRS80 +units=m +no_defs';
const toTm = ([lng, lat]) => proj4('EPSG:4326', EPSG5187, [lng, lat]).map((value) => Math.round(value * 1000) / 1000);

const site = [[129.2181, 35.8347], [129.2199, 35.8346], [129.2201, 35.8357], [129.2190, 35.8361], [129.2180, 35.8356]].map(toTm);
const excluded = [[129.2188, 35.8351], [129.2192, 35.8351], [129.2192, 35.8354], [129.2188, 35.8354]].map(toTm);
const buildings = [
    [[129.2184, 35.8349], [129.2186, 35.8349], [129.2186, 35.8351], [129.2184, 35.8351]].map(toTm),
    [[129.2195, 35.8350], [129.2197, 35.8350], [129.2197, 35.8352], [129.2195, 35.8352]].map(toTm)
];
const road = [[129.2175, 35.8344], [129.2205, 35.8344]].map(toTm);

function lwpolyline(layer, points, closed) {
    return [
        '0', 'LWPOLYLINE', '8', layer, '90', String(points.length), '70', closed ? '1' : '0',
        ...points.flatMap(([x, y]) => ['10', String(x), '20', String(y)])
    ];
}

const lines = [
    '0', 'SECTION', '2', 'HEADER', '9', '$ACADVER', '1', 'AC1018', '9', '$DWGCODEPAGE', '3', 'ANSI_949', '0', 'ENDSEC',
    '0', 'SECTION', '2', 'ENTITIES',
    ...lwpolyline('부지경계', site, true),
    ...lwpolyline('부지경계', excluded, true),
    ...buildings.flatMap((points) => lwpolyline('건물', points, true)),
    ...lwpolyline('도로중심선', road, false),
    '0', 'ENDSEC', '0', 'EOF'
];

await writeFile(new URL('../samples/test-gyeongju-5187.dxf', import.meta.url), lines.join('\r\n') + '\r\n');
console.log('samples/test-gyeongju-5187.dxf 저장');
