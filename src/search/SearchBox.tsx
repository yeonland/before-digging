// 주소·장소·좌표 검색 (VWorld 검색 API, 좌표는 좌표계마다 위치를 계산해 고르게 함)
import { useRef, useState } from 'react';
import { parseCoordinates } from './coordinates';
import { loadDxfSite } from '../site/loadDxfSite';
import { fetchAddresses, getJson } from '../shared/api';
import type { SearchResult } from '../shared/types';

type ListState =
    | { kind: 'hidden' }
    | { kind: 'message'; text: string }
    | { kind: 'results'; results: SearchResult[]; heading?: string };

export function SearchBox({ onGo, onDxfFile }: {
    onGo: (result: SearchResult) => void;
    onDxfFile: (file: File) => void;
}) {
    const [keyword, setKeyword] = useState('');
    const [list, setList] = useState<ListState>({ kind: 'hidden' });
    const fileInput = useRef<HTMLInputElement>(null);
    const showMessage = (text: string) => setList({ kind: 'message', text });

    function go(result: SearchResult) {
        setList({ kind: 'hidden' });
        onGo(result);
    }

    // 좌표계마다 그 숫자가 어디인지 계산해 필지 주소와 함께 보여주고 고르게 함
    async function searchCoordinates([first, second]: [number, number]) {
        showMessage('좌표계별 위치를 확인하는 중...');
        const { pointCandidates } = await loadDxfSite();
        const candidates = pointCandidates(first, second);
        if (candidates.length === 0) {
            showMessage('어느 좌표계로 계산해도 우리나라 안이 아니에요. 숫자를 다시 확인해 주세요.');
            return;
        }

        const addresses = await fetchAddresses(candidates.map(item => item.center));
        const results = candidates
            .map((item, index) => ({
                label: addresses[index] || '지적도에 없는 곳 (바다 등)',
                sub: `${item.name} · EPSG:${item.code}${item.swapped ? ' · 앞뒤 숫자를 바꿔 계산' : ''}`,
                lng: item.center[0],
                lat: item.center[1],
                found: Boolean(addresses[index])
            }))
            // 필지가 있는(땅 위인) 후보가 있으면 그것만 보여줌
            .filter((result, _index, all) => result.found || !all.some(other => other.found));

        if (results.length === 1 && results[0].found) {
            go(results[0]);
            return;
        }
        setList({ kind: 'results', results, heading: '좌표계에 따라 위치가 달라져요. 맞는 곳을 골라 주세요.' });
    }

    async function search() {
        const text = keyword.trim();
        if (text.length < 2) {
            showMessage('주소나 장소 이름을 2글자 이상 입력해 주세요.');
            return;
        }

        const coordinates = parseCoordinates(text);
        if (coordinates) {
            searchCoordinates(coordinates).catch(error => {
                console.error('좌표 검색 오류:', error);
                showMessage('좌표 위치를 확인하지 못했어요. 잠시 후 다시 시도해 주세요.');
            });
            return;
        }

        showMessage('검색 중...');
        try {
            const { results } = await getJson<{ results: SearchResult[] }>(`/api/search?query=${encodeURIComponent(text)}`);
            if (results.length === 0) {
                showMessage('찾는 주소가 없어요. 지번(예: 경주시 인왕동 815-1)이나 도로명(예: 세종대로 110)으로 검색해 보세요.');
            } else if (results.length === 1) {
                go(results[0]);
            } else {
                setList({ kind: 'results', results });
            }
        } catch (error) {
            console.error('주소 검색 오류:', error);
            showMessage('주소 검색에 실패했어요. 잠시 후 다시 시도해 주세요.');
        }
    }

    return (
        <div id="search-box">
            <div className="search-row">
                <input
                    type="text"
                    id="address-input"
                    placeholder="지번, 도로명, 장소 또는 좌표 (예: 경주시 인왕동 815-1)"
                    value={keyword}
                    onChange={event => setKeyword(event.target.value)}
                    onKeyUp={event => { if (event.key === 'Enter') search(); }}
                />
                <button id="search-btn" onClick={search}>검색</button>
                <button id="dxf-btn" type="button" title="DXF 도면으로 사업부지 전체 진단" onClick={() => fileInput.current?.click()}>도면(DXF)</button>
                <input
                    id="dxf-input"
                    ref={fileInput}
                    type="file"
                    accept=".dxf"
                    onChange={event => {
                        const file = event.target.files?.[0];
                        event.target.value = ''; // 같은 파일을 다시 골라도 동작하도록
                        if (file) onDxfFile(file);
                    }}
                />
            </div>
            {/* 검색 결과가 여러 개일 때 고르는 목록 */}
            {list.kind !== 'hidden' && (
                <ul id="search-results">
                    {list.kind === 'message' && <li className="search-message">{list.text}</li>}
                    {list.kind === 'results' && (
                        <>
                            {list.heading && <li className="search-message">{list.heading}</li>}
                            {list.results.map((result, index) => (
                                <li key={index}>
                                    <button type="button" onClick={() => go(result)}>
                                        <b>{result.label}</b>{result.sub && <span>{result.sub}</span>}
                                    </button>
                                </li>
                            ))}
                        </>
                    )}
                </ul>
            )}
        </div>
    );
}
