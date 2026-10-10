// 검색창 좌표 입력 읽기

// 좌표 입력: "198342.5, 451230.1", "X=451230 Y=198342", "37.5786 126.977" 같은 숫자 두 개
// ("815-1" 같은 번지는 숫자 하나로 보고 좌표로 다루지 않음)
export function parseCoordinates(keyword: string): [number, number] | null {
    const tokens = keyword.replace(/[XYxy]\s*[=:]?|[()]/g, ' ').trim().split(/[\s,]+/);
    return tokens.length === 2 && tokens.every(token => /^-?\d+(?:\.\d+)?$/.test(token))
        ? [Number(tokens[0]), Number(tokens[1])]
        : null;
}
