import { Calendar } from '@/Components/icons';
import { InputHTMLAttributes, useRef } from 'react';

type DatePickerInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {
    type?: 'date' | 'datetime-local';
};

export default function DatePickerInput({
    type = 'date',
    className = '',
    ...props
}: DatePickerInputProps) {
    const inputRef = useRef<HTMLInputElement>(null);

    const openCalendar = () => {
        const input = inputRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
        if (!input) return;

        try {
            input.showPicker?.();
        } catch {
            input.focus();
        }
    };

    return (
        <div className={`relative ${className}`}>
            <input
                {...props}
                ref={inputRef}
                type={type}
                className="block w-full rounded-md border-slate-300 bg-white pr-11 text-slate-900 shadow-sm focus:border-cyan-500 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100 dark:[color-scheme:dark] dark:focus:border-cyan-500 dark:focus:ring-cyan-500"
            />
            <button
                type="button"
                onClick={openCalendar}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-slate-500 hover:bg-cyan-50 hover:text-cyan-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-cyan-300"
                aria-label="Abrir calendario"
                title="Abrir calendario"
            >
                <Calendar className="h-5 w-5" />
            </button>
        </div>
    );
}
