import React, { useState, useEffect, useRef } from 'react';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Button } from './ui/button';

interface AnimatedCardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
  slideIn?: boolean;
  fadeIn?: boolean;
  delay?: number;
  onClick?: () => void;
}

export default function AnimatedCard({ 
  children, 
  className = '', 
  hover = true, 
  slideIn = false, 
  fadeIn = true, 
  delay = 0,
  onClick 
}: AnimatedCardProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, delay);

    return () => clearTimeout(timer);
  }, [delay]);

  useEffect(() => {
    if (!slideIn || !cardRef.current) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(cardRef.current);

    return () => observer.disconnect();
  }, [slideIn]);

  const getAnimationClasses = () => {
    const classes = [];

    if (fadeIn) {
      classes.push('transition-opacity duration-500 ease-out');
      if (!isVisible) {
        classes.push('opacity-0');
      } else {
        classes.push('opacity-100');
      }
    }

    if (slideIn) {
      classes.push('transition-transform duration-700 ease-out');
      if (!isVisible) {
        classes.push('translate-y-8');
      } else {
        classes.push('translate-y-0');
      }
    }

    if (hover) {
      classes.push('transition-all duration-300 ease-out');
      if (isHovered) {
        classes.push('transform -translate-y-2 shadow-2xl scale-105');
      } else {
        classes.push('transform translate-y-0 shadow-lg scale-100');
      }
    }

    return classes.join(' ');
  };

  return (
    <Card
      ref={cardRef}
      className={`
        ${getAnimationClasses()}
        ${className}
        ${hover ? 'cursor-pointer' : ''}
      `}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={onClick}
    >
      {children}
    </Card>
  );
}

// Specialized animated components
export function AnimatedStatCard({ 
  title, 
  value, 
  change, 
  icon: Icon, 
  color = 'blue',
  trend = 'up'
 }: {
  title: string;
  value: string | number;
  change?: number;
  icon: any;
  color?: string;
  trend?: 'up' | 'down';
}) {
  const [count, setCount] = useState(0);
  const targetCount = typeof value === 'number' ? value : parseFloat(value.replace(/[^0-9.-]/g, ''));

  useEffect(() => {
    if (typeof value !== 'number') return;

    const duration = 2000;
    const steps = 60;
    const increment = targetCount / steps;
    let current = 0;

    const timer = setInterval(() => {
      current += increment;
      if (current >= targetCount) {
        current = targetCount;
        clearInterval(timer);
      }
      setCount(Math.round(current));
    }, duration / steps);

    return () => clearInterval(timer);
  }, [targetCount]);

  const colorClasses: Record<string, string> = {
    blue: 'bg-blue-500/10 text-blue-600 border-blue-200',
    cyan: 'bg-cyan-500/10 text-cyan-600 border-cyan-200',
    yellow: 'bg-yellow-500/10 text-yellow-600 border-yellow-200',
    red: 'bg-red-500/10 text-red-600 border-red-200',
    purple: 'bg-purple-500/10 text-purple-600 border-purple-200',
  };

  const displayValue = typeof value === 'number' ? count.toLocaleString() : value;

  return (
    <AnimatedCard hover className={colorClasses[color]}>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-gray-600">{title}</p>
          <p className="text-2xl font-bold text-gray-900">{displayValue}</p>
          {change !== undefined && (
            <div className={`flex items-center mt-1 text-sm ${
              change >= 0 ? 'text-cyan-600' : 'text-red-600'
            }`}>
              <span className="inline-block mr-1">
                {trend === 'up' ? '↗' : '↘'}
              </span>
              {Math.abs(change).toFixed(1)}%
            </div>
          )}
        </div>
        <div className={`p-3 rounded-full ${colorClasses[color]}`}>
          <Icon className="w-6 h-6" />
        </div>
      </div>
    </AnimatedCard>
  );
}

export function AnimatedListItem({ 
  item, 
  index, 
  onDelete, 
  onEdit 
 }: {
  item: any;
  index: number;
  onDelete?: () => void;
  onEdit?: () => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [actionsVisible, setActionsVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setIsVisible(true);
    }, index * 100);

    return () => clearTimeout(timer);
  }, [index]);

  return (
    <div
      className={`
        flex items-center justify-between p-4 border-b border-gray-100 last:border-0
        transition-all duration-500 ease-out
        ${isVisible ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'}
        hover:bg-gray-50
      `}
      onMouseEnter={() => setActionsVisible(true)}
      onMouseLeave={() => setActionsVisible(false)}
    >
      <div className="flex items-center space-x-4">
        <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
          <span className="text-blue-600 font-medium text-sm">
            {item.name?.charAt(0)?.toUpperCase() || 'U'}
          </span>
        </div>
        <div>
          <p className="text-sm font-medium text-gray-900">{item.name}</p>
          <p className="text-xs text-gray-500">{item.email || item.phone}</p>
        </div>
      </div>
      
      <div className={`
        flex items-center space-x-2 transition-all duration-300
        ${actionsVisible ? 'opacity-100' : 'opacity-0'}
      `}>
        {onEdit && (
          <Button variant="outline" size="sm" onClick={onEdit}>
            Editar
          </Button>
        )}
        {onDelete && (
          <Button variant="destructive" size="sm" onClick={onDelete}>
            Eliminar
          </Button>
        )}
      </div>
    </div>
  );
}

export function PulseBadge({ children, variant = 'default' }: { 
  children: React.ReactNode; 
  variant?: 'default' | 'success' | 'warning' | 'error';
}) {
  const [isPulsing, setIsPulsing] = useState(true);

  const variantClasses = {
    default: 'bg-blue-100 text-blue-800',
    success: 'bg-cyan-100 text-cyan-800',
    warning: 'bg-yellow-100 text-yellow-800',
    error: 'bg-red-100 text-red-800',
  };

  return (
    <Badge 
      className={`
        ${variantClasses[variant]}
        ${isPulsing ? 'animate-pulse' : ''}
        transition-all duration-300
      `}
      onAnimationEnd={() => setIsPulsing(false)}
    >
      {children}
    </Badge>
  );
}

export function LoadingSkeleton({ lines = 3, className = '' }: { 
  lines?: number; 
  className?: string;
}) {
  return (
    <div className={`space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, index) => (
        <div
          key={index}
          className={`
            h-4 bg-gray-200 rounded animate-pulse
            ${index === lines - 1 ? 'w-3/4' : 'w-full'}
          `}
          style={{
            animationDelay: `${index * 0.1}s`,
          }}
        />
      ))}
    </div>
  );
}

export function SlideInPanel({ 
  isOpen, 
  onClose, 
  children, 
  title 
 }: {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
    } else {
      const timer = setTimeout(() => setIsAnimating(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  if (!isOpen && !isAnimating) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`
          fixed inset-0 bg-black bg-opacity-50 z-40 transition-opacity duration-300
          ${isOpen ? 'opacity-100' : 'opacity-0'}
        `}
        onClick={onClose}
      />
      
      {/* Panel */}
      <div
        className={`
          fixed right-0 top-0 h-full w-96 bg-white shadow-xl z-50 transition-transform duration-300
          ${isOpen ? 'translate-x-0' : 'translate-x-full'}
        `}
      >
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
            <Button variant="ghost" size="icon" onClick={onClose}>
              ×
            </Button>
          </div>
        </div>
        
        <div className="p-6 overflow-y-auto h-full pb-32">
          {children}
        </div>
      </div>
    </>
  );
}
