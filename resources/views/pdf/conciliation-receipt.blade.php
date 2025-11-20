<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Recibo de Pago</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: Arial, sans-serif;
            font-size: 11px;
            padding: 10mm;
            background: white;
        }
        
        .header {
            text-align: center;
            margin-bottom: 10px;
        }
        
        .logo {
            width: 60px;
            height: 60px;
            margin: 0 auto 5px;
        }
        
        .company-name {
            font-size: 14px;
            font-weight: bold;
            margin-bottom: 3px;
        }
        
        .client-info {
            margin-bottom: 10px;
        }
        
        .client-name {
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 3px;
        }
        
        .balance {
            font-size: 10px;
        }
        
        .ticket-section {
            background: #f5f5f5;
            padding: 8px;
            margin-bottom: 10px;
            border-radius: 3px;
        }
        
        .ticket-title {
            font-size: 10px;
            font-weight: bold;
            margin-bottom: 5px;
        }
        
        .ticket-details {
            display: table;
            width: 100%;
        }
        
        .ticket-row {
            display: table-row;
        }
        
        .ticket-label {
            display: table-cell;
            font-size: 10px;
            padding: 2px 0;
        }
        
        .ticket-value {
            display: table-cell;
            text-align: right;
            font-size: 10px;
            padding: 2px 0;
        }
        
        .transactions-table {
            width: 100%;
            border-collapse: collapse;
            margin: 10px 0;
        }
        
        .transactions-table th {
            background: #f5f5f5;
            padding: 5px;
            text-align: left;
            font-size: 9px;
            font-weight: bold;
            border-bottom: 1px solid #ddd;
        }
        
        .transactions-table td {
            padding: 5px;
            font-size: 10px;
            border-bottom: 1px solid #eee;
        }
        
        .amount-negative {
            color: #d32f2f;
        }
        
        .footer {
            text-align: center;
            margin-top: 15px;
            font-size: 10px;
            font-weight: bold;
        }
        
        .text-right {
            text-align: right;
        }
    </style>
</head>
<body>
    <div class="header">
        @if($logo_data)
            <div class="logo">
                <img src="data:image/png;base64,{{ $logo_data }}" alt="Logo" style="width: 100%; height: 100%;">
            </div>
        @endif
        <div class="company-name">TicoCast</div>
    </div>

    <div class="client-info">
        <div class="client-name">Cliente: {{ $client_name }}</div>
        <div class="balance">Balance actual: {{ $currency }} {{ number_format($balance, 2) }}</div>
    </div>

    <div class="ticket-section">
        <div class="ticket-title">*** Ticket ***</div>
        <div class="ticket-details">
            <div class="ticket-row">
                <div class="ticket-label">Saldo Inicial:</div>
                <div class="ticket-value">{{ number_format($initial_balance, 2) }}</div>
            </div>
            <div class="ticket-row">
                <div class="ticket-label">Total Transacciones:</div>
                <div class="ticket-value">{{ number_format($total_transactions, 2) }}</div>
            </div>
            <div class="ticket-row">
                <div class="ticket-label">Saldo Final:</div>
                <div class="ticket-value">{{ number_format($final_balance, 2) }}</div>
            </div>
        </div>
    </div>

    <table class="transactions-table">
        <thead>
            <tr>
                <th>Fecha</th>
                <th>Concepto</th>
                <th class="text-right">Monto</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>{{ $date }}</td>
                <td>{{ $concept }}</td>
                <td class="text-right amount-negative">{{ number_format(-$amount, 2) }}</td>
            </tr>
        </tbody>
    </table>

    <div class="footer">
        TicoCast
    </div>
</body>
</html>
