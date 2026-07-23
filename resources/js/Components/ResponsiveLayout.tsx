import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Head, Link, router, usePage } from '@inertiajs/react';
import { Button } from './button';
import { Card } from './card';
import { Badge } from './badge';
import PwaInstallPrompt from './PwaInstallPrompt';
import ThemeToggle from './ThemeToggle';
import { 
  Menu, 
  X, 
  Bell, 
  Search, 
  Settings, 
  Home,
  Users,
  FileText,
  MessageSquare,
  BarChart3,
  PieChart,
  ChevronDown,
} from './icons';

interface ResponsiveLayoutProps {
  children: React.ReactNode;
  title?: string;
  user?: any;
  /** 'full' uses the whole main column (better for wide tables). Default mirrors max-w-7xl */
  contentWidth?: 'contained' | 'full';
}

export default function ResponsiveLayout({ children, title, user, contentWidth = 'contained' }: ResponsiveLayoutProps) {
  console.log('ResponsiveLayout rendering, title:', title);
  const page = usePage();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [profileMenuOpen, setProfileMenuOpen] = useState(false);
  const [settingsMenuOpen, setSettingsMenuOpen] = useState(false);
  const [sidebarProfileMenuOpen, setSidebarProfileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debug: Log user data and profile menu state - DISABLED TEMPORARILY TO FIX FOCUS ISSUE
  // if (typeof window !== 'undefined') {
  //   console.log('=== MENU DEBUG ===');
  //   console.log('User data:', user);
  //   console.log('Window location:', window.location.pathname);
  //   console.log('Full URL:', window.location.href);
  //   console.log('========================');
  //   
  //   // Continuous menu visibility enforcement
  //   const enforceMenuVisibility = () => {
  //     const menuItems = document.querySelectorAll('nav a');
  //     console.log('Found menu items:', menuItems.length);
  //     menuItems.forEach((item, index) => {
  //       const element = item as HTMLElement;
  //       element.style.display = 'flex';
  //       element.style.visibility = 'visible';
  //       element.style.opacity = '1';
  //       element.style.setProperty('display', 'flex', 'important');
  //       element.style.setProperty('visibility', 'visible', 'important');
  //       element.style.setProperty('opacity', '1', 'important');
  //       console.log(`Made menu item ${index} visible:`, element.textContent);
  //     });
  //   };
  //   
  //   // Execute immediately and then continuously
  //   setTimeout(enforceMenuVisibility, 100);
  //   setInterval(enforceMenuVisibility, 1000);
  //   
  //   // Also enforce on route changes
  //   const originalPushState = history.pushState;
  //   history.pushState = function(...args) {
  //     originalPushState.apply(this, args);
  //     setTimeout(enforceMenuVisibility, 200);
  //   };
  // }

  const handleSearch = async (query: string) => {
    console.log('Search triggered:', query);
    setSearchQuery(query);
    
    if (query.length < 2) {
      setSearchResults(null);
      setShowSearchResults(false);
      return;
    }

    setSearchLoading(true);
    try {
      const url = `/search?q=${encodeURIComponent(query)}`;
      console.log('Fetching from:', url);
      const response = await fetch(url);
      console.log('Response status:', response.status);
      const data = await response.json();
      console.log('Search results:', data);
      setSearchResults(data);
      setShowSearchResults(true);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults(null);
    } finally {
      setSearchLoading(false);
    }
  };

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length >= 2) {
        handleSearch(searchQuery);
      }
    }, 500); // Wait 500ms after user stops typing

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Maintain focus on search input when typing
  useEffect(() => {
    if (searchQuery && searchInputRef.current && document.activeElement !== searchInputRef.current) {
      searchInputRef.current.focus();
    }
  }, [searchQuery]);

  const handleResultClick = (type: string, id: number) => {
    setShowSearchResults(false);
    setSearchQuery('');
    setSearchResults(null);
    
    const routes: { [key: string]: string } = {
      clients: `/clients/${id}`,
      contracts: `/contracts/${id}`,
      payments: `/payments/${id}`,
    };
    
    router.visit(routes[type] || '/');
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setSidebarOpen(false);
      }
    };

    const handleClickOutside = (event: MouseEvent) => {
      if (profileMenuOpen) {
        setProfileMenuOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    window.addEventListener('click', handleClickOutside);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('click', handleClickOutside);
    };
  }, [profileMenuOpen]);

  const accountingRoutesActive = useMemo(() => {
    try {
      return Boolean(
        route().current('accounting.*') ||
          route().current('finance.*') ||
          route().current('conciliations.*') ||
          route().current('payments.*') ||
          route().current('collections.*') ||
          route().current('sinpe-emails.*'),
      );
    } catch {
      return false;
    }
  }, [page.url]);

  const currentUserForNav = user ?? (page.props as { auth?: { user?: { name?: string; profile_type?: string | null } } })?.auth?.user;
  const unreadChats = Number((page.props as { notifications?: { unread_chats?: number } }).notifications?.unread_chats ?? 0);
  const isAdminNav = !currentUserForNav?.profile_type || currentUserForNav.profile_type === 'admin';

  const AccountingNavBlock = ({ onNavigate }: { onNavigate?: () => void }) => (
      <a
        href={route('finance.index')}
        onClick={onNavigate}
        className={`flex w-full items-center rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
          accountingRoutesActive
            ? 'bg-cyan-50 text-cyan-800 dark:bg-slate-900 dark:text-cyan-300'
            : 'text-gray-700 hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-cyan-300'
        }`}
      >
        <BarChart3 className="mr-3 h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1 text-left">Contabilidad</span>
      </a>
  );

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home },
    { name: 'Clientes', href: '/clients', icon: Users },
    { name: 'Contratos', href: '/contracts', icon: FileText },
    { name: 'Recordatorios', href: '/reminders', icon: MessageSquare },
    { name: 'Chats', href: '/chats', icon: MessageSquare },
    { name: 'Usuarios', href: '/users', icon: Users },
    { name: 'Reportes', href: '/reports', icon: PieChart },
    { name: 'Configuración', href: '/settings', icon: Settings },
  ];

  const MobileMenu = () => (
    <div className="md:hidden">
      {/* Mobile menu overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Mobile sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg dark:bg-black dark:text-slate-100 transform transition-transform duration-300 ease-in-out lg:hidden
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between h-16 px-4 border-b">
          <div className="flex items-center">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-600">
              <span className="text-white font-bold text-sm">TB</span>
            </div>
            <span className="ml-2 text-xl font-semibold text-gray-900 dark:text-slate-100">TicoBOT</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <nav className="mt-6 px-3 space-y-1">
          {navigation.slice(0, 5).map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.name}
                href={item.href}
                className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-cyan-300"
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.name}
              </a>
            );
          })}
          <AccountingNavBlock onNavigate={() => setSidebarOpen(false)} />
          {navigation.slice(5).map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.name}
                href={item.href}
                className="flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-cyan-300"
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.name}
              </a>
            );
          })}
        </nav>
      </div>
    </div>
  );

  const Header = () => (
    <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-black">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Mobile menu button */}
          <div className="flex items-center md:hidden">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-5 h-5" />
            </Button>
          </div>

          {/* Search bar - hidden on mobile */}
          <div className="hidden md:flex flex-1 max-w-lg mx-4 relative">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                ref={searchInputRef}
                type="text"
                placeholder="Buscar clientes, contratos, pagos..."
                className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
                value={searchQuery}
                onChange={(e) => {
                  console.log('Input changed:', e.target.value);
                  setSearchQuery(e.target.value);
                }}
                onFocus={() => searchResults && setShowSearchResults(true)}
              />
              
              {/* Search Results Dropdown */}
              {showSearchResults && searchResults && (
                <div className="absolute top-full left-0 right-0 mt-2 rounded-lg border border-gray-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-950 z-50 max-h-96 overflow-y-auto">
                  {searchLoading ? (
                    <div className="p-4 text-center text-gray-500">
                      Buscando...
                    </div>
                  ) : (
                    <>
                      {/* Clientes */}
                      {searchResults.clients && searchResults.clients.length > 0 && (
                        <div className="border-b border-gray-200">
                          <div className="bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 dark:bg-slate-900 dark:text-slate-200">
                            Clientes ({searchResults.clients.length})
                          </div>
                          {searchResults.clients.slice(0, 5).map((client: any) => (
                            <div
                              key={client.id}
                              onClick={() => handleResultClick('clients', client.id)}
                              className="flex cursor-pointer items-center justify-between px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-900"
                            >
                              <div>
                                <div className="font-medium text-gray-900">{client.name}</div>
                                <div className="text-sm text-gray-500">{client.email}</div>
                              </div>
                              <ChevronDown className="w-4 h-4 text-gray-400 rotate-[-90deg]" />
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Contratos */}
                      {searchResults.contracts && searchResults.contracts.length > 0 && (
                        <div className="border-b border-gray-200">
                          <div className="bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 dark:bg-slate-900 dark:text-slate-200">
                            Contratos ({searchResults.contracts.length})
                          </div>
                          {searchResults.contracts.slice(0, 5).map((contract: any) => (
                            <div
                              key={contract.id}
                              onClick={() => handleResultClick('contracts', contract.id)}
                              className="flex cursor-pointer items-center justify-between px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-900"
                            >
                              <div>
                                <div className="font-medium text-gray-900">{contract.name}</div>
                                <div className="text-sm text-gray-500">
                                  ₡{contract.amount} - {contract.client?.name || 'Sin cliente'}
                                </div>
                              </div>
                              <ChevronDown className="w-4 h-4 text-gray-400 rotate-[-90deg]" />
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Pagos */}
                      {searchResults.payments && searchResults.payments.length > 0 && (
                        <div className="border-b border-gray-200">
                          <div className="bg-gray-50 px-4 py-2 text-sm font-semibold text-gray-700 dark:bg-slate-900 dark:text-slate-200">
                            Pagos ({searchResults.payments.length})
                          </div>
                          {searchResults.payments.slice(0, 5).map((payment: any) => (
                            <div
                              key={payment.id}
                              onClick={() => handleResultClick('payments', payment.id)}
                              className="flex cursor-pointer items-center justify-between px-4 py-2 hover:bg-gray-100 dark:hover:bg-slate-900"
                            >
                              <div>
                                <div className="font-medium text-gray-900">{payment.reference || 'Sin referencia'}</div>
                                <div className="text-sm text-gray-500">
                                  ₡{payment.amount} - {payment.contract?.client?.name || 'Sin cliente'}
                                </div>
                              </div>
                              <ChevronDown className="w-4 h-4 text-gray-400 rotate-[-90deg]" />
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* No results */}
                      {!searchResults.clients?.length && 
                       !searchResults.contracts?.length && 
                       !searchResults.payments?.length && (
                        <div className="p-4 text-center text-gray-500">
                          No se encontraron resultados
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right side items */}
          <div className="flex items-center space-x-4">
            <ThemeToggle />
            {/* Notifications */}
            <div className="relative">
              <Button variant="ghost" size="icon" onClick={() => router.visit('/chats')} title="Abrir chats pendientes">
                <Bell className="w-5 h-5" />
                {unreadChats > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {unreadChats > 99 ? '99+' : unreadChats}
                  </span>
                )}
              </Button>
            </div>

            {/* User menu */}
            <div className="flex items-center space-x-3">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-gray-900 dark:text-slate-100">{currentUserForNav?.name}</p>
                <p className="text-xs text-gray-500 dark:text-slate-400">{isAdminNav ? 'Administrador' : 'Usuario'}</p>
              </div>
              <div className="relative">
                <button
                  onClick={() => setProfileMenuOpen(!profileMenuOpen)}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-cyan-600 transition-colors hover:bg-cyan-500"
                >
                  <span className="text-white text-sm font-medium">
                    {currentUserForNav?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </button>

                {/* Header Profile Dropdown */}
                {profileMenuOpen && (
                  <div className="absolute right-0 top-full z-50 mt-2 min-w-48 rounded-lg border border-gray-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-950">
                    <Link
                      href="/profile"
                      className="flex items-center px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-900"
                      onClick={() => setProfileMenuOpen(false)}
                    >
                      <Users className="w-4 h-4 mr-2 text-gray-400" />
                      Perfil
                    </Link>
                    <hr className="my-1 border-gray-200" />
                    <Link
                      href="/logout"
                      method="post"
                      as="button"
                      className="flex w-full items-center px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-900"
                      onClick={() => setProfileMenuOpen(false)}
                    >
                      <X className="w-4 h-4 mr-2 text-gray-400" />
                      Cerrar sesión
                    </Link>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );

  const Sidebar = () => (
    <aside className="hidden md:flex w-64 flex-col fixed inset-y-0">
      <div className="flex flex-grow flex-col border-r border-gray-200 bg-white dark:border-slate-800 dark:bg-black">
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-cyan-600">
            <span className="text-white font-bold text-sm">TB</span>
          </div>
          <span className="ml-2 text-xl font-semibold text-gray-900 dark:text-slate-100">TicoBOT</span>
        </div>

        {/* Navigation - Always show all items */}
        <nav className="flex-1 px-3 py-6 space-y-1">
          <a href="/dashboard" className="group flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-cyan-300">
            <Home className="w-5 h-5 mr-3" />
            Dashboard
          </a>
          <a href="/clients" className="group flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-cyan-300">
            <Users className="w-5 h-5 mr-3" />
            Clientes
          </a>
          <a href="/contracts" className="group flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-cyan-300">
            <FileText className="w-5 h-5 mr-3" />
            Contratos
          </a>
          <a href="/reminders" className="group flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-cyan-300">
            <MessageSquare className="w-5 h-5 mr-3" />
            Recordatorios
          </a>
          <a href="/chats" className="group flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-cyan-300">
            <MessageSquare className="w-5 h-5 mr-3" />
            Chats
          </a>
          <AccountingNavBlock />
          <a href="/users" className="group flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-cyan-300">
            <Users className="w-5 h-5 mr-3" />
            Usuarios
          </a>
          <a href="/reports" className="group flex items-center rounded-lg px-3 py-2 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-cyan-300">
            <PieChart className="w-5 h-5 mr-3" />
            Reportes
          </a>
                  </nav>

        {/* User section */}
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">
                {currentUserForNav?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {currentUserForNav?.name || 'Usuario'}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {isAdminNav ? 'Administrador' : 'Usuario'}
              </p>
            </div>
            <div className="relative">
              <button
                onClick={() => {
                  console.log('Sidebar profile button clicked, current state:', sidebarProfileMenuOpen);
                  setSidebarProfileMenuOpen(!sidebarProfileMenuOpen);
                }}
                className="p-1 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <Settings className="w-4 h-4 text-gray-400" />
              </button>

              {/* Profile Dropdown Menu */}
              {sidebarProfileMenuOpen && (
                <div className="absolute bottom-full right-0 mb-2 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50 min-w-48">
                  <Link
                    href="/profile"
                    className="flex items-center px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-900"
                    onClick={() => setSidebarProfileMenuOpen(false)}
                  >
                    <Users className="w-4 h-4 mr-2 text-gray-400" />
                    Perfil
                  </Link>
                  <Link
                    href="/settings"
                    className="flex items-center px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-900"
                    onClick={() => setSidebarProfileMenuOpen(false)}
                  >
                    <Settings className="w-4 h-4 mr-2 text-gray-400" />
                    Configuración
                  </Link>
                  <hr className="my-1 border-gray-200" />
                  <Link
                    href="/logout"
                    method="post"
                    as="button"
                    className="flex w-full items-center px-3 py-2 text-sm text-gray-700 transition-colors hover:bg-gray-100 dark:text-slate-200 dark:hover:bg-slate-900"
                    onClick={() => setSidebarProfileMenuOpen(false)}
                  >
                    <X className="w-4 h-4 mr-2 text-gray-400" />
                    Salir
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </aside>
  );

  const MobileSearch = () => (
    <div className="border-b border-gray-200 px-4 py-3 dark:border-slate-800 dark:bg-black md:hidden">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar..."
          className="w-full rounded-lg border border-gray-300 bg-white py-2 pl-10 pr-4 text-gray-900 focus:border-transparent focus:ring-2 focus:ring-cyan-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
        />
      </div>
    </div>
  );

  return (
    <div className="h-full min-h-0 bg-gray-50 dark:bg-black dark:text-slate-100">
      <Head title={title || 'TicoBOT'} />
      
      <MobileMenu />
      
      <div className="flex h-full min-h-0 bg-gray-50 dark:bg-black">
        <Sidebar />
        
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden md:ml-64 ml-0">
          <Header />
          <MobileSearch />
          
          <main className="flex-1 overflow-y-auto dark:bg-slate-950">
            <div className="py-6">
              <div
                className={
                  contentWidth === 'full'
                    ? 'w-full max-w-none min-w-0 px-3 sm:px-4 lg:px-6'
                    : 'mx-auto max-w-7xl px-4 sm:px-6 lg:px-8'
                }
              >
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
      <PwaInstallPrompt />
    </div>
  );
}
