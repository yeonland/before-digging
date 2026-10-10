// 도면 기능(dxf-parser, proj4)은 쓸 때만 불러옴. 실패하면 다음에 다시 시도
let dxfSite: Promise<typeof import('./dxf-site.js')> | null = null;

export function loadDxfSite() {
    if (!dxfSite) {
        dxfSite = import('./dxf-site.js');
        dxfSite.catch(() => { dxfSite = null; });
    }
    return dxfSite;
}
