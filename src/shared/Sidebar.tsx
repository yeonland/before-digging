// 결과를 담는 곁 패널: PC는 지도 오른쪽 사이드바, 휴대폰은 아래에서 끌어올리는 시트
// 시트 높이: peek(제목만) / half(반쯤) / full(거의 전체). 손잡이를 끌거나 눌러서 바꿈
import { useRef, type PointerEvent, type ReactNode, type RefObject } from 'react';

export type SheetState = 'peek' | 'half' | 'full';

// 손을 뗀 높이에서 가장 가까운 상태로 맞춤 (CSS의 높이와 같은 값)
function sheetHeights(): Record<SheetState, number> {
    const height = window.innerHeight;
    return { peek: 148, half: height * 0.55, full: height - 72 };
}

const NEXT_ON_TAP: Record<SheetState, SheetState> = { peek: 'half', half: 'full', full: 'peek' };

export function Sidebar({ sheet, onSheetChange, scrollRef, children }: {
    sheet: SheetState;
    onSheetChange: (state: SheetState) => void;
    scrollRef: RefObject<HTMLElement | null>;
    children: ReactNode;
}) {
    const drag = useRef<{ startY: number; startHeight: number; moved: boolean } | null>(null);
    const justDragged = useRef(false); // 끌기를 마친 직후의 click은 무시

    function onPointerDown(event: PointerEvent<HTMLButtonElement>) {
        const element = scrollRef.current;
        if (!element) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        drag.current = { startY: event.clientY, startHeight: element.offsetHeight, moved: false };
        element.classList.add('is-dragging');
    }

    function onPointerMove(event: PointerEvent<HTMLButtonElement>) {
        const element = scrollRef.current;
        if (!drag.current || !element) return;
        const dy = drag.current.startY - event.clientY;
        if (Math.abs(dy) > 5) drag.current.moved = true;
        const heights = sheetHeights();
        const height = Math.min(heights.full, Math.max(heights.peek, drag.current.startHeight + dy));
        element.style.height = `${height}px`;
    }

    function onPointerUp() {
        const element = scrollRef.current;
        if (!drag.current || !element) return;
        const { moved } = drag.current;
        drag.current = null;
        element.classList.remove('is-dragging');
        justDragged.current = moved;
        if (!moved) return; // 그냥 누른 것은 click에서 처리 (키보드도 같이)

        const height = element.offsetHeight;
        const heights = sheetHeights();
        const nearest = (Object.keys(heights) as SheetState[])
            .reduce((best, state) => Math.abs(heights[state] - height) < Math.abs(heights[best] - height) ? state : best, 'peek' as SheetState);
        element.style.height = '';
        onSheetChange(nearest);
    }

    return (
        <aside className={`sidebar sheet-${sheet}`} ref={scrollRef}>
            <button
                type="button"
                className="sheet-handle"
                aria-label={sheet === 'full' ? '결과 접기' : '결과 더 보기'}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                onClick={() => {
                    if (justDragged.current) {
                        justDragged.current = false;
                        return;
                    }
                    onSheetChange(NEXT_ON_TAP[sheet]);
                }}
            >
                <span />
            </button>
            {children}
        </aside>
    );
}
