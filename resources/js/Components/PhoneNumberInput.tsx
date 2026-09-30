import InputLabel from '@/Components/InputLabel';
import TextInput from '@/Components/TextInput';
import { useMemo, useState } from 'react';

const COUNTRY_CODES = [
    ['506', 'Costa Rica'], ['1', 'EE. UU. / Canadá'], ['52', 'México'],
    ['502', 'Guatemala'], ['503', 'El Salvador'], ['504', 'Honduras'],
    ['505', 'Nicaragua'], ['507', 'Panamá'], ['34', 'España'],
    ['57', 'Colombia'], ['58', 'Venezuela'], ['593', 'Ecuador'],
    ['51', 'Perú'], ['56', 'Chile'], ['54', 'Argentina'], ['55', 'Brasil'],
    ['598', 'Uruguay'], ['595', 'Paraguay'], ['591', 'Bolivia'],
    ['1809', 'Rep. Dominicana'],
] as const;

const digits = (value: string) => value.replace(/\D/g, '');

function splitPhone(value: string) {
    const normalized = digits(value).replace(/^00/, '');
    if (!normalized) return { code: '506', local: '' };
    if (normalized.length === 8) return { code: '506', local: normalized };
    const code = [...COUNTRY_CODES].map(([item]) => item).sort((a, b) => b.length - a.length).find((item) => normalized.startsWith(item));
    return code ? { code, local: normalized.slice(code.length) } : { code: 'custom', local: normalized };
}

export default function PhoneNumberInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
    const initial = useMemo(() => splitPhone(value), []);
    const [code, setCode] = useState(initial.code);
    const [customCode, setCustomCode] = useState('');
    const [local, setLocal] = useState(initial.local);
    const emit = (nextCode: string, nextLocal: string, nextCustom = customCode) => {
        const country = nextCode === 'custom' ? digits(nextCustom) : nextCode;
        onChange(country && nextLocal ? country + digits(nextLocal) : digits(nextLocal));
    };

    return <div>
        <InputLabel htmlFor="phone" value="Teléfono" />
        <div className="mt-1 flex gap-2">
            <select aria-label="Código de país" value={code} onChange={(event) => { const next = event.target.value; setCode(next); emit(next, local); }} className="w-48 rounded-md border-gray-300 bg-white shadow-sm focus:border-indigo-500 focus:ring-indigo-500 dark:border-gray-600 dark:bg-gray-700 dark:text-gray-100">
                {COUNTRY_CODES.map(([item, country]) => <option key={`${item}-${country}`} value={item}>+{item} {country}</option>)}
                <option value="custom">Otro código</option>
            </select>
            {code === 'custom' && <TextInput aria-label="Otro código de país" value={customCode} onChange={(event) => { const next = digits(event.target.value).slice(0, 4); setCustomCode(next); emit(code, local, next); }} className="w-24" placeholder="Código" />}
            <TextInput id="phone" name="phone_display" type="tel" inputMode="numeric" value={local} onChange={(event) => { const next = digits(event.target.value); setLocal(next); emit(code, next); }} className="min-w-0 flex-1" placeholder="Número de teléfono" />
        </div>
        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">Se guardará con el código internacional seleccionado.</p>
    </div>;
}
