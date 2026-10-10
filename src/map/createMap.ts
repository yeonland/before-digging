// Leaflet 지도: 배경지도, 지적도·국가유산 레이어, 범례, 확대 안내, 내 위치 버튼
// 지도는 Leaflet이 직접 그리고, React 쪽에서는 이 파일이 돌려주는 함수로만 다룸
import L from 'leaflet';
import type { Feature, FeatureCollection, Geometry } from 'geojson';
import markerIcon from 'leaflet/dist/images/marker-icon.png';
import markerIcon2x from 'leaflet/dist/images/marker-icon-2x.png';
import markerShadow from 'leaflet/dist/images/marker-shadow.png';
import type { RiskLevel } from '../result/guidance.js';
import { getJson } from '../shared/api';

// 번들러에서는 Leaflet 기본 핀 그림을 직접 넣어야 함 (기본 핀은 CSS에서 찾은 경로를 앞에 붙여서 깨짐)
L.Marker.prototype.options.icon = L.icon({
    iconUrl: markerIcon,
    iconRetinaUrl: markerIcon2x,
    shadowUrl: markerShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    tooltipAnchor: [16, -28],
    shadowSize: [41, 41]
});

const SITES_MIN_ZOOM = 15;
const CADASTRAL_MIN_ZOOM = 17;

// 국가유산청 현상변경 허용기준 구역. 1구역(가장 엄격)일수록 진하게
const ALLOWANCE_COLORS: Record<string, string> = { '1': '#d62828', '2': '#f77f00', '3': '#fcbf49', '4': '#90be6d', '5': '#43aa8b' };

// 세계유산 구역·완충구역 (색은 국가유산공간정보서비스와 비슷하게)
const WORLD_STYLES: Record<string, L.PathOptions> = {
    core: { color: '#008f87', fillColor: '#2ad1c9', fillOpacity: 0.3, weight: 1.5 },
    buffer: { color: '#ff7078', fillColor: '#ff7078', fillOpacity: 0.15, weight: 1.5, dashArray: '6 4' },
    district: { color: '#5e17eb', fillOpacity: 0, weight: 2.5 }
};

const SITE_BOUNDARY_STYLE: L.PathOptions = { color: '#1d4ed8', weight: 3, dashArray: '8 4', fillColor: '#1d4ed8', fillOpacity: 0.06 };
const RISK_COLORS: Record<RiskLevel, string> = { high: '#d62828', caution: '#e9a400', unknown: '#999999', low: '#2a9d8f' };

const LOCATE_ICON = '<svg viewBox="0 0 512 512" width="15" height="15" aria-hidden="true"><path fill="currentColor" d="M429.6 92.1c4.9-11.9 2.1-25.6-7-34.7s-22.8-11.9-34.7-7l-352 144c-14.2 5.8-22.2 20.8-19.3 35.8S32.7 256 48 256h176v176c0 15.3 10.8 28.4 25.8 31.4s30-5.1 35.8-19.3l144-352z"/></svg>';
const SPINNER_ICON = '<span class="locate-spinner" aria-hidden="true"></span>';

export interface SiteParcelShape {
    geometry: Geometry;
    tooltip: string;
    level: RiskLevel;
}

export interface MapController {
    map: L.Map;
    placeMarker(latlng: L.LatLngExpression): L.Marker;
    isActiveMarker(marker: L.Marker): boolean;
    highlightParcel(geometry: Geometry | null): void;
    showSiteBoundary(geometry: Geometry): void;
    drawSiteParcels(parcels: SiteParcelShape[], boundary: Geometry, onClick: (index: number) => void): void;
}

export function createMap(element: HTMLElement, onClick: (latlng: L.LatLng) => void): MapController {
    // 지도 초기화 (서울 시청, 줌 레벨 13)
    const map = L.map(element).setView([37.5665, 126.9780], 13);

    // 오픈스트리트맵(무료 배경 지도)
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    // VWorld 지적도 WMS (VWorld는 줌 17 미만에서 빈 이미지를 보내므로 17부터 요청)
    const cadastralLayer = L.tileLayer.wms('/api/vworld', {
        layers: 'lp_pa_cbnd_bubun,lp_pa_cbnd_bonbun', // BUBBLE이 아니라 BUBUN
        styles: '', // 잘못된 스타일명을 보내지 않고 기본 스타일 사용
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        crs: L.CRS.EPSG3857,
        minZoom: 17,
        maxZoom: 19
    }).addTo(map);

    // VWorld 국가유산 지정/보호구역 WMS (줌 10부터 표시됨)
    const heritageLayer = L.tileLayer.wms('/api/vworld', {
        layers: 'lt_c_uo301',
        styles: 'lt_c_uo301',
        format: 'image/png',
        transparent: true,
        version: '1.3.0',
        opacity: 0.6,
        crs: L.CRS.EPSG3857,
        minZoom: 10,
        maxZoom: 19
    }).addTo(map);

    // 국가유산청 문화유적분포지도 (VWorld 보호구역(파란 빗금)과 구분되도록 보라색)
    const sitesLayer = L.geoJSON(undefined, {
        interactive: false,
        style: { color: '#7b2cbf', weight: 1.5, fillColor: '#9d4edd', fillOpacity: 0.25 }
    }).addTo(map);

    // 현상변경 허용기준 구역 (기본은 꺼둠)
    const allowanceLayer = L.geoJSON(undefined, {
        interactive: false,
        style: feature => {
            const color = ALLOWANCE_COLORS[String(feature?.properties.zoneCode || '').charAt(1)] || '#577590';
            return { color, weight: 1.5, dashArray: '4 3', fillColor: color, fillOpacity: 0.12 };
        }
    });

    // 세계유산 구역·완충구역 (기본은 꺼둠)
    const worldLayer = L.geoJSON(undefined, {
        interactive: false,
        style: feature => WORLD_STYLES[feature?.properties.kind] || WORLD_STYLES.core
    });

    // 줌 15 타일 칸 단위로 도형을 받아 레이어에 그림 (이미 받은 칸과 도형은 다시 그리지 않음)
    function createTileLoader(layer: L.GeoJSON, query: string, label: string) {
        const loadedTiles = new Set<string>();
        const loadedIds = new Set<string>();

        return function load() {
            if (!map.hasLayer(layer) || map.getZoom() < SITES_MIN_ZOOM) return;

            const bounds = map.getBounds();
            const min = map.project(bounds.getNorthWest(), SITES_MIN_ZOOM).divideBy(256).floor();
            const max = map.project(bounds.getSouthEast(), SITES_MIN_ZOOM).divideBy(256).floor();

            for (let x = min.x; x <= max.x; x++) {
                for (let y = min.y; y <= max.y; y++) {
                    const tileKey = `${x}/${y}`;
                    if (loadedTiles.has(tileKey)) continue;
                    loadedTiles.add(tileKey);

                    getJson<{ features: Feature[] }>(`/api/heritage-sites?x=${x}&y=${y}${query}`)
                        .then(data => {
                            // 여러 칸에 걸친 도형은 한 번만 그림
                            const newFeatures = data.features.filter(feature => !loadedIds.has(feature.properties?.id));
                            newFeatures.forEach(feature => loadedIds.add(feature.properties?.id));
                            layer.addData({ type: 'FeatureCollection', features: newFeatures } as FeatureCollection);
                        })
                        .catch(error => {
                            console.error(`${label} 불러오기 오류:`, error);
                            loadedTiles.delete(tileKey); // 다음 이동 때 다시 시도
                        });
                }
            }
        };
    }

    const loaders = [
        createTileLoader(sitesLayer, '', '문화유적분포지도'),
        createTileLoader(allowanceLayer, '&layer=allowance', '현상변경 허용기준'),
        createTileLoader(worldLayer, '&layer=world', '세계유산')
    ];
    loaders.forEach(load => {
        map.on('moveend overlayadd', load);
        load(); // 꺼진 레이어는 load 안에서 건너뜀
    });

    L.control.layers(undefined, {
        '지적도 표시': cadastralLayer,
        '국가유산 구역 표시': heritageLayer,
        '문화유적 분포 범위 표시': sitesLayer,
        '현상변경 허용기준 구역 표시': allowanceLayer,
        '세계유산 구역·완충구역 표시': worldLayer
    }).addTo(map);

    // 범례: 지도 색깔이 무엇을 뜻하는지 표시 (VWorld 색은 GetLegendGraphic 기준)
    const legend = new L.Control({ position: 'bottomleft' });
    legend.onAdd = () => {
        const div = L.DomUtil.create('div', 'map-legend');
        div.innerHTML = `
            <button type="button" class="legend-title" aria-expanded="true">범례 <span class="legend-arrow">▾</span></button>
            <div class="legend-items">
                <div><span class="swatch" style="background: #ffff4d; border: 1px solid #c9c900;"></span>국가·시도 지정유산 구역</div>
                <div><span class="swatch" style="background: repeating-linear-gradient(135deg, #4bb3e8 0 2px, #fff 2px 4px);"></span>보호구역</div>
                <div><span class="swatch" style="border: 2px solid #4caf50;"></span>역사문화환경 보존지역</div>
                <div><span class="swatch" style="background: rgba(157, 78, 221, 0.25); border: 1.5px solid #7b2cbf;"></span>문화유적 분포 범위</div>
                <div><span class="swatch" style="border: 1.5px dashed #d62828;"></span>현상변경 허용기준 구역 (켰을 때, 빨강 1구역 → 초록 바깥 구역)</div>
                <div><span class="swatch" style="background: rgba(42, 209, 201, 0.3); border: 1.5px solid #008f87;"></span>세계유산 구역 (켰을 때)</div>
                <div><span class="swatch" style="border: 1.5px dashed #ff7078;"></span>세계유산 완충구역 (켰을 때)</div>
                <div><span class="swatch" style="border: 1.5px solid #e8a33d;"></span>지적도(필지 경계)</div>
            </div>
        `;

        // 제목을 누르면 접고 펼침. 휴대폰처럼 좁은 화면에서는 접힌 채로 시작
        const toggle = div.querySelector('.legend-title') as HTMLButtonElement;
        const setOpen = (open: boolean) => {
            div.classList.toggle('is-collapsed', !open);
            toggle.setAttribute('aria-expanded', String(open));
        };
        setOpen(!window.matchMedia('(max-width: 600px)').matches);
        L.DomEvent.disableClickPropagation(div);
        L.DomEvent.on(toggle, 'click', () => setOpen(div.classList.contains('is-collapsed')));
        return div;
    };
    legend.addTo(map);

    // 켜져 있는 레이어가 현재 줌에서 안 보이면 안내 문구 표시
    const zoomHint = new L.Control({ position: 'bottomleft' });
    zoomHint.onAdd = () => L.DomUtil.create('div', 'zoom-hint');

    function updateZoomHint() {
        const hidden = [];
        if (map.hasLayer(sitesLayer) && map.getZoom() < SITES_MIN_ZOOM) hidden.push('문화유적 분포 범위');
        if (map.hasLayer(cadastralLayer) && map.getZoom() < CADASTRAL_MIN_ZOOM) hidden.push('지적도');

        if (hidden.length > 0) {
            zoomHint.addTo(map);
            zoomHint.getContainer()!.textContent = `${hidden.join(', ')}는 더 확대하면 표시됩니다.`;
        } else {
            zoomHint.remove();
        }
    }
    map.on('zoomend overlayadd overlayremove', updateZoomHint);
    updateZoomHint();

    // 지도 위 핀은 하나만 유지 (내 위치, 검색, 클릭 중 마지막 것만 표시)
    let activeMarker: L.Marker | null = null;
    let parcelHighlight: L.GeoJSON | null = null;
    const siteLayer = L.layerGroup().addTo(map);

    function placeMarker(latlng: L.LatLngExpression) {
        if (activeMarker) map.removeLayer(activeMarker);
        highlightParcel(null);
        activeMarker = L.marker(latlng).addTo(map);
        return activeMarker;
    }

    // 진단한 필지를 지도에 강조 표시 (null이면 지움)
    function highlightParcel(geometry: Geometry | null) {
        if (parcelHighlight) map.removeLayer(parcelHighlight);
        parcelHighlight = geometry
            ? L.geoJSON(geometry, {
                interactive: false,
                style: { color: '#d62828', weight: 3, fillColor: '#d62828', fillOpacity: 0.08 }
            }).addTo(map)
            : null;
    }

    // 도면 사업부지 경계 미리보기
    function showSiteBoundary(geometry: Geometry) {
        siteLayer.clearLayers();
        const boundary = L.geoJSON(geometry, { interactive: false, style: SITE_BOUNDARY_STYLE }).addTo(siteLayer);
        map.fitBounds(boundary.getBounds(), { padding: [20, 20] });
    }

    // 부지 경계와 필지(위험도 색)를 그림. 필지를 누르면 그 필지 진단을 보여줌
    function drawSiteParcels(parcels: SiteParcelShape[], boundary: Geometry, onParcelClick: (index: number) => void) {
        siteLayer.clearLayers();
        parcels.forEach((item, index) => {
            const color = RISK_COLORS[item.level];
            L.geoJSON(item.geometry, { style: { color, weight: 1, fillColor: color, fillOpacity: 0.25 } })
                .bindTooltip(item.tooltip)
                .on('click', event => {
                    L.DomEvent.stopPropagation(event);
                    onParcelClick(index);
                })
                .addTo(siteLayer);
        });
        const outline = L.geoJSON(boundary, { interactive: false, style: SITE_BOUNDARY_STYLE }).addTo(siteLayer);
        map.fitBounds(outline.getBounds(), { padding: [20, 20] });
    }

    // 내 위치 버튼: 첫 화면에서 묻지 않고, 사용자가 원할 때만 위치 권한 요청
    const locateControl = new L.Control({ position: 'bottomright' });
    locateControl.onAdd = () => {
        const container = L.DomUtil.create('div', 'leaflet-bar');
        const button = L.DomUtil.create('a', 'locate-button', container);
        button.href = '#';
        button.title = '내 위치로 이동';
        button.setAttribute('role', 'button');
        button.setAttribute('aria-label', '내 위치로 이동');
        button.innerHTML = LOCATE_ICON;

        L.DomEvent.disableClickPropagation(container);
        L.DomEvent.on(button, 'click', event => {
            L.DomEvent.preventDefault(event);
            findMyLocation(button);
        });
        return container;
    };
    locateControl.addTo(map);

    function findMyLocation(button: HTMLElement) {
        if (!('geolocation' in navigator)) {
            alert('이 브라우저는 위치 정보를 지원하지 않습니다.');
            return;
        }

        const stopLoading = () => {
            button.classList.remove('is-loading');
            button.innerHTML = LOCATE_ICON;
        };
        button.classList.add('is-loading');
        button.innerHTML = SPINNER_ICON;

        navigator.geolocation.getCurrentPosition(
            position => {
                stopLoading();
                const { latitude: lat, longitude: lng } = position.coords;
                // 지도의 중심을 내 위치로 이동 (지적도가 보이는 줌 레벨 17)
                map.setView([lat, lng], 17);
                placeMarker([lat, lng])
                    .bindPopup('내 위치<br><span style="font-size: 12px; color: #666;">진단하려면 지도에서 필지를 눌러주세요.</span>')
                    .openPopup();
            },
            error => {
                stopLoading();
                console.warn('위치 정보를 가져올 수 없습니다:', error.message);
                alert('위치 정보를 가져올 수 없습니다. 브라우저의 위치 권한을 확인해 주세요.');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }

    map.on('click', event => onClick(event.latlng));

    return {
        map,
        placeMarker,
        isActiveMarker: marker => marker === activeMarker,
        highlightParcel,
        showSiteBoundary,
        drawSiteParcels
    };
}
