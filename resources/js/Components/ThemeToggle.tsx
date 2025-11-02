import { useEffect, useState } from 'react';

export default function ThemeToggle() {
    const [theme, setTheme] = useState<'light' | 'dark'>(() => {
        if (typeof window === 'undefined') return 'light';
        const saved = localStorage.getItem('theme');
        if (saved === 'dark' || (!saved && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            return 'dark';
        }
        return 'light';
    });

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
            localStorage.setItem('theme', 'dark');
        } else {
            root.classList.remove('dark');
            localStorage.setItem('theme', 'light');
        }
    }, [theme]);

    useEffect(() => {
        const onSystemChange = (e: MediaQueryListEvent) => {
            // If user hasn't explicitly set a theme, follow system preference
            const saved = localStorage.getItem('theme');
            if (!saved) {
                setTheme(e.matches ? 'dark' : 'light');
            }
        };

        const mq = window.matchMedia('(prefers-color-scheme: dark)');
        if (mq.addEventListener) mq.addEventListener('change', onSystemChange);
        else mq.addListener(onSystemChange);

        return () => {
            if (mq.removeEventListener) mq.removeEventListener('change', onSystemChange);
            else mq.removeListener(onSystemChange);
        };
    }, []);

    return (
        <button
            type="button"
            aria-label="Toggle theme"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
            className="inline-flex items-center rounded-md border border-transparent bg-white px-3 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600"
        >
            {theme === 'dark' ? (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M17.293 13.293A8 8 0 116.707 2.707a7 7 0 0010.586 10.586z" />
                </svg>
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4.22 2.03a1 1 0 011.415 0l.708.707a1 1 0 11-1.414 1.415l-.709-.707a1 1 0 010-1.415zM18 9a1 1 0 110 2h-1a1 1 0 110-2h1zM14.22 15.97a1 1 0 010 1.415l-.707.707a1 1 0 11-1.415-1.414l.707-.708a1 1 0 011.415 0zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.78 15.97a1 1 0 011.415 0l.707.707a1 1 0 11-1.414 1.415l-.708-.707a1 1 0 010-1.415zM4 9a1 1 0 110 2H3a1 1 0 110-2h1zM5.78 4.03a1 1 0 010 1.415L5.07 6.15A1 1 0 113.657 4.736l.708-.707a1 1 0 011.415 0z" />
                </svg>
            )}
        </button>
    );
}
