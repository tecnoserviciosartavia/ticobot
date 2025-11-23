import { InertiaLinkProps, Link } from '@inertiajs/react';

export default function ResponsiveNavLink({
    active = false,
    className = '',
    children,
    ...props
}: InertiaLinkProps & { active?: boolean }) {
    return (
        <Link
            {...props}
            className={`flex w-full items-start border-l-4 py-2 pe-4 ps-3 ${
                active
                    ? 'border-indigo-400 dark:border-indigo-500 bg-indigo-50 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 focus:border-indigo-700 dark:focus:border-indigo-400 focus:bg-indigo-100 dark:focus:bg-indigo-900/70 focus:text-indigo-800 dark:focus:text-indigo-200'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:border-gray-300 dark:border-gray-600 dark:hover:border-gray-600 hover:bg-gray-50 dark:bg-gray-700/50 dark:hover:bg-gray-700/50 hover:text-gray-800 dark:hover:text-gray-200 focus:border-gray-300 dark:border-gray-600 dark:focus:border-gray-600 focus:bg-gray-50 dark:bg-gray-700/50 dark:focus:bg-gray-700/50 focus:text-gray-800 dark:focus:text-gray-200'
            } text-base font-medium transition duration-150 ease-in-out focus:outline-none ${className}`}
        >
            {children}
        </Link>
    );
}
