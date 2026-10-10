// 기다리는 동안 보여주는 표시: 도는 원 + 지난 시간
import { useEffect, useState } from 'react';

export function Loading({ text, since }: { text: string; since: number }) {
    const [now, setNow] = useState(Date.now);

    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, []);

    const seconds = Math.floor((now - since) / 1000);
    return (
        <p className="loading" role="status">
            <span className="spinner" aria-hidden="true" />
            {text}
            {seconds >= 3 && <span className="loading-time"> {seconds}초</span>}
        </p>
    );
}
