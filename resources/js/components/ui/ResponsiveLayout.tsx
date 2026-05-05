import React, { useState, useEffect } from 'react';
import { Head, router } from '@inertiajs/react';
import { Button } from './button';
import { Card } from './card';
import { Badge } from './badge';
import { 
  Menu, 
  X, 
  Bell, 
  Search, 
  Settings, 
  Home,
  Users,
  FileText,
  CreditCard,
  MessageSquare,
  BarChart3,
  ChevronDown
} from './icons';

interface ResponsiveLayoutProps {
  children: React.ReactNode;
  title?: string;
  user?: any;
}

export default function ResponsiveLayout({ children, title, user }: ResponsiveLayoutProps) {
  console.log('ResponsiveLayout rendering, title:', title);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [notifications, setNotifications] = useState(3);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<any>(null);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
      if (window.innerWidth >= 768) {
        setSidebarOpen(false);
      }
    };

    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

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

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: Home, current: false },
    { name: 'Clientes', href: '/clients', icon: Users, current: false },
    { name: 'Contratos', href: '/contracts', icon: FileText, current: false },
    { name: 'Pagos', href: '/payments', icon: CreditCard, current: false },
    { name: 'Recordatorios', href: '/reminders', icon: MessageSquare, current: false },
    { name: 'Reportes', href: '/reports', icon: BarChart3, current: false },
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
        fixed inset-y-0 left-0 z-50 w-64 bg-white shadow-lg transform transition-transform duration-300 ease-in-out lg:hidden
        ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
      `}>
        <div className="flex items-center justify-between h-16 px-4 border-b">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">TB</span>
            </div>
            <span className="ml-2 text-xl font-semibold text-gray-900">TicoBOT</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(false)}
          >
            <X className="w-5 h-5" />
          </Button>
        </div>
        
        <nav className="mt-6 px-3">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.name}
                href={item.href}
                className={`
                  flex items-center px-3 py-2 rounded-lg text-sm font-medium transition-colors
                  ${item.current 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
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
    <header className="bg-white border-b border-gray-200">
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
                type="text"
                placeholder="Buscar clientes, contratos, pagos..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                value={searchQuery}
                onChange={(e) => {
                  console.log('Input changed:', e.target.value);
                  setSearchQuery(e.target.value);
                  handleSearch(e.target.value);
                }}
                onFocus={() => searchResults && setShowSearchResults(true)}
              />
              {/* Test: Show typed text */}
              {searchQuery && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-yellow-100 p-2 text-xs text-gray-700 z-50">
                  Escribiendo: "{searchQuery}"
                </div>
              )}
              
              {/* Search Results Dropdown */}
              {showSearchResults && searchResults && (
                <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-gray-200 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                  {searchLoading ? (
                    <div className="p-4 text-center text-gray-500">
                      Buscando...
                    </div>
                  ) : (
                    <>
                      {/* Clientes */}
                      {searchResults.clients && searchResults.clients.length > 0 && (
                        <div className="border-b border-gray-200">
                          <div className="px-4 py-2 bg-gray-50 font-semibold text-sm text-gray-700">
                            Clientes ({searchResults.clients.length})
                          </div>
                          {searchResults.clients.slice(0, 5).map((client: any) => (
                            <div
                              key={client.id}
                              onClick={() => handleResultClick('clients', client.id)}
                              className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center justify-between"
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
                          <div className="px-4 py-2 bg-gray-50 font-semibold text-sm text-gray-700">
                            Contratos ({searchResults.contracts.length})
                          </div>
                          {searchResults.contracts.slice(0, 5).map((contract: any) => (
                            <div
                              key={contract.id}
                              onClick={() => handleResultClick('contracts', contract.id)}
                              className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center justify-between"
                            >
                              <div>
                                <div className="font-medium text-gray-900">{contract.contract_number}</div>
                                <div className="text-sm text-gray-500">
                                  {contract.client?.name || 'Sin cliente'}
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
                          <div className="px-4 py-2 bg-gray-50 font-semibold text-sm text-gray-700">
                            Pagos ({searchResults.payments.length})
                          </div>
                          {searchResults.payments.slice(0, 5).map((payment: any) => (
                            <div
                              key={payment.id}
                              onClick={() => handleResultClick('payments', payment.id)}
                              className="px-4 py-2 hover:bg-gray-100 cursor-pointer flex items-center justify-between"
                            >
                              <div>
                                <div className="font-medium text-gray-900">{payment.payment_number}</div>
                                <div className="text-sm text-gray-500">
                                  ${payment.amount} - {payment.contract?.client?.name || 'Sin cliente'}
                                </div>
                              </div>
                              <ChevronDown className="w-4 h-4 text-gray-400 rotate-[-90deg]" />
                            </div>
                          ))}
                        </div>
                      )}
                      
                      {/* Servicios */}
                      
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
            {/* Notifications */}
            <div className="relative">
              <Button variant="ghost" size="icon">
                <Bell className="w-5 h-5" />
                {notifications > 0 && (
                  <span className="absolute -top-1 -right-1 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                    {notifications}
                  </span>
                )}
              </Button>
            </div>

            {/* User menu */}
            <div className="flex items-center space-x-3">
              <div className="hidden sm:block text-right">
                <p className="text-sm font-medium text-gray-900">{user?.name}</p>
                <p className="text-xs text-gray-500">Administrador</p>
              </div>
              <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
                <span className="text-white text-sm font-medium">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </header>
  );

  const Sidebar = () => (
    <aside className="hidden md:flex md:w-64 md:flex-col md:fixed md:inset-y-0">
      <div className="flex flex-col flex-grow bg-white border-r border-gray-200">
        {/* Logo */}
        <div className="flex items-center h-16 px-4 border-b">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">TB</span>
          </div>
          <span className="ml-2 text-xl font-semibold text-gray-900">TicoBOT</span>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-6 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <a
                key={item.name}
                href={item.href}
                className={`
                  group flex items-center px-3 py-2 text-sm font-medium rounded-lg transition-colors
                  ${item.current 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'text-gray-700 hover:bg-gray-100'
                  }
                `}
              >
                <Icon className="w-5 h-5 mr-3" />
                {item.name}
              </a>
            );
          })}
        </nav>

        {/* User section */}
        <div className="border-t border-gray-200 p-3">
          <div className="flex items-center space-x-3">
            <div className="h-8 w-8 bg-blue-600 rounded-full flex items-center justify-center">
              <span className="text-white text-sm font-medium">
                {user?.name?.charAt(0)?.toUpperCase() || 'U'}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.name}
              </p>
              <p className="text-xs text-gray-500 truncate">
                Administrador
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

  const MobileSearch = () => (
    <div className="md:hidden px-4 py-3 border-b border-gray-200">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          type="text"
          placeholder="Buscar..."
          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <Head title={title || 'TicoBOT'} />
      
      <MobileMenu />
      
      <div className="flex h-screen bg-gray-50">
        <Sidebar />
        
        <div className="flex-1 flex flex-col overflow-hidden md:ml-64">
          <Header />
          <MobileSearch />
          
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
