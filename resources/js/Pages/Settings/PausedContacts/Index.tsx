import AuthenticatedLayout from '@/Layouts/AuthenticatedLayout';
import { Head } from '@inertiajs/react';
import { useEffect, useState } from 'react';

interface PausedContact {
  id: number;
  client_id: number;
  whatsapp_number: string;
  reason?: string | null;
  client?: { id: number; name: string } | null;
  created_at?: string;
}

export default function PausedContactsIndex() {
  const [contacts, setContacts] = useState<PausedContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [phone, setPhone] = useState('');
  const [clientId, setClientId] = useState<number | ''>('');
  const [reason, setReason] = useState('');

  const fetchList = async () => {
    setLoading(true);
    try {
      const resp = await fetch('/api/paused-contacts', { credentials: 'include' });
      const data = await resp.json();
      if (data.success) setContacts(data.data);
    } catch (err) {
      console.error('Error fetching paused contacts', err);
      alert('Error cargando contactos pausados');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchList();
  }, []);

  const pause = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone && !clientId) {
      alert('Proporcione un número de WhatsApp o seleccione un cliente');
      return;
    }

    const payload: any = {
      client_id: clientId || null,
      whatsapp_number: phone,
      reason: reason || null,
    };

    try {
      const resp = await fetch('/api/paused-contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload),
      });
      const data = await resp.json();
      if (data.success) {
        alert('Contacto pausado correctamente');
        setPhone('');
        setReason('');
        setClientId('');
        fetchList();
      } else {
        alert('Error al pausar contacto: ' + (data.message || resp.statusText));
      }
    } catch (err) {
      console.error(err);
      alert('Error al pausar contacto');
    }
  };

  const resume = async (c: PausedContact) => {
    if (!confirm('¿Reanudar este contacto para que el bot vuelva a enviarle mensajes?')) return;
    try {
      const resp = await fetch(`/api/paused-contacts/${c.client_id}/${encodeURIComponent(c.whatsapp_number)}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await resp.json().catch(() => ({}));
      if (resp.ok) {
        alert('Contacto reanudado');
        fetchList();
      } else {
        alert('Error reanudando: ' + (data.message || resp.statusText));
      }
    } catch (err) {
      console.error(err);
      alert('Error reanudando contacto');
    }
  };

  return (
    <AuthenticatedLayout>
      <Head title="Contactos pausados" />
      <div className="py-6">
        <div className="mx-auto max-w-4xl sm:px-6 lg:px-8">
          <div className="bg-white shadow rounded-lg p-4 mb-6">
            <h3 className="text-lg font-medium">Pausar contacto</h3>
            <p className="text-sm text-gray-500">Agregue un número de WhatsApp o seleccione un cliente para pausar el bot para ese contacto.</p>
            <form onSubmit={pause} className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-3">
              <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="Número WhatsApp (ej: 50685551234)" className="col-span-1 rounded border px-3 py-2" />
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Motivo (opcional)" className="col-span-1 rounded border px-3 py-2" />
              <div className="col-span-1">
                <button type="submit" className="inline-flex items-center rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white hover:bg-red-700">Pausar</button>
              </div>
            </form>
          </div>

          <div className="bg-white shadow rounded-lg p-4">
            <h3 className="text-lg font-medium">Contactos pausados</h3>
            <div className="mt-3">
              {loading ? (
                <div>Cargando...</div>
              ) : contacts.length === 0 ? (
                <div className="text-sm text-gray-500">No hay contactos pausados</div>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="py-2 px-3 text-left">Contacto</th>
                      <th className="py-2 px-3 text-left">Número</th>
                      <th className="py-2 px-3 text-left">Motivo</th>
                      <th className="py-2 px-3 text-right">Acción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map(c => (
                      <tr key={c.id} className="border-b hover:bg-gray-50">
                        <td className="py-2 px-3">{c.client?.name ?? '—'}</td>
                        <td className="py-2 px-3">{c.whatsapp_number}</td>
                        <td className="py-2 px-3">{c.reason ?? '-'}</td>
                        <td className="py-2 px-3 text-right">
                          <button onClick={() => resume(c)} className="inline-flex items-center rounded-md bg-indigo-600 px-3 py-1 text-sm font-medium text-white hover:bg-indigo-700">Reanudar</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      </div>
    </AuthenticatedLayout>
  );
}
