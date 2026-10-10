// 땅파기전 화면: 지도, 검색창, 진단 결과 패널을 묶고 진단 흐름(필지 클릭·검색·도면·공유 링크)을 다룸
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import type L from 'leaflet';
import { createMap, type MapController } from './map/createMap';
import { buildRisk } from './lib/guidance.js';
import { loadDepartments, type DepartmentData } from './lib/departments';
import { loadDxfSite } from './lib/loaders';
import { buildShareUrl, readSharedLink, type LatLng, type PanelInputs, type SharedLink } from './lib/share';
import type { AnalysisResult, PointResult, SearchResult, SiteResponse } from './types';
import { ParcelPopup, PointPopup } from './components/Popups';
import { GuidancePanel, type GuidanceOptions } from './components/GuidancePanel';
import { SiteSetup, SiteTable, type SiteDraft } from './components/SitePanels';
import { SearchBox } from './components/SearchBox';

type Panel =
    | { kind: 'message'; text: string } // 도면 사업부지 진행 안내
    | { kind: 'siteSetup'; draft: SiteDraft }
    | { kind: 'guidance'; id: number; data: AnalysisResult; options: GuidanceOptions; location: LatLng | null; diagnosedAt: Date };

// React로 그린 내용을 Leaflet 핀 팝업에 넣음 (핀이 지도에서 빠지면 정리)
function setPopupContent(marker: L.Marker, content: ReactNode) {
    const element = document.createElement('div');
    const root = createRoot(element);
    flushSync(() => root.render(content));
    marker.setPopupContent(element);
    marker.once('remove', () => setTimeout(() => root.unmount()));
}

export default function App() {
    const mapElement = useRef<HTMLDivElement>(null);
    const panelElement = useRef<HTMLElement>(null);
    const mapRef = useRef<MapController | null>(null);

    const [panel, setPanel] = useState<Panel | null>(null);
    const [inputs, setInputs] = useState<PanelInputs>({ work: '', landArea: '', floorArea: '', ground: '', depth: '' });
    // 링크에 담을 위치 (새 진단이 끝나기 전에도 바뀜. 결과 패널은 panel.location)
    const [shareLocation, setShareLocation] = useState<LatLng | null>(null);
    const [departments, setDepartments] = useState<DepartmentData | null>(null);
    const [siteResponse, setSiteResponse] = useState<SiteResponse | null>(null);
    const [scrollTarget, setScrollTarget] = useState<{ id: string } | null>(null);

    const sharedInputs = useRef<SharedLink | null>(null); // 공유 링크로 열었을 때 처음 한 번 채울 입력값
    const siteDraft = useRef<SiteDraft | null>(null);
    const panelId = useRef(0);

    const scrollTo = (id: string) => setScrollTarget({ id });

    useEffect(() => {
        if (!scrollTarget) return;
        const element = document.getElementById(scrollTarget.id);
        if (element instanceof HTMLDetailsElement) element.open = true;
        (element || panelElement.current)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, [scrollTarget]);

    // options.elevation: 도면에서 읽은 표고. 공유 링크로 열었으면 링크의 입력값을 채움
    function showGuidancePanel(data: AnalysisResult, options: GuidanceOptions, location: LatLng | null) {
        const shared = sharedInputs.current;
        sharedInputs.current = null;
        const text = (value: number | null | undefined, fallback: string) => value !== null && value !== undefined ? String(value) : fallback;
        setInputs({
            work: shared ? shared.work : '',
            landArea: text(shared?.area, String(Math.round(data.parcel.area))),
            floorArea: text(shared?.floor, ''),
            ground: text(shared?.ground, options.elevation ? String(options.elevation.median) : ''),
            depth: text(shared?.depth, '')
        });
        panelId.current += 1;
        setPanel({ kind: 'guidance', id: panelId.current, data, options, location, diagnosedAt: new Date() });
    }

    // 한 지점의 필지를 진단 (지도 클릭, 주소 검색, 공유 링크에서 사용)
    function diagnose(latlng: LatLng) {
        const controller = mapRef.current!;
        // 응답이 늦게 와도 이 클릭의 핀에만 결과를 넣도록 지역 변수로 보관
        const marker = controller.placeMarker(latlng);
        marker.bindPopup('필지와 국가유산 데이터 확인 중...', { maxWidth: 320 }).openPopup();
        setShareLocation(latlng);

        const query = `lat=${latlng.lat}&lng=${latlng.lng}`;

        // 필지 단위로 진단하고, 지적도에 없는 곳이면 클릭 지점만 진단
        fetch(`/api/parcel?${query}`)
            .then(response => {
                if (!response.ok) throw new Error('필지 진단 실패');
                return response.json();
            })
            .then((data: AnalysisResult | { parcel: null }) => {
                if (!controller.isActiveMarker(marker)) return; // 그사이 다른 곳을 눌렀으면 무시
                if (data.parcel) {
                    const result = data as AnalysisResult;
                    controller.highlightParcel(result.parcel.geometry);
                    setPopupContent(marker, (
                        <ParcelPopup data={result} onShowPanel={() => scrollTo('result-panel')} onShowOverlaps={() => scrollTo('overlap-list')} />
                    ));
                    showGuidancePanel(result, {}, latlng);
                    return;
                }
                setPanel(null);
                return fetch(`/api/heritage?${query}`)
                    .then(response => {
                        if (!response.ok) throw new Error('국가유산 구역 조회 실패');
                        return response.json();
                    })
                    .then((pointData: PointResult) => setPopupContent(marker, <PointPopup data={pointData} />));
            })
            .catch(error => {
                console.error('진단 오류:', error);
                marker.setPopupContent('국가유산 데이터를 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.');
            });
    }

    // 지도 클릭은 지도를 만들 때 한 번만 연결하므로, 항상 최신 diagnose를 부르도록 ref로 넘김
    const diagnoseRef = useRef(diagnose);
    diagnoseRef.current = diagnose;

    useEffect(() => {
        const controller = createMap(mapElement.current!, latlng => diagnoseRef.current(latlng));
        mapRef.current = controller;
        loadDepartments().then(setDepartments);

        // 공유 링크로 열었으면 그 위치를 바로 진단
        const shared = readSharedLink(window.location.search);
        if (shared) {
            sharedInputs.current = shared;
            controller.map.setView([shared.location.lat, shared.location.lng], 18);
            diagnoseRef.current(shared.location);
        }
        return () => {
            controller.map.remove();
            mapRef.current = null;
        };
    }, []);

    function goToResult(result: SearchResult) {
        const latlng = { lat: result.lat, lng: result.lng };
        mapRef.current!.map.setView([latlng.lat, latlng.lng], 18);
        diagnose(latlng);
    }

    // ---------------------------------------------------------------
    // 도면(DXF)으로 사업부지 진단: 파일 고르기 → 경계 레이어·좌표계 고르기 → 부지 전체 + 필지별 진단
    // 도면 파일은 브라우저 안에서만 읽고, 서버에는 바꾼 경계 좌표만 보냄
    // ---------------------------------------------------------------
    function showSiteMessage(text: string) {
        setPanel({ kind: 'message', text });
        scrollTo('result-panel');
    }

    async function handleDxfFile(file: File) {
        showSiteMessage('도면을 읽는 중이에요...');
        try {
            const dxf = await loadDxfSite();
            const { layers, elevations } = dxf.readBoundaries(dxf.decodeDxf(await file.arrayBuffer()));
            if (layers.length === 0) {
                showSiteMessage('도면에서 닫힌 경계선(닫힌 폴리라인)을 찾지 못했어요. 사업부지 경계를 닫힌 폴리라인으로 그린 DXF인지 확인해 주세요.');
                return;
            }
            await showSiteSetup({ fileName: file.name, layers, elevations, layerIndex: 0, crs: null, candidates: [] });
        } catch (error) {
            console.error('도면 읽기 오류:', error);
            showSiteMessage('도면을 읽지 못했어요. DXF 형식(ASCII)으로 저장한 파일인지 확인해 주세요.');
        }
    }

    // 1. 경계 레이어, 2. 좌표계 고르기. 좌표계 후보마다 그렇게 읽으면 어느 주소가 되는지 보여줌
    async function showSiteSetup(next: SiteDraft) {
        siteDraft.current = next;
        showSiteMessage('좌표계 후보 위치를 확인하는 중이에요...');

        const dxf = await loadDxfSite();
        const candidates = dxf.crsCandidates(next.layers[next.layerIndex]);
        let addresses: (string | null)[] = [];
        if (candidates.length > 0) {
            const points = candidates.map(item => item.center.join(',')).join('|');
            const response = await fetch(`/api/site?points=${encodeURIComponent(points)}`);
            addresses = response.ok ? (await response.json()).addresses : [];
        }
        if (next !== siteDraft.current) return; // 그사이 다른 파일이나 레이어를 골랐으면 무시

        // 지적도에 없는 곳(바다·국외)으로 떨어지는 후보는 뺌
        const found = candidates
            .map((item, index) => ({ ...item, address: addresses[index] || '' }))
            .filter(item => item.address);
        let crs = found.some(item => item.code === next.crs) ? next.crs : null;
        if (found.length === 1) crs = found[0].code;

        updateDraft({ ...next, candidates: found, crs });
        if (crs) await previewSite(next.layers[next.layerIndex], crs);
    }

    function updateDraft(draft: SiteDraft) {
        siteDraft.current = draft;
        setPanel({ kind: 'siteSetup', draft });
    }

    async function previewSite(layer: SiteDraft['layers'][number], crs: number) {
        const dxf = await loadDxfSite();
        mapRef.current!.showSiteBoundary(dxf.toGeometry(layer, crs));
    }

    async function runSite() {
        const draft = siteDraft.current!;
        const layer = draft.layers[draft.layerIndex];
        const dxf = await loadDxfSite();
        const geometry = dxf.toGeometry(layer, draft.crs!);
        showSiteMessage('사업부지와 걸친 필지를 진단하는 중이에요... 필지가 많으면 1분 가까이 걸릴 수 있어요.');
        try {
            const response = await fetch('/api/site', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ geometry })
            });
            const data = await response.json();
            if (!response.ok) {
                showSiteMessage(data.message || '사업부지를 진단하지 못했어요. 잠시 후 다시 시도해 주세요.');
                return;
            }
            if (data.parcels.length === 0) {
                showSiteMessage('경계 안에서 필지를 찾지 못했어요. 좌표계를 다시 확인해 주세요.');
                return;
            }
            const site: SiteResponse = {
                ...data,
                parcels: data.parcels.map((item: AnalysisResult) => ({ ...item, risk: buildRisk(item) })),
                // 고른 경계 안의 표고 (측량 현황도라면 표고점 글자, 등고선 높이)
                elevation: dxf.siteElevation(layer, draft.elevations)
            };
            setSiteResponse(site);
            showSitePanel(site);
        } catch (error) {
            console.error('사업부지 진단 오류:', error);
            showSiteMessage('사업부지를 진단하지 못했어요. 잠시 후 다시 시도해 주세요.');
        }
    }

    // 부지 전체 진단: 위험도·해야 할 일은 부지 경계 기준, 아래에 필지별 표
    function showSitePanel(data: SiteResponse) {
        const first = data.parcels[0].parcel.address.split(' ');
        const place = first.slice(0, /세종/.test(first[0]) ? 2 : 3).join(' ');
        const siteData: AnalysisResult = {
            ...data.result,
            target: 'site',
            parcel: {
                address: `${place} 일원 (도면 사업부지, ${data.site.parcelCount}필지)`,
                jibun: '',
                area: data.site.area,
                geometry: data.site.geometry
            }
        };

        setShareLocation(null);
        showGuidancePanel(siteData, {
            title: '도면 사업부지 진단 결과 · 해야 할 일',
            areaLabel: '부지 면적',
            siteTable: true,
            shareable: false,
            elevation: data.elevation
        }, null);

        const controller = mapRef.current!;
        controller.highlightParcel(null);
        controller.drawSiteParcels(
            data.parcels.map(item => ({
                geometry: item.parcel.geometry,
                level: item.risk.level,
                tooltip: `${item.parcel.address} · 위험도 ${item.risk.icon} ${item.risk.label}`
            })),
            data.site.geometry,
            index => showSiteParcel(data, index)
        );
        scrollTo('result-panel');
    }

    function showSiteParcel(data: SiteResponse, index: number) {
        const item = data.parcels[index];
        mapRef.current!.highlightParcel(item.parcel.geometry);
        showGuidancePanel(item, { back: true, shareable: false }, null);
        scrollTo('result-panel');
    }

    // ---------------------------------------------------------------
    // 결과 공유
    // - 링크: 진단한 위치(+ 공사 종류·면적 입력)를 주소창에 담음. 결과를 저장하지 않고, 열 때 그 시점 데이터로 다시 진단
    // - PDF: 브라우저 인쇄로 결과 패널만 출력 (펼쳐보기는 모두 펼침, 진단 일시·링크·출처 포함)
    // ---------------------------------------------------------------
    const guidance = panel && panel.kind === 'guidance' ? panel : null;
    // 입력값은 패널이 지금 위치의 결과일 때만 담음 (다른 곳을 눌러 진단 중이면 이전 입력을 섞지 않음)
    const shareInputs = guidance && guidance.location === shareLocation
        ? { values: inputs, parcelArea: guidance.data.parcel.area }
        : null;
    const shareUrl = buildShareUrl(shareLocation, shareInputs);

    // 주소창을 지금 결과의 링크로 바꿈 (뒤로 가기 기록은 남기지 않음)
    useEffect(() => {
        if (shareUrl !== window.location.href) history.replaceState(null, '', shareUrl);
    }, [shareUrl]);

    // 인쇄 직전: 펼쳐보기를 모두 펼치고, 인쇄 뒤에 원래대로
    useEffect(() => {
        let saved: [HTMLDetailsElement, boolean][] = [];
        const before = () => {
            if (!panelElement.current) return;
            saved = [...panelElement.current.querySelectorAll('details')].map(element => [element, element.open]);
            saved.forEach(([element]) => { element.open = true; });
        };
        const after = () => {
            saved.forEach(([element, open]) => { element.open = open; });
            saved = [];
        };
        window.addEventListener('beforeprint', before);
        window.addEventListener('afterprint', after);
        return () => {
            window.removeEventListener('beforeprint', before);
            window.removeEventListener('afterprint', after);
        };
    }, []);

    let panelContent: ReactNode = null;
    if (panel?.kind === 'message') {
        panelContent = <><h3>도면으로 사업부지 진단</h3><p>{panel.text}</p></>;
    } else if (panel?.kind === 'siteSetup') {
        const draft = panel.draft;
        panelContent = (
            <SiteSetup
                draft={draft}
                onLayerChange={index => showSiteSetup({ ...draft, layerIndex: index })}
                onCrsChange={code => {
                    updateDraft({ ...draft, crs: code });
                    previewSite(draft.layers[draft.layerIndex], code);
                }}
                onRun={runSite}
            />
        );
    } else if (guidance) {
        panelContent = (
            <>
                <div className="print-only">
                    <div className="print-title">땅파기전 · 문화유산 사전 확인 결과</div>
                    <div>진단 일시: {guidance.diagnosedAt.toLocaleString('ko-KR')}</div>
                    {shareLocation && <div className="print-link">다시 보기: {shareUrl}</div>}
                    <div>공공데이터는 바뀔 수 있어서, 같은 위치도 나중에 다시 진단하면 결과가 달라질 수 있어요.</div>
                </div>
                <GuidancePanel
                    key={guidance.id}
                    data={guidance.data}
                    options={guidance.options}
                    inputs={inputs}
                    onInputsChange={setInputs}
                    shareUrl={guidance.options.shareable !== false && guidance.location ? shareUrl : null}
                    departments={departments}
                    siteTable={guidance.options.siteTable && siteResponse
                        ? <SiteTable data={siteResponse} onSelect={index => showSiteParcel(siteResponse, index)} />
                        : null}
                    onBack={() => siteResponse && showSitePanel(siteResponse)}
                />
            </>
        );
    }

    return (
        <>
            <div id="map" ref={mapElement} />
            <SearchBox onGo={goToResult} onDxfFile={handleDxfFile} />
            {/* 진단 결과 패널: 필지를 누르면 해야 할 일과 비용 안내 표시 */}
            <section id="result-panel" ref={panelElement} hidden={!panel}>{panelContent}</section>
            <p id="data-source">
                출처: 국가유산청 국가유산 공간정보서비스(문화유적분포지도, 국가유산조사구역), 국토교통부 브이월드(국가유산 지정/보호구역, 지적도), OpenStreetMap
            </p>
        </>
    );
}
