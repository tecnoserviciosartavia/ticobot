import ApplicationLogo from '@/Components/ApplicationLogo';
import Dropdown from '@/Components/Dropdown';
import NavLink from '@/Components/NavLink';
import PwaInstallPrompt from '@/Components/PwaInstallPrompt';
import ResponsiveNavLink from '@/Components/ResponsiveNavLink';
import ThemeToggle from '@/Components/ThemeToggle';
import { FileText, Home, Menu, MessageSquare, Users, X } from '@/Components/icons';
import { registerPushDeviceForApp } from '@/mobile/registerPushDevice';
import { Link, usePage } from '@inertiajs/react';
import { PropsWithChildren, ReactNode, useEffect, useState } from 'react';

export default function Authenticated({
    header,
    children,
}: PropsWithChildren<{ header?: ReactNode }>) {
    const page = usePage();
    const user = page.props.auth.user;
    const webPushPublicKey = (page.props as any)?.push?.web_public_key ?? null;
    const isAdmin = !user.profile_type || user.profile_type === 'admin';

    const [showingNavigationDropdown, setShowingNavigationDropdown] =
        useState(false);
    const [pushBanner, setPushBanner] = useState<{ title: string; body: string; url: string; phone: string } | null>(null);

    useEffect(() => {
        const handler = (event: Event) => {
            const detail = (event as CustomEvent<{ title: string; body: string; url: string; phone: string }>).detail;
            if (!detail) {
                return;
            }

            setPushBanner(detail);
            window.clearTimeout((window as Window & { __ticobotPushTimer?: number }).__ticobotPushTimer);
            (window as Window & { __ticobotPushTimer?: number }).__ticobotPushTimer = window.setTimeout(() => {
                setPushBanner(null);
            }, 7000);
        };

        window.addEventListener('ticobot-push-received', handler);
        return () => window.removeEventListener('ticobot-push-received', handler);
    }, []);

    useEffect(() => {
        void registerPushDeviceForApp({ webPublicKey: webPushPublicKey });
    }, [webPushPublicKey]);

    return (
        <div className="min-h-screen bg-gray-100 dark:bg-gray-900 dark:text-gray-100">
            {pushBanner && (
                <div className="fixed right-4 top-4 z-50 w-[min(92vw,26rem)] rounded-2xl border border-emerald-200 bg-white/95 p-4 shadow-2xl backdrop-blur dark:border-emerald-900 dark:bg-gray-900/95">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-600 dark:text-emerald-400">
                        Nuevo mensaje
                    </div>
                    <div className="mt-1 text-sm font-semibold text-gray-900 dark:text-gray-50">
                        {pushBanner.title}
                    </div>
                    <div className="mt-1 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                        {pushBanner.body || 'Tocá para abrir el chat.'}
                    </div>
                    {pushBanner.url && (
                        <button
                            type="button"
                            onClick={() => {
                                window.location.assign(pushBanner.url);
                                setPushBanner(null);
                            }}
                            className="mt-3 inline-flex items-center rounded-full bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                        >
                            Abrir chat
                        </button>
                    )}
                </div>
            )}
            <nav className="sticky top-0 z-40 border-b border-gray-100 bg-white/95 backdrop-blur dark:border-gray-700 dark:bg-gray-800/95">
                <div className="w-full px-4 sm:px-6 lg:px-8">
                    <div className="flex h-16 justify-between">
                        <div className="flex">
                            <div className="flex shrink-0 items-center">
                                <Link href={route('dashboard')}>
                                    <ApplicationLogo className="block h-9 w-auto fill-current text-gray-800 dark:text-gray-200" />
                                </Link>
                            </div>

                            <div className="hidden space-x-8 sm:-my-px sm:ms-10 sm:flex">
                                {isAdmin && (
                                    <NavLink
                                        href={route('dashboard')}
                                        active={route().current('dashboard')}
                                    >
                                        Dashboard
                                    </NavLink>
                                )}
                                <NavLink
                                    href={route('clients.index')}
                                    active={route().current('clients.*')}
                                >
                                    Clientes
                                </NavLink>
                                <NavLink
                                    href={route('contracts.index')}
                                    active={route().current('contracts.*')}
                                >
                                    Contratos
                                </NavLink>
                                {isAdmin && (
                                    <NavLink
                                        href={route('reminders.index')}
                                        active={route().current('reminders.*')}
                                    >
                                        Recordatorios
                                    </NavLink>
                                )}
                                <NavLink
                                    href={route('chats.index')}
                                    active={route().current('chats.*')}
                                >
                                    Chats
                                </NavLink>
                                {isAdmin && (
                                    <NavLink
                                        href={route('finance.index')}
                                        active={
                                            route().current('finance.*') ||
                                            route().current('accounting.*') ||
                                            route().current('payments.*') ||
                                            route().current('collections.*') ||
                                            route().current('sinpe-emails.*') ||
                                            route().current('conciliations.*')
                                        }
                                    >
                                        Contabilidad
                                    </NavLink>
                                )}
                                {isAdmin && (
                                    <NavLink
                                        href={route('users.index')}
                                        active={route().current('users.*')}
                                    >
                                        Usuarios
                                    </NavLink>
                                )}
                            </div>
                        </div>

                        <div className="hidden sm:ms-6 sm:flex sm:items-center">
                            <ThemeToggle />
                            <div className="relative ms-3">
                                <Dropdown>
                                    <Dropdown.Trigger>
                                        <span className="inline-flex rounded-md">
                                            <button
                                                type="button"
                                                className="inline-flex items-center rounded-md border border-transparent bg-white dark:bg-gray-800 px-3 py-2 text-sm font-medium leading-4 text-gray-500 dark:text-gray-300 transition duration-150 ease-in-out hover:text-gray-700 dark:hover:text-gray-100 focus:outline-none"
                                            >
                                            {user.name}

                                            <svg
                                                className="-me-0.5 ms-2 h-4 w-4"
                                                xmlns="http://www.w3.org/2000/svg"
                                                viewBox="0 0 20 20"
                                                fill="currentColor"
                                            >
                                                <path
                                                    fillRule="evenodd"
                                                    d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
                                                    clipRule="evenodd"
                                                />
                                            </svg>
                                        </button>
                                        </span>
                                    </Dropdown.Trigger>

                                    <Dropdown.Content>
                                        <Dropdown.Link
                                            href={route('profile.edit')}
                                        >
                                            Perfil
                                        </Dropdown.Link>
                                        {isAdmin && (
                                            <Dropdown.Link href={route('settings.index')}>
                                                Configuración
                                            </Dropdown.Link>
                                        )}
                                        <Dropdown.Link
                                            href={route('logout')}
                                            method="post"
                                            as="button"
                                        >
                                            Log Out
                                        </Dropdown.Link>
                                    </Dropdown.Content>
                                </Dropdown>
                            </div>
                        </div>

                        <div className="flex flex-1 items-center justify-between sm:hidden">
                            <div className="ml-3 min-w-0">
                                <p className="truncate text-base font-bold text-gray-900 dark:text-white">TicoBot</p>
                                <p className="truncate text-[11px] font-medium text-gray-500 dark:text-gray-400">Gestión de cobros</p>
                            </div>
                            <button
                                onClick={() =>
                                    setShowingNavigationDropdown(
                                        (previousState) => !previousState,
                                    )
                                }
                                aria-label={showingNavigationDropdown ? 'Cerrar menú' : 'Abrir menú'}
                                className="inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-600 transition active:bg-gray-200 dark:text-gray-200 dark:active:bg-gray-700"
                            >
                                {showingNavigationDropdown ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
                            </button>
                        </div>
                    </div>
                </div>

                <div
                    className={
                        (showingNavigationDropdown ? 'block' : 'hidden') +
                        ' fixed inset-x-0 top-16 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40 overflow-y-auto border-t border-gray-100 bg-white shadow-2xl sm:hidden dark:border-gray-700 dark:bg-gray-800'
                    }
                >
                    <div className="space-y-1 pb-3 pt-2">
                        {isAdmin && (
                            <ResponsiveNavLink
                                href={route('dashboard')}
                                active={route().current('dashboard')}
                            >
                                Dashboard
                            </ResponsiveNavLink>
                        )}
                        <ResponsiveNavLink
                            href={route('clients.index')}
                            active={route().current('clients.*')}
                        >
                            Clientes
                        </ResponsiveNavLink>
                        <ResponsiveNavLink
                            href={route('contracts.index')}
                            active={route().current('contracts.*')}
                        >
                            Contratos
                        </ResponsiveNavLink>
                        {isAdmin && (
                            <ResponsiveNavLink
                                href={route('reminders.index')}
                                active={route().current('reminders.*')}
                            >
                                Recordatorios
                            </ResponsiveNavLink>
                        )}
                        <ResponsiveNavLink
                            href={route('chats.index')}
                            active={route().current('chats.*')}
                        >
                            Chats
                        </ResponsiveNavLink>
                        {isAdmin && (
                            <ResponsiveNavLink
                                href={route('finance.index')}
                                active={
                                    route().current('finance.*') ||
                                    route().current('accounting.*') ||
                                    route().current('payments.*') ||
                                    route().current('collections.*') ||
                                    route().current('sinpe-emails.*') ||
                                    route().current('conciliations.*')
                                }
                            >
                                Contabilidad
                            </ResponsiveNavLink>
                        )}
                        {isAdmin && (
                            <ResponsiveNavLink
                                href={route('users.index')}
                                active={route().current('users.*')}
                            >
                                Usuarios
                            </ResponsiveNavLink>
                        )}
                    </div>

                    <div className="border-t border-gray-200 pb-1 pt-4 dark:border-gray-700 dark:bg-gray-800">
                        <div className="px-4">
                            <div className="text-base font-medium text-gray-800 dark:text-gray-100">
                                {user.name}
                            </div>
                            <div className="text-sm font-medium text-gray-500 dark:text-gray-400">
                                {user.email}
                            </div>
                        </div>

                        <div className="mt-3 space-y-1">
                            <ResponsiveNavLink href={route('profile.edit')}>
                                Perfil
                            </ResponsiveNavLink>
                            {isAdmin && (
                                <ResponsiveNavLink
                                    href={route('settings.index')}
                                    active={route().current('settings.*')}
                                >
                                    Configuración
                                </ResponsiveNavLink>
                            )}
                            <ResponsiveNavLink
                                method="post"
                                href={route('logout')}
                                as="button"
                            >
                                Log Out
                            </ResponsiveNavLink>
                        </div>
                    </div>
                </div>
            </nav>

            {header && (
                <header className="bg-white shadow dark:bg-gray-800">
                    <div className="w-full px-4 py-6 sm:px-6 lg:px-8">
                        {header}
                    </div>
                </header>
            )}

            <main className="pb-[calc(5.5rem+env(safe-area-inset-bottom))] sm:pb-0">{children}</main>

            <nav aria-label="Navegación principal" className="fixed inset-x-0 bottom-0 z-50 border-t border-gray-200 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_30px_rgba(15,23,42,0.08)] backdrop-blur sm:hidden dark:border-gray-700 dark:bg-gray-900/95">
                <div className="grid h-[4.5rem] grid-cols-5">
                    {[
                        { label: 'Inicio', href: isAdmin ? route('dashboard') : route('clients.index'), active: isAdmin ? route().current('dashboard') : route().current('clients.*'), Icon: Home },
                        { label: 'Clientes', href: route('clients.index'), active: route().current('clients.*'), Icon: Users },
                        { label: 'Contratos', href: route('contracts.index'), active: route().current('contracts.*'), Icon: FileText },
                        { label: 'Chats', href: route('chats.index'), active: route().current('chats.*'), Icon: MessageSquare },
                    ].map(({ label, href, active, Icon }) => (
                        <Link key={label} href={href} onClick={() => setShowingNavigationDropdown(false)} className={`flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition active:bg-emerald-50 dark:active:bg-emerald-950/30 ${active ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
                            <span className={`rounded-full px-4 py-1 ${active ? 'bg-emerald-100 dark:bg-emerald-900/50' : ''}`}><Icon className="h-5 w-5" /></span>
                            <span className="truncate">{label}</span>
                        </Link>
                    ))}
                    <button type="button" onClick={() => setShowingNavigationDropdown((open) => !open)} className={`flex min-w-0 flex-col items-center justify-center gap-1 px-1 text-[11px] font-semibold transition active:bg-emerald-50 dark:active:bg-emerald-950/30 ${showingNavigationDropdown ? 'text-emerald-700 dark:text-emerald-400' : 'text-gray-500 dark:text-gray-400'}`}>
                        <span className={`rounded-full px-4 py-1 ${showingNavigationDropdown ? 'bg-emerald-100 dark:bg-emerald-900/50' : ''}`}><Menu className="h-5 w-5" /></span>
                        <span>Más</span>
                    </button>
                </div>
            </nav>
            <PwaInstallPrompt />
        </div>
    );
}
