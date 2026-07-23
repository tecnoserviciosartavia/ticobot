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
                className="block w-full rounded-md border-gray-300 bg-white pr-11 text-gray-900 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100 dark:focus:border-indigo-400 dark:focus:ring-indigo-400"
            />
            <button
                type="button"
                onClick={openCalendar}
                className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-gray-500 hover:bg-gray-100 hover:text-indigo-600 dark:text-gray-300 dark:hover:bg-gray-600"
                aria-label="Abrir calendario"
                title="Abrir calendario"
            >
                <Calendar className="h-5 w-5" />
            </button>
        </div>
    );
}
