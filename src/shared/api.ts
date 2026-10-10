// 서버(/api) 요청

// JSON 응답을 받음. 실패 응답이면 오류
export async function getJson<T>(url: string): Promise<T> {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`${url} 응답 오류 (${response.status})`);
    return response.json();
}

// 경위도 지점마다 그 자리의 필지 주소 (지적도에 없는 곳이면 null). 좌표계 후보를 고를 때 씀
export async function fetchAddresses(centers: [number, number][]): Promise<(string | null)[]> {
    if (centers.length === 0) return [];
    const points = centers.map(center => center.join(',')).join('|');
    const response = await fetch(`/api/site?points=${encodeURIComponent(points)}`);
    return response.ok ? (await response.json()).addresses : [];
}

// 대한민국 범위 안의 경위도인지
export function inKorea(lng: number, lat: number): boolean {
    return Number.isFinite(lng) && Number.isFinite(lat) && lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}
