import React, { useEffect, useRef } from 'react';
import { Card } from '../ui/card';
import { formatCurrency } from '@/lib/utils';

interface PaymentData {
  month: string;
  revenue: number;
  payments: number;
  verified: number;
  unverified: number;
}

interface PaymentChartProps {
  data: PaymentData[];
  title?: string;
  type?: 'revenue' | 'count' | 'status';
}

export default function PaymentChart({ data, title = 'Ingresos por Mes', type = 'revenue' }: PaymentChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !data.length) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const padding = 40;
    const width = canvas.width - padding * 2;
    const height = canvas.height - padding * 2;

    // Find max value for scaling
    let maxValue = 0;
    if (type === 'revenue') {
      maxValue = Math.max(...data.map(d => d.revenue));
    } else if (type === 'count') {
      maxValue = Math.max(...data.map(d => d.payments));
    } else {
      maxValue = Math.max(...data.map(d => d.verified + d.unverified));
    }

    if (maxValue === 0) maxValue = 1;

    // Draw axes
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    // Draw grid lines
    ctx.strokeStyle = '#f3f4f6';
    ctx.setLineDash([5, 5]);
    for (let i = 0; i <= 5; i++) {
      const y = padding + (height / 5) * i;
      ctx.beginPath();
      ctx.moveTo(padding, y);
      ctx.lineTo(canvas.width - padding, y);
      ctx.stroke();

      // Y-axis labels
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'right';
      const value = Math.round(maxValue * (1 - i / 5));
      const label = type === 'revenue' ? formatCurrency(value) : value.toString();
      ctx.fillText(label, padding - 10, y + 4);
    }
    ctx.setLineDash([]);

    const barWidth = width / (data.length * 2 + 1);
    const spacing = barWidth;

    if (type === 'status') {
      // Draw stacked bars for verified/unverified
      data.forEach((item, index) => {
        const x = padding + spacing + index * (barWidth * 2 + spacing);
        
        // Verified bar
        const verifiedHeight = (item.verified / maxValue) * height;
        const verifiedY = canvas.height - padding - verifiedHeight;
        
        ctx.fillStyle = '#10b981';
        ctx.fillRect(x, verifiedY, barWidth, verifiedHeight);

        // Unverified bar
        const unverifiedHeight = (item.unverified / maxValue) * height;
        const unverifiedY = verifiedY - unverifiedHeight;
        
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(x, unverifiedY, barWidth, unverifiedHeight);

        // X-axis labels
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.month, x + barWidth / 2, canvas.height - padding + 20);
      });
    } else {
      // Draw single bars
      data.forEach((item, index) => {
        const x = padding + spacing + index * (barWidth * 2 + spacing);
        const value = type === 'revenue' ? item.revenue : item.payments;
        const barHeight = (value / maxValue) * height;
        const y = canvas.height - padding - barHeight;

        // Gradient fill
        const gradient = ctx.createLinearGradient(0, y, 0, canvas.height - padding);
        gradient.addColorStop(0, '#3b82f6');
        gradient.addColorStop(1, '#1d4ed8');
        ctx.fillStyle = gradient;
        
        ctx.fillRect(x, y, barWidth, barHeight);

        // X-axis labels
        ctx.fillStyle = '#6b7280';
        ctx.font = '12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(item.month, x + barWidth / 2, canvas.height - padding + 20);
      });
    }

    // Add legend for status chart
    if (type === 'status') {
      const legendY = 20;
      
      // Verified legend
      ctx.fillStyle = '#10b981';
      ctx.fillRect(canvas.width - 150, legendY, 15, 15);
      ctx.fillStyle = '#374151';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText('Verificados', canvas.width - 130, legendY + 12);

      // Unverified legend
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(canvas.width - 150, legendY + 25, 15, 15);
      ctx.fillText('Pendientes', canvas.width - 130, legendY + 37);
    }

  }, [data, type]);

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      <div className="relative h-64">
        <canvas
          ref={canvasRef}
          width={800}
          height={256}
          className="w-full h-full"
        />
        {!data.length && (
          <div className="absolute inset-0 flex items-center justify-center">
            <p className="text-gray-500">No hay datos disponibles</p>
          </div>
        )}
      </div>
    </Card>
  );
}
