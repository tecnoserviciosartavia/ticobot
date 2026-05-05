import React, { useState, useEffect } from 'react';
import { Head } from '@inertiajs/react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { 
  Menu, 
  X, 
  Bell, 
  Search, 
  Settings, 
  ChevronDown,
  LogOut,
  Home,
  Users,
  FileText,
  CreditCard,
  MessageSquare,
  BarChart3,
  HelpCircle,
  Shield
} from './ui/icons';

interface ModernNavigationProps {
  children: React.ReactNode;
  title?: string;
  user?: any;
  breadcrumbs?: Array<{ name: string; href?: string }>;
}

export default function ModernNavigation({ 
  children, 
  title, 
  user, 
  breadcrumbs = [] 
}: ModernNavigationProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [notifications, setNotifications] = useState(5);
  const [searchOpen, setSearchOpen] = useState(false);
  const [profileDropdownOpen, setProfileDropdownOpen] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 1024);
      if (window.innerWidth >= 1024) {
        setSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const navigation = [
    { 
      name: 'Dashboard', 
      href: '/dashboard', 
      icon: Home, 
      current: false,
      badge: null
    },
    { 
      name: 'Clientes', 
      href: '/clients', 
      icon: Users, 
      current: false,
      badge: null
    },
    { 
      name: 'Contratos', 
      href: '/contracts', 
      icon: FileText, 
      current: false,
      badge: '12'
    },
    { 
      name: 'Pagos', 
      href: '/payments', 
      icon: CreditCard, 
      current: false,
      badge: '3'
    },
    { 
      name: 'Recordatorios', 
      href: '/reminders', 
      icon: MessageSquare, 
      current: false,
      badge: null
    },
    { 
      name: 'Reportes', 
      href: '/reports', 
      icon: BarChart3, 
      current: false,
      badge: null
    },
  ];

  const secondaryNavigation = [
    { name: 'Configuración', href: '/settings', icon: Settings },
    { name: 'Ayuda', href: '/help', icon: HelpCircle },
    { name: 'Seguridad', href: '/security', icon: Shield },
  ];

  const MobileSidebar = () => (
    <>
      {/* Overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black bg-opacity-50 transition-opacity lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      
      {/* Sidebar */}
      <div className={`
        fixed inset-y-0 left-0 z-50 w-80 bg-white shadow-2xl transform transition-transform duration-300 ease-in-out lg:hidden
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between h-16 px-6 border-b border-gray-200">
          <div className="flex items-center">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
              <span className="text-white font-bold text-lg">TB</span>
            </div>
            <div className="ml-3">
              <h2 className="text-xl font-bold text-gray-900">TicoBOT</h2>
              <p className="text-xs text-gray-500">Sistema de Gestión</p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
          <div className="mb-6">
            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Principal
            </h3>
            <div className="mt-2 space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.name}
                    href={item.href}
                    className={`
                      group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200
                      ${item.current 
                        ? 'bg-blue-100 text-blue-700 shadow-sm' 
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }
                    `}
                  >
                    <div className={`
                      flex items-center justify-center w-8 h-8 rounded-lg mr-3
                      ${item.current 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
                      }
                    `}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="flex-1">{item.name}</span>
                    {item.badge && (
                      <Badge variant="default" className="bg-blue-100 text-blue-700 text-xs">
                        {item.badge}
                      </Badge>
                    )}
                  </a>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Secundario
            </h3>
            <div className="space-y-1">
              {secondaryNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.name}
                    href={item.href}
                    className="group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-all duration-200"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg mr-3 bg-gray-100 text-gray-600 group-hover:bg-gray-200">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span>{item.name}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </nav>

        {/* User Section */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white font-medium">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.name}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.email}
              </p>
            </div>
            <Button variant="ghost" size="icon">
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </>
  );

  const Header = () => (
    <header className="bg-white border-b border-gray-200 shadow-sm">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Left side */}
          <div className="flex items-center space-x-4">
            {/* Mobile menu button */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden"
            >
              <Menu className="w-5 h-5" />
            </Button>

            {/* Search */}
            <div className="hidden md:flex">
              <div className="relative">
                <div className={`
                  absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-all duration-200
                  ${searchOpen ? 'w-12' : 'w-10'}
                `}>
                  <Search className={`w-4 h-4 text-gray-400 transition-all duration-200 ${searchOpen ? 'w-5 h-5' : 'w-4 h-4'}`} />
                </div>
                <input
                  type="text"
                  placeholder="Buscar clientes, contratos, pagos..."
                  className={`
                    w-64 lg:w-80 pl-10 pr-4 py-2 border border-gray-300 rounded-xl text-sm
                    focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200
                    ${searchOpen ? 'w-80 lg:w-96 ring-2 ring-blue-500 border-transparent' : ''}
                  `}
                  onFocus={() => setSearchOpen(true)}
                  onBlur={() => setSearchOpen(false)}
                />
              </div>
            </div>
          </div>

          {/* Right side */}
          <div className="flex items-center space-x-4">
            {/* Notifications */}
            <div className="relative">
              <Button variant="ghost" size="icon" className="relative">
                <Bell className="w-5 h-5" />
                {notifications > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center animate-pulse">
                    {notifications}
                  </span>
                )}
              </Button>
            </div>

            {/* User dropdown */}
            <div className="relative">
              <Button
                variant="ghost"
                onClick={() => setProfileDropdownOpen(!profileDropdownOpen)}
                className="flex items-center space-x-2 px-3 py-2"
              >
                <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center">
                  <span className="text-white font-medium text-sm">
                    {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                  </span>
                </div>
                <ChevronDown className="w-4 h-4" />
              </Button>

              {profileDropdownOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-lg shadow-lg border border-gray-200 py-1 z-50">
                  <div className="px-4 py-2 border-b border-gray-100">
                    <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                    <p className="text-xs text-gray-500">{user?.email}</p>
                  </div>
                  <a href="/profile" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                    Perfil
                  </a>
                  <a href="/settings" className="block px-4 py-2 text-sm text-gray-700 hover:bg-gray-100">
                    Configuración
                  </a>
                  <div className="border-t border-gray-100 mt-1 pt-1">
                    <a href="/logout" className="block px-4 py-2 text-sm text-red-600 hover:bg-red-50">
                      Cerrar sesión
                    </a>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );

  const DesktopSidebar = () => (
    <aside className="hidden lg:flex lg:w-80 lg:flex-col lg:fixed lg:inset-y-0">
      <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
        {/* Logo */}
        <div className="flex items-center h-16 px-6 border-b border-gray-200">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg">
            <span className="text-white font-bold text-lg">TB</span>
          </div>
          <div className="ml-3">
            <h2 className="text-xl font-bold text-gray-900">TicoBOT</h2>
            <p className="text-xs text-gray-500">Sistema de Gestión</p>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-4 py-6 space-y-6 overflow-y-auto">
          <div>
            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Principal
            </h3>
            <div className="mt-3 space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.name}
                    href={item.href}
                    className={`
                      group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl transition-all duration-200
                      ${item.current 
                        ? 'bg-blue-100 text-blue-700 shadow-sm' 
                        : 'text-gray-700 hover:bg-gray-100 hover:text-gray-900'
                      }
                    `}
                  >
                    <div className={`
                      flex items-center justify-center w-8 h-8 rounded-lg mr-3 transition-all duration-200
                      ${item.current 
                        ? 'bg-blue-600 text-white' 
                        : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
                      }
                    `}>
                      <Icon className="w-4 h-4" />
                    </div>
                    <span className="flex-1">{item.name}</span>
                    {item.badge && (
                      <Badge variant="default" className="bg-blue-100 text-blue-700 text-xs">
                        {item.badge}
                      </Badge>
                    )}
                  </a>
                );
              })}
            </div>
          </div>

          <div>
            <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Secundario
            </h3>
            <div className="mt-3 space-y-1">
              {secondaryNavigation.map((item) => {
                const Icon = item.icon;
                return (
                  <a
                    key={item.name}
                    href={item.href}
                    className="group flex items-center px-3 py-2.5 text-sm font-medium rounded-xl text-gray-700 hover:bg-gray-100 hover:text-gray-900 transition-all duration-200"
                  >
                    <div className="flex items-center justify-center w-8 h-8 rounded-lg mr-3 bg-gray-100 text-gray-600 group-hover:bg-gray-200">
                      <Icon className="w-4 h-4" />
                    </div>
                    <span>{item.name}</span>
                  </a>
                );
              })}
            </div>
          </div>
        </nav>

        {/* User section */}
        <div className="border-t border-gray-200 p-4">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-500 to-purple-600 rounded-full flex items-center justify-center">
              <span className="text-white font-medium">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.name}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.email}
              </p>
            </div>
            <Button variant="ghost" size="icon">
              <Settings className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </aside>
  );

  const Breadcrumbs = () => {
    if (breadcrumbs.length === 0) return null;

    return (
      <nav className="px-4 sm:px-6 lg:px-8 py-3 bg-gray-50 border-b border-gray-200">
        <ol className="flex items-center space-x-2 text-sm">
          <li>
            <a href="/dashboard" className="text-gray-500 hover:text-gray-700">
              Inicio
            </a>
          </li>
          {breadcrumbs.map((crumb, index) => (
            <li key={index} className="flex items-center space-x-2">
              <span className="text-gray-400">/</span>
              {crumb.href ? (
                <a href={crumb.href} className="text-gray-500 hover:text-gray-700">
                  {crumb.name}
                </a>
              ) : (
                <span className="text-gray-900 font-medium">{crumb.name}</span>
              )}
            </li>
          ))}
        </ol>
      </nav>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Head title={title || 'TicoBOT'} />
      
      <MobileSidebar />
      
      <div className="flex h-screen bg-gray-50">
        <DesktopSidebar />
        
        <div className="flex-1 flex flex-col overflow-hidden lg:ml-80">
          <Header />
          <Breadcrumbs />
          
          <main className="flex-1 overflow-y-auto">
            <div className="py-6">
              <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                {children}
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}
