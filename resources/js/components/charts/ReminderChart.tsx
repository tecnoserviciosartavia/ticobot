import React, { useEffect, useRef } from 'react';
import { Card } from '../ui/card';
import { Badge } from '../ui/badge';

interface ReminderData {
  date: string;
  sent: number;
  pending: number;
  failed: number;
  acknowledged: number;
}

interface ReminderChartProps {
  data: ReminderData[];
  title?: string;
  type?: 'line' | 'bar' | 'pie';
}

export default function ReminderChart({ data, title = 'Estado de Recordatorios', type = 'bar' }: ReminderChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!canvasRef.current || !data.length) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (type === 'pie') {
      drawPieChart(ctx, canvas, data);
    } else if (type === 'line') {
      drawLineChart(ctx, canvas, data);
    } else {
      drawBarChart(ctx, canvas, data);
    }

  }, [data, type]);

  const drawBarChart = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, data: ReminderData[]) => {
    const padding = 40;
    const width = canvas.width - padding * 2;
    const height = canvas.height - padding * 2;

    // Calculate totals for each status
    const totals = data.reduce((acc, item) => ({
      sent: acc.sent + item.sent,
      pending: acc.pending + item.pending,
      failed: acc.failed + item.failed,
      acknowledged: acc.acknowledged + item.acknowledged,
    }), { sent: 0, pending: 0, failed: 0, acknowledged: 0 });

    const maxValue = Math.max(totals.sent, totals.pending, totals.failed, totals.acknowledged);
    if (maxValue === 0) return;

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
      ctx.fillText(Math.round(maxValue * (1 - i / 5)).toString(), padding - 10, y + 4);
    }
    ctx.setLineDash([]);

    const groupWidth = width / data.length;
    const barWidth = groupWidth / 5;

    data.forEach((item, index) => {
      const x = padding + index * groupWidth + barWidth / 2;

      // Sent bar
      const sentHeight = (item.sent / maxValue) * height;
      const sentY = canvas.height - padding - sentHeight;
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(x, sentY, barWidth, sentHeight);

      // Pending bar
      const pendingHeight = (item.pending / maxValue) * height;
      const pendingY = sentY - pendingHeight;
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x + barWidth, pendingY, barWidth, pendingHeight);

      // Failed bar
      const failedHeight = (item.failed / maxValue) * height;
      const failedY = pendingY - failedHeight;
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(x + barWidth * 2, failedY, barWidth, failedHeight);

      // Acknowledged bar
      const acknowledgedHeight = (item.acknowledged / maxValue) * height;
      const acknowledgedY = failedY - acknowledgedHeight;
      ctx.fillStyle = '#10b981';
      ctx.fillRect(x + barWidth * 3, acknowledgedY, barWidth, acknowledgedHeight);

      // X-axis labels
      ctx.fillStyle = '#6b7280';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.date, x + barWidth * 2, canvas.height - padding + 20);
    });

    // Add legend
    const legendY = 20;
    const legends = [
      { color: '#3b82f6', label: 'Enviados' },
      { color: '#f59e0b', label: 'Pendientes' },
      { color: '#ef4444', label: 'Fallidos' },
      { color: '#10b981', label: 'Confirmados' },
    ];

    legends.forEach((legend, index) => {
      const legendX = canvas.width - 180 + index * 45;
      ctx.fillStyle = legend.color;
      ctx.fillRect(legendX, legendY, 12, 12);
      ctx.fillStyle = '#374151';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(legend.label, legendX + 6, legendY + 20);
    });
  };

  const drawLineChart = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, data: ReminderData[]) => {
    const padding = 40;
    const width = canvas.width - padding * 2;
    const height = canvas.height - padding * 2;

    // Calculate totals and find max value
    const totals = data.map(item => item.sent + item.pending + item.failed + item.acknowledged);
    const maxValue = Math.max(...totals);
    if (maxValue === 0) return;

    // Draw axes and grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding, padding);
    ctx.lineTo(padding, canvas.height - padding);
    ctx.lineTo(canvas.width - padding, canvas.height - padding);
    ctx.stroke();

    // Draw lines for each status
    const statuses = [
      { key: 'sent', color: '#3b82f6', label: 'Enviados' },
      { key: 'pending', color: '#f59e0b', label: 'Pendientes' },
      { key: 'failed', color: '#ef4444', label: 'Fallidos' },
      { key: 'acknowledged', color: '#10b981', label: 'Confirmados' },
    ];

    statuses.forEach(status => {
      ctx.strokeStyle = status.color;
      ctx.lineWidth = 2;
      ctx.beginPath();

      data.forEach((item, index) => {
        const x = padding + (index / (data.length - 1)) * width;
        const value = item[status.key as keyof ReminderData] as number;
        const y = canvas.height - padding - (value / maxValue) * height;

        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }

        // Draw point
        ctx.fillStyle = status.color;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      });

      ctx.stroke();
    });

    // Add legend
    const legendY = 20;
    statuses.forEach((status, index) => {
      const legendX = canvas.width - 180 + index * 45;
      ctx.fillStyle = status.color;
      ctx.fillRect(legendX, legendY, 12, 12);
      ctx.fillStyle = '#374151';
      ctx.font = '11px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(status.label, legendX + 6, legendY + 20);
    });
  };

  const drawPieChart = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, data: ReminderData[]) => {
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = Math.min(centerX, centerY) - 40;

    // Calculate totals
    const totals = data.reduce((acc, item) => ({
      sent: acc.sent + item.sent,
      pending: acc.pending + item.pending,
      failed: acc.failed + item.failed,
      acknowledged: acc.acknowledged + item.acknowledged,
    }), { sent: 0, pending: 0, failed: 0, acknowledged: 0 });

    const total = totals.sent + totals.pending + totals.failed + totals.acknowledged;
    if (total === 0) return;

    const segments = [
      { value: totals.sent, color: '#3b82f6', label: 'Enviados' },
      { value: totals.pending, color: '#f59e0b', label: 'Pendientes' },
      { value: totals.failed, color: '#ef4444', label: 'Fallidos' },
      { value: totals.acknowledged, color: '#10b981', label: 'Confirmados' },
    ];

    let currentAngle = -Math.PI / 2;

    segments.forEach(segment => {
      if (segment.value === 0) return;

      const sliceAngle = (segment.value / total) * Math.PI * 2;

      // Draw slice
      ctx.fillStyle = segment.color;
      ctx.beginPath();
      ctx.moveTo(centerX, centerY);
      ctx.arc(centerX, centerY, radius, currentAngle, currentAngle + sliceAngle);
      ctx.closePath();
      ctx.fill();

      // Draw label
      const labelAngle = currentAngle + sliceAngle / 2;
      const labelX = centerX + Math.cos(labelAngle) * (radius * 0.7);
      const labelY = centerY + Math.sin(labelAngle) * (radius * 0.7);

      ctx.fillStyle = 'white';
      ctx.font = 'bold 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const percentage = Math.round((segment.value / total) * 100);
      ctx.fillText(`${percentage}%`, labelX, labelY);

      currentAngle += sliceAngle;
    });

    // Add legend
    const legendY = canvas.height - 30;
    segments.forEach((segment, index) => {
      const legendX = 50 + index * 120;
      ctx.fillStyle = segment.color;
      ctx.fillRect(legendX, legendY, 12, 12);
      ctx.fillStyle = '#374151';
      ctx.font = '12px sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(`${segment.label} (${segment.value})`, legendX + 20, legendY + 10);
    });
  };

  // Calculate summary stats
  const totals = data.reduce((acc, item) => ({
    sent: acc.sent + item.sent,
    pending: acc.pending + item.pending,
    failed: acc.failed + item.failed,
    acknowledged: acc.acknowledged + item.acknowledged,
  }), { sent: 0, pending: 0, failed: 0, acknowledged: 0 });

  const total = totals.sent + totals.pending + totals.failed + totals.acknowledged;
  const successRate = total > 0 ? Math.round((totals.acknowledged / total) * 100) : 0;

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <div className="flex items-center space-x-4">
          <Badge variant="success" className="bg-green-100 text-green-800">
            {successRate}% éxito
          </Badge>
          <select 
            value={type} 
            onChange={(e) => {/* Handle type change */}}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="bar">Barras</option>
            <option value="line">Líneas</option>
            <option value="pie">Pastel</option>
          </select>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="text-center">
          <p className="text-2xl font-bold text-blue-600">{totals.sent}</p>
          <p className="text-sm text-gray-600">Enviados</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-green-600">{totals.acknowledged}</p>
          <p className="text-sm text-gray-600">Confirmados</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-yellow-600">{totals.pending}</p>
          <p className="text-sm text-gray-600">Pendientes</p>
        </div>
        <div className="text-center">
          <p className="text-2xl font-bold text-red-600">{totals.failed}</p>
          <p className="text-sm text-gray-600">Fallidos</p>
        </div>
      </div>

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
